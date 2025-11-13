"use client";

import * as React from "react";
import { useFirestore } from "@/firebase";
import { collection, onSnapshot, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CalendarCheck, Hourglass, TrendingUp, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";


type AppUser = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  expectedHours?: number;
};

type Shift = { 
  id: string; 
  userId: string;
  startTime: string | null; 
  endTime: string | null; 
  pauses: { startTime: string; endTime: string | null }[];
  status: 'In attesa' | 'Approvato';
};

type LeaveRequest = { 
    id: string; 
    user: string;
    operatorId: string;
    type: string; 
    from: string; 
    to: string; 
    timeFrom?: string; 
    timeTo?: string; 
    status: 'In attesa' | 'Approvata' | 'Rifiutata';
};

const calculateDuration = (start: string | null, end: string | null, pauses: Shift['pauses']) => {
    if (!start || !end) return { workedMinutes: 0 };
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const pauseMillis = pauses.filter(p => p.endTime).reduce((acc, p) => acc + (new Date(p.endTime!).getTime() - new Date(p.startTime).getTime()), 0);
    const workedMillis = endTime - startTime - pauseMillis;
    return { workedMinutes: Math.floor(workedMillis / 60000) };
};

const formatMinutesToHours = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const processMonthlyData = (shifts: Shift[], leaveRequests: LeaveRequest[], user: AppUser | null) => {
    const monthlyData: { [key: string]: any } = {};

    const allData = [
        ...shifts.filter(s => s.status === 'Approvato' && s.startTime).map(s => ({ type: 'shift', date: new Date(s.startTime!), data: s })),
        ...leaveRequests.filter(r => r.status === 'Approvata').map(r => ({ type: 'leave', date: new Date(r.from), data: r }))
    ];

    for (const item of allData) {
        const monthKey = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { workedDays: new Set(), vacationDays: 0, permitMinutes: 0, overtimeMinutes: 0, sicknessDays: 0 };
        }
        
        if (item.type === 'shift') {
            const shift = item.data as Shift;
            if (shift.startTime) {
                 monthlyData[monthKey].workedDays.add(new Date(shift.startTime).toISOString().split('T')[0]);
                 const { workedMinutes } = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
                 const expectedMinutes = (user?.expectedHours || 0) * 60;
                 const overtime = Math.max(0, workedMinutes - expectedMinutes);
                 monthlyData[monthKey].overtimeMinutes += overtime;
            }
        } else if (item.type === 'leave') {
            const req = item.data as LeaveRequest;
            const start = new Date(req.from);
            const end = new Date(req.to);

            let current = new Date(start);
            while (current <= end) {
                const loopMonthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[loopMonthKey]) {
                     monthlyData[loopMonthKey] = { workedDays: new Set(), vacationDays: 0, permitMinutes: 0, overtimeMinutes: 0, sicknessDays: 0 };
                }

                if (req.type === 'Ferie') {
                    monthlyData[loopMonthKey].vacationDays += 1;
                } else if (req.type === 'Malattia') {
                    monthlyData[loopMonthKey].sicknessDays += 1;
                } else if (req.type === 'Permesso' && req.timeFrom && req.timeTo) {
                     const [fromHours, fromMinutes] = req.timeFrom.split(':').map(Number);
                     const [toHours, toMinutes] = req.timeTo.split(':').map(Number);
                     const permitStart = new Date(0, 0, 0, fromHours, fromMinutes);
                     const permitEnd = new Date(0, 0, 0, toHours, toMinutes);
                     const diffMillis = permitEnd.getTime() - permitStart.getTime();
                     if(current.toDateString() === start.toDateString()) {
                        monthlyData[loopMonthKey].permitMinutes += (diffMillis / (1000 * 60));
                     }
                }
                current.setDate(current.getDate() + 1);
            }
        }
    }
    
    // Convert Set to number
    Object.keys(monthlyData).forEach(key => {
        monthlyData[key].workedDays = monthlyData[key].workedDays.size;
    });

    return monthlyData;
};

const StatCard = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
            <div className="text-muted-foreground">{icon}</div>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

export default function HistoryPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [userRole, setUserRole] = React.useState<string | null>(null);
    
    const [allUsers, setAllUsers] = React.useState<AppUser[]>([]);
    const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
    
    const [allShifts, setAllShifts] = React.useState<Shift[]>([]);
    const [allLeaveRequests, setAllLeaveRequests] = React.useState<LeaveRequest[]>([]);
    
    const [loading, setLoading] = React.useState(true);
    const [monthlyStats, setMonthlyStats] = React.useState<ReturnType<typeof processMonthlyData>>({});

    // State for delete confirmation
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const [deleteTarget, setDeleteTarget] = React.useState<{userId: string, month: string} | null>(null);
    const [confirmationStep, setConfirmationStep] = React.useState(1);
    const [confirmationInput, setConfirmationInput] = React.useState("");

    React.useEffect(() => {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        setUserRole(storedUser.role);
        if (storedUser.role === 'operator') {
            setSelectedUserId(storedUser.id);
        }

        const fetchInitialData = async () => {
            if (!firestore) return;
            setLoading(true);
            try {
                const usersSnapshot = await getDocs(collection(firestore, 'app-users'));
                const userList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser))
                                        .filter(u => u.role === 'operator');

                if (storedUser.role === 'operator') {
                    const currentUser = usersSnapshot.docs.find(doc => doc.id === storedUser.id);
                    if (currentUser) setAllUsers([{id: currentUser.id, ...currentUser.data()} as AppUser]);
                } else {
                    setAllUsers(userList);
                }

                const shiftsSnapshot = await getDocs(collection(firestore, 'shifts'));
                setAllShifts(shiftsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift)));

                const leavesSnapshot = await getDocs(collection(firestore, 'leave-requests'));
                setAllLeaveRequests(leavesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest)));
            } catch (e) {
                console.error("Error fetching history data: ", e);
                toast({ title: "Errore di caricamento", description: "Impossibile caricare i dati per lo storico.", variant: "destructive"});
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, [firestore, toast]);
    
    // Process data when selected user or data changes
    React.useEffect(() => {
        if (!selectedUserId) {
            setMonthlyStats({});
            return;
        }

        const selectedUser = allUsers.find(u => u.id === selectedUserId);
        if (selectedUser) {
            const userShifts = allShifts.filter(s => s.userId === selectedUserId);
            const userLeaves = allLeaveRequests.filter(l => l.operatorId === selectedUserId);

            const stats = processMonthlyData(userShifts, userLeaves, selectedUser);
            setMonthlyStats(stats);
        }
        
    }, [selectedUserId, allUsers, allShifts, allLeaveRequests, firestore]);
    
    const handleDeleteMonthClick = (userId: string, month: string) => {
        setDeleteTarget({userId, month});
        setIsDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        const confirmWord = "ELIMINA";
        if (confirmationInput.toUpperCase() !== confirmWord) {
            toast({ title: "Testo non corretto", variant: "destructive" });
            return;
        }

        if (confirmationStep < 3) {
            setConfirmationStep(prev => prev + 1);
            setConfirmationInput("");
            toast({title: `Conferma ${confirmationStep+1} di 3`});
            return;
        }

        if (!deleteTarget || !firestore) return;

        const { userId, month } = deleteTarget;
        const [year, monthNum] = month.split('-').map(Number);
        
        const batch = writeBatch(firestore);

        const shiftsToDelete = allShifts.filter(s => {
            if (s.userId !== userId || !s.startTime) return false;
            const shiftDate = new Date(s.startTime);
            return shiftDate.getFullYear() === year && (shiftDate.getMonth() + 1) === monthNum;
        });
        shiftsToDelete.forEach(s => batch.delete(doc(firestore, 'shifts', s.id)));

        const leaveRequestsToDelete = allLeaveRequests.filter(l => {
             if (l.operatorId !== userId) return false;
             const leaveDate = new Date(l.from);
             return leaveDate.getFullYear() === year && (leaveDate.getMonth() + 1) === monthNum;
        });
        leaveRequestsToDelete.forEach(l => batch.delete(doc(firestore, 'leave-requests', l.id)));
        
        try {
            await batch.commit();
            toast({ title: "Storico Mese Eliminato", variant: "destructive" });
        } catch (error) {
            toast({ title: "Errore", description: "Impossibile eliminare lo storico.", variant: "destructive" });
        } finally {
            resetDeleteDialog();
        }
    };
    
    const resetDeleteDialog = () => {
        setIsDeleteDialogOpen(false);
        setDeleteTarget(null);
        setConfirmationStep(1);
        setConfirmationInput("");
    };

    const isAdmin = userRole === 'admin';
    const sortedMonths = Object.keys(monthlyStats).sort((a,b) => b.localeCompare(a));
    
    const getMonthName = (monthKey: string) => {
        const [year, month] = monthKey.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
    }

    if (loading) {
        return (
             <div className="p-4 md:p-6 space-y-4">
                <Skeleton className="h-8 w-64" />
                {isAdmin && <Skeleton className="h-10 w-full" />}
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }
    
    return (
        <>
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Storico Attività</h2>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>{isAdmin ? "Storico per Operatore" : "Il Tuo Storico Mensile"}</CardTitle>
                    <CardDescription>
                        {isAdmin ? "Seleziona un operatore per visualizzare il riepilogo mensile delle sue attività." : "Visualizza il riepilogo delle tue attività passate, mese per mese."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {isAdmin && (
                        <div>
                             <label className="text-sm font-medium mb-2 block">Seleziona Operatore</label>
                             <Select onValueChange={setSelectedUserId} value={selectedUserId || undefined}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Scegli un operatore..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {allUsers.map(user => (
                                        <SelectItem key={user.id} value={user.id}>{user.username}</SelectItem>
                                    ))}
                                </SelectContent>
                             </Select>
                        </div>
                    )}
                    
                    {!selectedUserId && isAdmin ? (
                         <div className="text-center text-muted-foreground py-16">Seleziona un operatore per iniziare.</div>
                    ) : sortedMonths.length === 0 ? (
                         <div className="text-center text-muted-foreground py-16">Nessun dato storico disponibile.</div>
                    ) : (
                        <Accordion type="single" collapsible className="w-full" defaultValue={sortedMonths[0]}>
                            {sortedMonths.map(monthKey => {
                                const data = monthlyStats[monthKey];
                                return (
                                <AccordionItem value={monthKey} key={monthKey}>
                                    <AccordionTrigger className="text-xl font-semibold">
                                        <div className="flex items-center justify-between w-full">
                                            <span>{getMonthName(monthKey)}</span>
                                             {isAdmin && selectedUserId && (
                                                <Button variant="ghost" size="icon" className="mr-2" onClick={(e) => { e.stopPropagation(); handleDeleteMonthClick(selectedUserId, monthKey); }}>
                                                    <Trash2 className="h-5 w-5 text-destructive" />
                                                </Button>
                                            )}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4">
                                            <StatCard icon={<CalendarDays className="h-5 w-5"/>} label="Giorni Lavorati" value={data.workedDays} />
                                            <StatCard icon={<TrendingUp className="h-5 w-5"/>} label="Straordinari" value={formatMinutesToHours(data.overtimeMinutes)} />
                                            <StatCard icon={<CalendarCheck className="h-5 w-5"/>} label="Giorni Ferie" value={data.vacationDays} />
                                            <StatCard icon={<Hourglass className="h-5 w-5"/>} label="Ore Permesso" value={formatMinutesToHours(data.permitMinutes)} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                )
                            })}
                        </Accordion>
                    )}

                </CardContent>
             </Card>
        </div>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione è irreversibile. Verranno eliminati tutti i turni e le assenze per <strong>{allUsers.find(u => u.id === deleteTarget?.userId)?.username}</strong> nel mese di <strong>{deleteTarget ? getMonthName(deleteTarget.month) : ''}</strong>.
                        <br/><br/>
                        Per confermare, scrivi <strong>ELIMINA</strong> qui sotto ({confirmationStep}/3).
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <Input 
                    value={confirmationInput}
                    onChange={(e) => setConfirmationInput(e.target.value)}
                    placeholder="Scrivi ELIMINA per confermare"
                />
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={resetDeleteDialog}>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDelete}>
                        {confirmationStep < 3 ? "Conferma" : "Elimina Definitivamente"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
