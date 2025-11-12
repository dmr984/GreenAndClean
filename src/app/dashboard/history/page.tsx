"use client";

import * as React from "react";
import { useFirestore } from "@/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CalendarCheck, Hourglass, TrendingUp } from "lucide-react";


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
    type: string; 
    from: string; 
    to: string; 
    timeFrom?: string; 
    timeTo?: string; 
    status: 'In attesa' | 'Approvata' | 'Rifiutata';
};

const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
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
        ...shifts.filter(s => s.status === 'Approvato').map(s => ({ type: 'shift', date: s.startTime ? new Date(s.startTime) : new Date(), data: s })),
        ...leaveRequests.filter(r => r.status === 'Approvata').map(r => ({ type: 'leave', date: new Date(r.from), data: r }))
    ];

    for (const item of allData) {
        const monthKey = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { workedDays: new Set(), vacationDays: 0, permitMinutes: 0, overtimeMinutes: 0 };
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

            let current = start;
            while (current <= end) {
                const loopMonthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[loopMonthKey]) {
                     monthlyData[loopMonthKey] = { workedDays: new Set(), vacationDays: 0, permitMinutes: 0, overtimeMinutes: 0 };
                }

                if (req.type === 'Ferie') {
                    monthlyData[loopMonthKey].vacationDays += 1;
                } else if (req.type === 'Permesso' && req.timeFrom && req.timeTo) {
                     const [fromHours, fromMinutes] = req.timeFrom.split(':').map(Number);
                     const [toHours, toMinutes] = req.timeTo.split(':').map(Number);
                     const permitStart = new Date(0, 0, 0, fromHours, fromMinutes);
                     const permitEnd = new Date(0, 0, 0, toHours, toMinutes);
                     const diffMillis = permitEnd.getTime() - permitStart.getTime();
                     if(current.toDateString() === start.toDateString()) { // Add permit hours only on the first day of the range
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
    const [userRole, setUserRole] = React.useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
    
    const [allUsers, setAllUsers] = React.useState<AppUser[]>([]);
    const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
    
    const [allShifts, setAllShifts] = React.useState<Shift[]>([]);
    const [allLeaveRequests, setAllLeaveRequests] = React.useState<LeaveRequest[]>([]);
    
    const [loading, setLoading] = React.useState(true);
    const [monthlyStats, setMonthlyStats] = React.useState<ReturnType<typeof processMonthlyData>>({});

    // Load user role and all users
    React.useEffect(() => {
        const storedUser = getFromStorage<{id: string, role: string}>('user', {id: '', role: ''});
        setUserRole(storedUser.role);
        setCurrentUserId(storedUser.id);
        
        if (storedUser.role === 'operator') {
            setSelectedUserId(storedUser.id);
        }

        if (!firestore) return;

        const usersUnsubscribe = onSnapshot(collection(firestore, 'app-users'), (snapshot) => {
            const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser))
                                .filter(u => u.role === 'operator');
            setAllUsers(userList);
        });

        const handleStorageChange = () => {
             setAllShifts(getFromStorage<Shift[]>('shifts', []));
             setAllLeaveRequests(getFromStorage<LeaveRequest[]>('leave-requests', []));
        };
        handleStorageChange(); // Initial load
        window.addEventListener('storage', handleStorageChange);
        
        setLoading(false);

        return () => {
            usersUnsubscribe();
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [firestore]);
    
    // Process data when selected user or data changes
    React.useEffect(() => {
        if (!selectedUserId) {
            setMonthlyStats({});
            return;
        }

        const selectedUser = allUsers.find(u => u.id === selectedUserId) || (userRole === 'operator' ? getFromStorage<AppUser>('user', {} as AppUser) : null);

        if (!selectedUser) return;
        
        const userShifts = allShifts.filter(s => s.userId === selectedUserId);
        const userLeaves = allLeaveRequests.filter(l => l.user === selectedUser.username);

        const stats = processMonthlyData(userShifts, userLeaves, selectedUser);
        setMonthlyStats(stats);
        
    }, [selectedUserId, allUsers, allShifts, allLeaveRequests, userRole]);
    
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
                                    <AccordionTrigger className="text-xl font-semibold">{getMonthName(monthKey)}</AccordionTrigger>
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
    );
}
