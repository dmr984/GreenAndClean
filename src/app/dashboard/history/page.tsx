"use client";

import * as React from "react";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { collection, onSnapshot, doc, writeBatch, getDocs, query } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CalendarCheck, Hourglass, TrendingUp, Trash2, User as UserIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

type AppUser = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  location: string;
  expectedHours?: number; // Daily expected hours
};

type Shift = { 
  id: string; 
  userId: string;
  userName: string;
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

const DEFAULT_EXPECTED_HOURS = 3;

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
    if (!user) return monthlyData;

    const allData = [
        ...shifts.filter(s => s.status === 'Approvato' && s.startTime).map(s => ({ type: 'shift', date: new Date(s.startTime!), data: s })),
        ...leaveRequests.filter(r => r.status === 'Approvata').map(r => ({ type: 'leave', date: new Date(r.from), data: r }))
    ];

    for (const item of allData) {
        const monthKey = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { workedDays: new Set(), vacationDays: 0, permitMinutes: 0, overtimeMinutes: 0, sicknessDays: 0, shifts: [] };
        }
        
        if (item.type === 'shift') {
            const shift = item.data as Shift;
            if (shift.startTime) {
                 monthlyData[monthKey].workedDays.add(new Date(shift.startTime).toISOString().split('T')[0]);
                 const { workedMinutes } = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
                 const expectedMinutes = (user?.expectedHours || DEFAULT_EXPECTED_HOURS) * 60;
                 const overtime = Math.max(0, workedMinutes - expectedMinutes);
                 monthlyData[monthKey].overtimeMinutes += overtime;
                 monthlyData[monthKey].shifts.push(shift);
            }
        } else if (item.type === 'leave') {
            const req = item.data as LeaveRequest;
            const start = new Date(req.from);
            const end = new Date(req.to);

            let current = new Date(start);
            while (current <= end) {
                const loopMonthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[loopMonthKey]) {
                     monthlyData[loopMonthKey] = { workedDays: new Set(), vacationDays: 0, permitMinutes: 0, overtimeMinutes: 0, sicknessDays: 0, shifts: [] };
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
        monthlyData[key].shifts.sort((a: Shift, b: Shift) => new Date(b.startTime!).getTime() - new Date(a.startTime!).getTime());
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
        if(!firestore) return;

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        setUserRole(storedUser.role);
        if (storedUser.role === 'operator') {
            setSelectedUserId(storedUser.id);
        }

        const usersQuery = query(collection(firestore, 'app-users'));
        const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
             const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser))
                                        .filter(u => u.role === 'operator');
            if (storedUser.role === 'operator') {
                const currentUser = snapshot.docs.find(doc => doc.id === storedUser.id);
                if (currentUser) setAllUsers([{id: currentUser.id, ...currentUser.data()} as AppUser]);
            } else {
                 setAllUsers(userList.sort((a, b) => a.username.localeCompare(b.username)));
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching users:", error);
            setLoading(false);
        });

        const shiftsQuery = query(collection(firestore, 'shifts'));
        const unsubShifts = onSnapshot(shiftsQuery, (snapshot) => {
            setAllShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift)));
             setLoading(false);
        }, (error) => {
            console.error("Error fetching shifts:", error);
            setLoading(false);
        });

        const leavesQuery = query(collection(firestore, 'leave-requests'));
        const unsubLeaves = onSnapshot(leavesQuery, (snapshot) => {
            setAllLeaveRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest)));
             setLoading(false);
        }, (error) => {
            console.error("Error fetching leaves:", error);
            setLoading(false);
        });

        return () => {
            unsubUsers();
            unsubShifts();
            unsubLeaves();
        }

    }, [firestore]);
    
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
        
    }, [selectedUserId, allUsers, allShifts, allLeaveRequests]);
    
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

        const leaveRequestsToDelete = allLeaveRequests.filter(l => {
             if (l.operatorId !== userId) return false;
             const leaveDate = new Date(l.from);
             return leaveDate.getFullYear() === year && (leaveDate.getMonth() + 1) === monthNum;
        });

        try {
            const shiftsQuery = query(collection(firestore, 'shifts'), ...shiftsToDelete.map(s => doc(firestore, 'shifts', s.id)));
            const shiftsSnapshot = await getDocs(shiftsQuery);
            shiftsSnapshot.forEach(doc => batch.delete(doc.ref));
    
            const leavesQuery = query(collection(firestore, 'leave-requests'), ...leaveRequestsToDelete.map(l => doc(firestore, 'leave-requests', l.id)));
            const leavesSnapshot = await getDocs(leavesQuery);
            leavesSnapshot.forEach(doc => batch.delete(doc.ref));
            
            await batch.commit();
            toast({ title: "Storico Mese Eliminato", variant: "destructive" });
        } catch (error) {
            console.error("Error deleting month history:", error);
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
    const selectedUser = allUsers.find(u => u.id === selectedUserId);
    
    const getMonthName = (monthKey: string) => {
        const [year, month] = monthKey.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
    }

    if (loading && isAdmin && allUsers.length === 0) {
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
                         <div className="text-center text-muted-foreground py-16">
                            <UserIcon className="h-12 w-12 mx-auto text-gray-400" />
                            <p className="mt-4">Seleziona un operatore per iniziare.</p>
                         </div>
                    ) : sortedMonths.length === 0 ? (
                         <div className="text-center text-muted-foreground py-16">Nessun dato storico disponibile per questo operatore.</div>
                    ) : (
                        <Accordion type="single" collapsible className="w-full" defaultValue={sortedMonths.length > 0 ? sortedMonths[0] : undefined}>
                            {sortedMonths.map(monthKey => {
                                const data = monthlyStats[monthKey];
                                return (
                                <AccordionItem value={monthKey} key={monthKey}>
                                    <AccordionTrigger className="text-xl font-semibold hover:no-underline">
                                        <div className="flex items-center justify-between w-full pr-4">
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
                                        {data.shifts && data.shifts.length > 0 && (
                                             <div className="px-4">
                                                <h4 className="font-semibold mb-2">Dettaglio Timbrature</h4>
                                                <div className="border rounded-md">
                                                {data.shifts.map((shift: Shift, index: number) => {
                                                    const { workedMinutes } = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
                                                    return (
                                                    <div key={shift.id} className={`p-3 ${index > 0 ? 'border-t' : ''}`}>
                                                        <div className="flex justify-between items-center">
                                                            <p className="font-semibold">{new Date(shift.startTime!).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'numeric' })}</p>
                                                            <p className="font-mono text-lg font-bold">{formatMinutesToHours(workedMinutes)}</p>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground">
                                                            {new Date(shift.startTime!).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} - {shift.endTime ? new Date(shift.endTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'In corso'}
                                                            {selectedUser?.location && <span className="ml-2">@ {selectedUser.location}</span>}
                                                        </p>
                                                    </div>
                                                    )
                                                })}
                                                </div>
                                             </div>
                                        )}
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
                    <AlertDialogAction onClick={handleConfirmDelete} disabled={confirmationInput.toUpperCase() !== 'ELIMINA'}>
                        {confirmationStep < 3 ? "Conferma" : "Elimina Definitivamente"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
