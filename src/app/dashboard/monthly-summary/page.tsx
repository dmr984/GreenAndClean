'use client';
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, Timestamp, onSnapshot, doc, getDoc, getDocs, writeBatch, addDoc, serverTimestamp, runTransaction, deleteDoc, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Calendar as CalendarIcon, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Loader2, List, Clock, X, Eye, Trash2, Pencil, Archive, PackageSearch, Activity, Moon, Sun, Bed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription, ResponsiveDialogFooter } from '@/components/ui/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, getDay, set, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, startOfDay, endOfDay, addDays, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number;
};

type WorkSchedule = {
    [key in DayOfWeek]?: DailySchedule;
};


type Operator = {
    id: string;
    workSchedule: WorkSchedule;
    username: string;
};

type Request = {
    id: string;
    userId: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'in_attesa' | 'approvato' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number; // Only for 'permesso' and 'straordinario'
    reason: string;
};

type Timbratura = {
    id: string;
    userId: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    isOvertime?: boolean;
    isAuto?: boolean;
};

type StraordinarioEvent = {
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
};

type StraordinarioShift = {
    id: string;
    events: StraordinarioEvent[];
    status: 'in_corso' | 'in_attesa_di_approvazione' | 'approvato' | 'rifiutato';
    date: Timestamp;
};

type Shift = {
    events: Timbratura[];
    startTime: Timestamp;
    endTime: Timestamp | null;
    workDuration: number; // in minutes
    isOvertime?: boolean;
};


type DetailView = {
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    title: string;
    items: Request[];
} | null;

type DayInfo = {
    date: Date;
    status: 'lavorato' | 'straordinario' | 'lavorato/straordinario' | 'ferie' | 'malattia' | 'permesso' | 'futuro' | 'vuoto' | 'ordinario/permesso';
    shift: Shift | null;
}

const DailySummaryContent = ({ operatorId, operator, initialDate, onMonthChange }: { operatorId: string, operator: Operator, initialDate: Date, onMonthChange: (date: Date) => void }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(initialDate);
    const [monthData, setMonthData] = useState<DayInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<DayInfo | null>(null);

    useEffect(() => {
        if (!firestore || !operatorId || !operator) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        const timbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', Timestamp.fromDate(monthStart)),
            where('timestamp', '<=', Timestamp.fromDate(monthEnd))
        );

        const requestsQuery = query(
            collection(firestore, `app-users/${operatorId}/requests`),
             where('status', '==', 'approvato')
        );

        const unsub = onSnapshot(timbratureQuery, async (timbratureSnap) => {
            const requestsSnap = await getDocs(requestsQuery);
            let allRequests = requestsSnap.docs.map(d => d.data() as Request);
            let allTimbrature = timbratureSnap.docs.map(d => ({id: d.id, ...d.data()} as Timbratura));
            allTimbrature.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());


            const approvedRequests = allRequests;
            const timbrature = allTimbrature.filter(t => t.status === 'confermata');

            const daysOfMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
            const today = startOfDay(new Date());

            const processedData: DayInfo[] = daysOfMonth.map(day => {
                let dayStatus: DayInfo['status'] = 'vuoto';
                let dayShift: Shift | null = null;
                
                if (day > today) {
                    dayStatus = 'futuro';
                }

                const leaveRequest = approvedRequests.find(req => {
                    const reqStart = startOfDay(req.startDate.toDate());
                    const reqEnd = endOfDay(req.endDate.toDate());
                    return (req.type === 'ferie' || req.type === 'malattia') && isWithinInterval(day, { start: reqStart, end: reqEnd });
                });
                
                if (leaveRequest) {
                    dayStatus = leaveRequest.type;
                }

                const dayTimbrature = timbrature.filter(t => isSameDay(t.timestamp.toDate(), day));
                if (dayTimbrature.length > 0) {
                     const startTime = dayTimbrature.find(e => e.type === 'entrata')?.timestamp;

                     if (startTime) {
                        let workDuration = 0;
                        const augmentedEvents = addAutomaticBreaksToShiftDetail({ events: dayTimbrature } as any, operator);
                        const endTime = augmentedEvents.find(e => e.type === 'uscita')?.timestamp;
                        
                        if (endTime) {
                            let totalMillis = endTime.toMillis() - startTime.toMillis();
                            let breakStart: Timestamp | null = null;
                            augmentedEvents.forEach(e => {
                                if (e.type === 'pausa') breakStart = e.timestamp;
                                if (e.type === 'fine_pausa' && breakStart) {
                                    totalMillis -= (e.timestamp.toMillis() - breakStart.toMillis());
                                    breakStart = null;
                                }
                            });
                            workDuration = totalMillis / (1000 * 60);
                        }
                        
                        const shift: Shift = {
                            events: augmentedEvents,
                            startTime: startTime!,
                            endTime: endTime || null,
                            workDuration,
                            isOvertime: augmentedEvents[0]?.isOvertime ?? false
                        };
                        dayShift = shift;

                        const hasOvertime = (calculateShiftHours(shift).overtime > 0);
                        const isPureOvertime = shift.isOvertime;
                        const permissionRequest = approvedRequests.find(req => req.type === 'permesso' && isSameDay(day, req.startDate.toDate()));

                        if (isPureOvertime) dayStatus = 'straordinario';
                        else if (permissionRequest) dayStatus = 'ordinario/permesso';
                        else if (hasOvertime) dayStatus = 'lavorato/straordinario';
                        else dayStatus = 'lavorato';
                     }
                }
                
                const permissionRequest = approvedRequests.find(req => req.type === 'permesso' && isSameDay(day, req.startDate.toDate()));
                if(permissionRequest && dayTimbrature.length === 0) dayStatus = 'permesso';


                return { date: day, status: dayStatus, shift: dayShift };
            });
            setMonthData(processedData);
            setIsLoading(false);
        }, (error) => {
            // Firestore error can be for missing index
             if (error.code === 'failed-precondition') {
                toast({
                    variant: 'destructive',
                    title: 'Indice mancante in Firestore',
                    description: "La query richiede un indice. Controlla la console per il link di creazione."
                })
             }
             console.error("Error loading daily summary", error);
             setIsLoading(false);
        });

        return () => unsub();
    }, [firestore, operatorId, operator, currentMonth, toast]);

    const handleMonthNav = (offset: number) => {
        const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
        setCurrentMonth(newMonth);
        onMonthChange(newMonth);
        setSelectedDay(null);
    };
    
    const getStatusInfo = (status: DayInfo['status']): { badge: React.ReactNode, icon: React.ReactNode, text: string } => {
        switch (status) {
            case 'lavorato': return { badge: <Badge variant="secondary">Ordinario</Badge>, icon: <Sun className="h-5 w-5 text-yellow-500" />, text: "Giorno Lavorativo" };
            case 'straordinario': return { badge: <Badge className="bg-amber-500 text-white">Straordinario</Badge>, icon: <Moon className="h-5 w-5 text-amber-500" />, text: "Straordinario" };
            case 'lavorato/straordinario': return { badge: <Badge className="bg-blue-500 text-white">Ordinario/Straordinario</Badge>, icon: <Activity className="h-5 w-5 text-blue-500" />, text: "Ordinario/Straordinario" };
            case 'ordinario/permesso': return { badge: <Badge className="bg-cyan-500 text-white">Ordinario/Permesso</Badge>, icon: <UserCheck className="h-5 w-5 text-cyan-500" />, text: "Ordinario con Permesso" };
            case 'ferie': return { badge: <Badge className="bg-green-500 text-white">Ferie</Badge>, icon: <Plane className="h-5 w-5 text-green-500" />, text: "Giorno di Ferie" };
            case 'malattia': return { badge: <Badge className="bg-red-600 text-white">Malattia</Badge>, icon: <Stethoscope className="h-5 w-5 text-red-600" />, text: "Giorno di Malattia" };
            case 'permesso': return { badge: <Badge className="bg-yellow-500 text-white">Permesso</Badge>, icon: <UserCheck className="h-5 w-5 text-yellow-500" />, text: "Permesso Orario" };
            case 'futuro': return { badge: <Badge variant="outline">-</Badge>, icon: <Clock className="h-5 w-5 text-muted-foreground" />, text: "Giorno Futuro" };
            default: return { badge: <Badge variant="outline">Vuoto</Badge>, icon: <Bed className="h-5 w-5 text-muted-foreground" />, text: "Nessuna attività registrata" };
        }
    };
    
    const calculateShiftHours = (shift: Shift | null): { ordinary: number, overtime: number } => {
        if (!shift || !operator?.workSchedule || !shift.startTime) return { ordinary: 0, overtime: 0 };
    
        const contractualHours = (operator.workSchedule[dayIndexToName[getDay(shift.startTime.toDate())]]?.totalHours || 0);
        const totalMinutesWorked = Math.round(shift.workDuration);

        const roundOrdinaryHours = (minutes: number): number => {
            if (minutes <= 0) return 0;
            const totalHalfHours = Math.floor(minutes / 30);
            const remainingMinutes = minutes % 30;
            return (totalHalfHours / 2) + (remainingMinutes >= 25 ? 0.5 : 0);
        };

        const roundOvertimeHours = (minutes: number): number => {
            if (minutes <= 0) return 0;
            const totalHours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return totalHours + (remainingMinutes >= 50 ? 1 : 0);
        };
        
        if (shift.isOvertime) { // Pure overtime shift
            return { ordinary: 0, overtime: roundOvertimeHours(totalMinutesWorked) };
        }

        const contractualMinutes = contractualHours * 60;
        if (totalMinutesWorked > contractualMinutes) {
            const overtimeMinutes = totalMinutesWorked - contractualMinutes;
            return { 
                ordinary: roundOrdinaryHours(contractualMinutes),
                overtime: roundOvertimeHours(overtimeMinutes), 
            };
        } else {
            return { 
                ordinary: roundOrdinaryHours(totalMinutesWorked), 
                overtime: 0, 
            };
        }
    };
    
    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const addAutomaticBreaksToShiftDetail = (day: DayInfo | null, operator: Operator | null): Timbratura[] => {
        if (!day?.shift || !operator) return day?.shift?.events || [];
    
        const shift = day.shift;

        if(!shift.startTime) return shift.events;

        const shiftDate = shift.startTime.toDate();
        const dayName = dayIndexToName[getDay(shiftDate)];
        const dailySchedule = operator.workSchedule[dayName];
        const mandatoryBreakMinutes = dailySchedule?.breakMinutes || 0;
    
        if (mandatoryBreakMinutes <= 0 || !shift.endTime) {
            return shift.events;
        }
    
        let breakStartEvent = shift.events.find(e => e.type === 'pausa');
        let breakEndEvent = shift.events.find(e => e.type === 'fine_pausa');
        
        const newEvents = [...shift.events];
    
        // Case 1: No break taken at all
        if (!breakStartEvent && !breakEndEvent) {
            const autoStartTime = set(shiftDate, { hours: 12, minutes: 30, seconds: 0, milliseconds: 0});
            const autoEndTime = new Date(autoStartTime.getTime() + mandatoryBreakMinutes * 60000);
            
            newEvents.push({ id: 'auto-start', type: 'pausa', timestamp: Timestamp.fromDate(autoStartTime), isAuto: true, status: 'confermata', userId: operator.id });
            newEvents.push({ id: 'auto-end', type: 'fine_pausa', timestamp: Timestamp.fromDate(autoEndTime), isAuto: true, status: 'confermata', userId: operator.id });
        }
        // Case 2: Started break but didn't end it
        else if (breakStartEvent && !breakEndEvent) {
             const autoEndTime = new Date(breakStartEvent.timestamp.toDate().getTime() + mandatoryBreakMinutes * 60000);
             newEvents.push({ id: 'auto-end', type: 'fine_pausa', timestamp: Timestamp.fromDate(autoEndTime), isAuto: true, status: 'confermata', userId: operator.id });
        }
    
        return newEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    };

    return (
        <div className="space-y-4">
             <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                <Button variant="outline" size="sm" onClick={() => handleMonthNav(-1)}>Prec.</Button>
                <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                <Button variant="outline" size="sm" onClick={() => handleMonthNav(1)}>Succ.</Button>
            </div>
            
            <div className="overflow-x-auto">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="px-2">Data</TableHead>
                                <TableHead className="px-2">Stato</TableHead>
                                <TableHead className="text-right px-2">Dettagli</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {monthData.map((day) => {
                                const isSunday = getDay(day.date) === 0;
                                return (
                                <TableRow key={day.date.toString()} className={cn(isSunday && "text-red-500")}>
                                    <TableCell className="px-2 font-medium">
                                        <span className='capitalize'>{format(day.date, 'eee dd/MM/yy', { locale: it })}</span>
                                    </TableCell>
                                    <TableCell className="px-2">{getStatusInfo(day.status).badge}</TableCell>
                                    <TableCell className="text-right px-2">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => setSelectedDay(day)}
                                            disabled={day.status === 'vuoto' || day.status === 'futuro'}
                                        >
                                            <Eye className="h-5 w-5"/>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                    </Table>
                )}
            </div>

              {selectedDay && (
                <ResponsiveDialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
                    <ResponsiveDialogContent className="max-w-2xl">
                        <ResponsiveDialogHeader>
                            <ResponsiveDialogTitle>Dettaglio del {format(selectedDay.date, 'PPP', { locale: it })}</ResponsiveDialogTitle>
                            <div className="flex items-center gap-2 pt-2 text-muted-foreground">
                                {getStatusInfo(selectedDay.status).icon}
                                <span>{getStatusInfo(selectedDay.status).text}</span>
                            </div>
                        </ResponsiveDialogHeader>
                        
                        {selectedDay.shift ? (
                            <>
                             <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center my-4">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Ore Previste</p>
                                    <p className="text-2xl font-bold">{selectedDay.shift.startTime ? (operator.workSchedule[dayIndexToName[getDay(selectedDay.shift.startTime.toDate())]]?.totalHours || 0) : 0}h</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Ore Lavorate</p>
                                    <p className="text-2xl font-bold">{formatMinutes(selectedDay.shift.workDuration)}</p>
                                </div>
                                 <div>
                                    <p className="text-sm font-medium text-muted-foreground">Ore Ordinarie Calcolate</p>
                                    <p className="text-2xl font-bold">{calculateShiftHours(selectedDay.shift).ordinary}h</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Straordinari Calcolati</p>
                                    <p className="text-2xl font-bold">{calculateShiftHours(selectedDay.shift).overtime}h</p>
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Orario</TableHead><TableHead>Evento</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {addAutomaticBreaksToShiftDetail(selectedDay, operator).map((t, index) => (
                                            <TableRow key={t.id || `auto-${index}`}>
                                                <TableCell className={cn(t.isAuto && "text-red-500")}>{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                                <TableCell className={cn("capitalize", t.isAuto && "text-red-500")}>{t.type.replace('_', ' ')}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                           </>
                        ) : (
                            <div className="py-8 text-center text-muted-foreground">Nessun turno registrato per questo giorno.</div>
                        )}
                        <ResponsiveDialogFooter className="pt-4">
                            <Button variant="outline" onClick={() => setSelectedDay(null)}>Chiudi</Button>
                        </ResponsiveDialogFooter>
                    </ResponsiveDialogContent>
                </ResponsiveDialog>
            )}

        </div>
    )
};


export default function MonthlySummaryPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [operatorData, setOperatorData] = useState<Operator | null>(null);

    const searchParams = useSearchParams();
    const initialView = searchParams.get('view') === 'daily' ? 'daily' : 'monthly';
    const [currentView, setCurrentView] = useState<'monthly' | 'daily'>('daily');

    const getInitialDate = () => {
        const month = searchParams.get('month');
        const year = searchParams.get('year');
        if (month && year) {
            return new Date(parseInt(year), parseInt(month) - 1, 1);
        }
        return new Date();
    };
    const [dailyViewDate, setDailyViewDate] = useState(getInitialDate());


    useEffect(() => {
        if (!firestore || !user?.id) return;

        const fetchOperatorData = async () => {
            const operatorDocRef = doc(firestore, `app-users/${user.id}`);
            const docSnap = await getDoc(operatorDocRef);
            if (docSnap.exists()) {
                setOperatorData({ id: docSnap.id, ...docSnap.data() } as Operator);
            } else {
                toast({ title: "Errore", description: "Impossibile trovare i dati dell'operatore.", variant: "destructive" });
            }
        };
        fetchOperatorData();
    }, [firestore, user, toast]);
    
    if (isUserLoading || !operatorData) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Utente non trovato. Effettua nuovamente il login.</p>
            </div>
        );
    }

    const MonthlyView = () => {
        // This component is kept for future re-integration of monthly summary if needed.
        // For now, it's just a placeholder or could show a simplified summary.
        return <div>Riepilogo Mensile non ancora implementato.</div>
    }

    return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>

            <Card>
                <CardHeader>
                    <div className="flex flex-col items-start gap-4">
                        <div>
                            <CardTitle>Riepilogo Attività di {operatorData.username}</CardTitle>
                            <CardDescription>Visualizza il riepilogo giornaliero delle attività.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <DailySummaryContent 
                        operatorId={user.id} 
                        operator={operatorData} 
                        initialDate={dailyViewDate}
                        onMonthChange={setDailyViewDate} 
                    />
                </CardContent>
            </Card>
        </Suspense>
    );
}
