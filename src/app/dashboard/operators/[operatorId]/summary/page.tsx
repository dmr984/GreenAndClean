'use client';
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Loader2, User, ClipboardList, PackageSearch, ListChecks, Calendar as CalendarIcon, CheckCircle, XCircle, MapPin, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Trash2, Eye, Pencil, AlertCircle, Circle, Archive, Clock, MoreHorizontal, Sun, Moon, Activity, Bed } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, parse, set, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, addDays, subDays, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter, ResponsiveDialogDescription } from '@/components/ui/responsive-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
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
    username: string;
    firstName: string;
    lastName: string;
    workSchedule: WorkSchedule;
};

type Request = {
    id: string; // Document ID of the request
    userId: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'in_attesa' | 'approvato' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    reason?: string;
    createdAt: Timestamp;
    associatedShiftId?: string;
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    latitude?: number;
    longitude?: number;
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
    isOvertime: boolean;
};

type DetailView = {
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario' | 'ordinarie';
    title: string;
    items: Request[] | {date: Date, hours: number, shift: Shift}[];
} | null;

type DayInfo = {
    date: Date;
    status: 'lavorato' | 'straordinario' | 'lavorato/straordinario' | 'ferie' | 'malattia' | 'permesso' | 'futuro' | 'vuoto' | 'ordinario/permesso';
    shift: Shift | null;
}

const addAutomaticBreaks = (events: Timbratura[], operator: Operator | null): Timbratura[] => {
    if (!operator || events.length === 0) return events;

    const shiftDate = events[0].timestamp.toDate();
    const dayName = dayIndexToName[getDay(shiftDate)];
    const dailySchedule = operator.workSchedule[dayName];
    const mandatoryBreakMinutes = dailySchedule?.breakMinutes || 0;
    
    if (mandatoryBreakMinutes <= 0) return events;

    if (!events.some(e => e.type === 'uscita')) return events;
    
    let breakStartEvent = events.find(e => e.type === 'pausa');
    let breakEndEvent = events.find(e => e.type === 'fine_pausa');
    
    const newEvents = [...events];

    if (!breakStartEvent && !breakEndEvent) {
        const autoStartTime = set(shiftDate, { hours: 12, minutes: 30, seconds: 0, milliseconds: 0});
        const autoEndTime = new Date(autoStartTime.getTime() + mandatoryBreakMinutes * 60000);
        
        newEvents.push({ id: 'auto-start', type: 'pausa', timestamp: Timestamp.fromDate(autoStartTime), isAuto: true, status: 'confermata' });
        newEvents.push({ id: 'auto-end', type: 'fine_pausa', timestamp: Timestamp.fromDate(autoEndTime), isAuto: true, status: 'confermata' });
    }
    else if (breakStartEvent && !breakEndEvent) {
         const autoEndTime = new Date(breakStartEvent.timestamp.toDate().getTime() + mandatoryBreakMinutes * 60000);
         newEvents.push({ id: 'auto-end', type: 'fine_pausa', timestamp: Timestamp.fromDate(autoEndTime), isAuto: true, status: 'confermata' });
    }

    return newEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
};

const calculateHours = (shift: Shift | null, operator: Operator | null): { ordinary: number, overtime: number, leave: number, workedMinutes: number } => {
    if (!shift || !operator?.workSchedule || !shift.startTime) return { ordinary: 0, overtime: 0, leave: 0, workedMinutes: 0 };

    const clockInTime = shift.startTime.toDate();
    const clockOutTime = shift.endTime?.toDate();

    if (!clockOutTime) return { ordinary: 0, overtime: 0, leave: 0, workedMinutes: 0 };
    
    const dayName = dayIndexToName[getDay(clockInTime)];
    const schedule = operator.workSchedule[dayName];
    const contractualHours = schedule?.totalHours || 0;
    const contractualMinutes = contractualHours * 60;
    const contractualStartTimeStr = schedule?.startTime || '00:00';
    
    const [contractualH, contractualM] = contractualStartTimeStr.split(':').map(Number);
    const contractualStartDateTime = set(clockInTime, { hours: contractualH, minutes: contractualM, seconds: 0, milliseconds: 0 });

    let calculationStartTime = clockInTime;
    const minutesLate = (clockInTime.getTime() - contractualStartDateTime.getTime()) / (1000 * 60);

    if (minutesLate <= 15) { // Includes clocking in early
        calculationStartTime = contractualStartDateTime;
    } else {
        const nextHalfHour = set(clockInTime, { seconds: 0, milliseconds: 0 });
        if (nextHalfHour.getMinutes() > 30) {
            nextHalfHour.setHours(nextHalfHour.getHours() + 1, 0);
        } else {
            nextHalfHour.setMinutes(30);
        }
        calculationStartTime = nextHalfHour;
    }

    let totalMillis = clockOutTime.getTime() - calculationStartTime.getTime();
    
    let breakDurationMillis = 0;
    let breakStartTs: Timestamp | null = null;
    const augmentedEvents = addAutomaticBreaks(shift.events, operator);
    for (const e of augmentedEvents) {
        if (e.type === 'pausa') breakStartTs = e.timestamp;
        if (e.type === 'fine_pausa' && breakStartTs) {
            breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
            breakStartTs = null;
        }
    }
    totalMillis -= breakDurationMillis;
    const totalMinutesWorked = totalMillis > 0 ? Math.round(totalMillis / (1000 * 60)) : 0;
    
    // Rounding Rules
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

    if (shift.isOvertime) {
        return {
            ordinary: 0,
            overtime: roundOvertimeHours(totalMinutesWorked),
            leave: 0,
            workedMinutes: totalMinutesWorked,
        };
    }
    
    const ordinaryMinutes = Math.min(totalMinutesWorked, contractualMinutes);
    const ordinaryHours = roundOrdinaryHours(ordinaryMinutes);

    const overtimeMinutes = totalMinutesWorked > contractualMinutes ? totalMinutesWorked - contractualMinutes : 0;
    const overtimeHours = roundOvertimeHours(overtimeMinutes);

    const leaveMinutes = contractualMinutes > totalMinutesWorked ? contractualMinutes - totalMinutesWorked : 0;
    const leaveHours = roundOrdinaryHours(leaveMinutes);

    return { 
        ordinary: ordinaryHours, 
        overtime: overtimeHours, 
        leave: leaveHours,
        workedMinutes: totalMinutesWorked,
    };
};

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
            const allRequests = requestsSnap.docs.map(d => d.data() as Request);
            const allTimbrature = timbratureSnap.docs.map(d => ({id: d.id, ...d.data()} as Timbratura));
            
            const approvedRequests = allRequests;
            const confirmedTimbrature = allTimbrature.filter(t => t.status === 'confermata');

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

                const dayTimbrature = confirmedTimbrature
                    .filter(t => isSameDay(t.timestamp.toDate(), day))
                    .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                
                if (dayTimbrature.length > 0) {
                     const startTime = dayTimbrature.find(e => e.type === 'entrata')?.timestamp;

                     if (startTime) {
                        const augmentedEvents = addAutomaticBreaks(dayTimbrature, operator);
                        const endTime = augmentedEvents.find(e => e.type === 'uscita')?.timestamp;
                        let workDuration = 0;
                        
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
                            workDuration = totalMillis > 0 ? totalMillis / (1000 * 60) : 0;
                        }
                        
                        const shift: Shift = {
                            events: augmentedEvents,
                            startTime: startTime!,
                            endTime: endTime || null,
                            workDuration,
                            isOvertime: augmentedEvents[0]?.isOvertime ?? false
                        };
                        dayShift = shift;
                        
                        const { overtime } = calculateHours(shift, operator);
                        const isPureOvertime = shift.isOvertime;
                        const permissionRequest = approvedRequests.find(req => req.type === 'permesso' && isSameDay(day, req.startDate.toDate()));

                        if (isPureOvertime) dayStatus = 'straordinario';
                        else if (permissionRequest) dayStatus = 'ordinario/permesso';
                        else if (overtime > 0) dayStatus = 'lavorato/straordinario';
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
            if (error.code === 'failed-precondition') {
                toast({
                    variant: 'destructive',
                    title: 'Indice mancante in Firestore',
                    description: "La query richiede un indice. Controlla la console per il link di creazione."
                })
            }
            console.error("Error fetching daily summary data:", error);
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
    
    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
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
                        
                        {selectedDay.shift ? (() => {
                            const { ordinary, overtime, workedMinutes } = calculateHours(selectedDay.shift, operator);
                            const contractualHours = (selectedDay.shift.startTime && operator.workSchedule[dayIndexToName[getDay(selectedDay.shift.startTime.toDate())]]?.totalHours) || 0;
                            return (
                                <>
                                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center my-4">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Ore Previste</p>
                                        <p className="text-2xl font-bold">{contractualHours}h</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Ore Lavorate</p>
                                        <p className="text-2xl font-bold">{formatMinutes(workedMinutes)}</p>
                                    </div>
                                     <div>
                                        <p className="text-sm font-medium text-muted-foreground">Ore Ordinarie Calcolate</p>
                                        <p className="text-2xl font-bold">{ordinary}h</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Straordinari Calcolati</p>
                                        <p className="text-2xl font-bold">{overtime}h</p>
                                    </div>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Orario</TableHead><TableHead>Evento</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {selectedDay.shift.events.map((t, index) => (
                                                <TableRow key={t.id || `auto-${index}`}>
                                                    <TableCell className={cn(t.isAuto && "text-red-500")}>{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                                    <TableCell className={cn("capitalize", t.isAuto && "text-red-500")}>{t.type.replace('_', ' ')}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                               </>
                            )
                        })() : (
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


export default function OperatorSummaryPage() {
    const params = useParams();
    const router = useRouter();
    const operatorId = params.operatorId as string;
    const { toast } = useToast();
    const firestore = useFirestore();
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [monthToClean, setMonthToClean] = useState<Date | null>(null);

    const searchParams = useSearchParams();
    const [currentView, setCurrentView] = useState<'monthly' | 'daily'>('daily');
    const [dailyViewDate, setDailyViewDate] = useState(new Date());


    useEffect(() => {
        if (!firestore || !operatorId) return;
        setIsLoading(true);
        const operatorDocRef = doc(firestore, 'app-users', operatorId);
        getDoc(operatorDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            } else {
                toast({ title: 'Errore', description: 'Operatore non trovato', variant: 'destructive'});
            }
            setIsLoading(false);
        });
    }, [firestore, operatorId, toast]);

    const handleCleanMonth = async () => {
        if (!firestore || !operatorId || !monthToClean) return;
        setIsCleaning(true);
    
        const monthStart = startOfMonth(monthToClean);
        const monthEnd = endOfMonth(monthToClean);
    
        try {
            const batch = writeBatch(firestore);
    
            const timbratureQuery = query(
                collection(firestore, `app-users/${operatorId}/timbrature`),
                where('timestamp', '>=', monthStart),
                where('timestamp', '<=', monthEnd)
            );
            const timbratureSnapshot = await getDocs(timbratureQuery);
            timbratureSnapshot.forEach(doc => batch.delete(doc.ref));
    
            const requestsQuery = query(
                collection(firestore, `app-users/${operatorId}/requests`),
                 where('endDate', '>=', monthStart)
            );
            const requestsSnapshot = await getDocs(requestsQuery);
    
            for (const requestDoc of requestsSnapshot.docs) {
                const request = requestDoc.data() as Request;
                const reqStart = request.startDate.toDate();
                const reqEnd = request.endDate.toDate();
    
                if (reqStart > monthEnd) continue;
    
                const ref = requestDoc.ref;
    
                if (reqStart >= monthStart && reqEnd <= monthEnd) {
                    batch.delete(ref);
                    continue;
                }
    
                if (reqStart < monthStart && reqEnd > monthEnd) {
                    batch.update(ref, { endDate: Timestamp.fromDate(subDays(monthStart, 1)) });
                    
                    const { id, ...restOfRequest } = request;
                    const newRequestData = {
                        ...restOfRequest,
                        startDate: Timestamp.fromDate(addDays(monthEnd, 1)),
                        endDate: request.endDate,
                        createdAt: serverTimestamp(),
                        viewedByOperator: false,
                    };
                    const newDocRef = doc(collection(firestore, `app-users/${operatorId}/requests`));
                    batch.set(newDocRef, newRequestData);
                    continue;
                }
    
                if (reqStart >= monthStart && reqStart <= monthEnd && reqEnd > monthEnd) {
                    batch.update(ref, { startDate: Timestamp.fromDate(addDays(monthEnd, 1)) });
                    continue;
                }
    
                if (reqStart < monthStart && reqEnd >= monthStart && reqEnd <= monthEnd) {
                    batch.update(ref, { endDate: Timestamp.fromDate(subDays(monthStart, 1)) });
                    continue;
                }
            }
    
            if (timbratureSnapshot.empty && requestsSnapshot.docs.every(d => d.data().startDate.toDate() > monthEnd)) {
                 toast({ title: 'Nessun dato', description: 'Non ci sono dati da elaborare per questo mese.' });
            } else {
                await batch.commit();
                toast({ title: 'Successo!', description: `I dati di ${format(monthToClean, 'MMMM yyyy', { locale: it })} sono stati elaborati.` });
            }
    
        } catch (error) {
            console.error("Errore durante la pulizia del mese:", error);
            toast({ title: 'Errore', description: 'Impossibile completare l\'elaborazione.', variant: 'destructive' });
        } finally {
            setIsCleaning(false);
            setMonthToClean(null);
        }
    };


    if (isLoading || !operator) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <div className="space-y-6">
                <Card>
                     <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                               <h1 className="text-3xl font-bold tracking-tight">{operator.firstName} {operator.lastName}</h1>
                               <p className="text-muted-foreground">Riepilogo Attività (Codice: {operator.username})</p>
                            </div>
                              <div className="flex gap-2">
                                <Button variant={currentView === 'monthly' ? 'secondary' : 'outline'} onClick={() => setCurrentView('monthly')}>Mensile</Button>
                                <Button variant={currentView === 'daily' ? 'secondary' : 'outline'} onClick={() => setCurrentView('daily')}>Giornaliero</Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                       {currentView === 'monthly' ? (
                            <MonthlySummary 
                                operatorId={operatorId} 
                                operator={operator} 
                                onCleanMonth={(date) => setMonthToClean(date)}
                            />
                       ) : (
                           <DailySummaryContent 
                                operatorId={operatorId} 
                                operator={operator} 
                                initialDate={dailyViewDate}
                                onMonthChange={setDailyViewDate}
                            />
                       )}
                    </CardContent>
                </Card>
            </div>
            <AlertDialog open={!!monthToClean} onOpenChange={(open) => !open && setMonthToClean(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione è irreversibile. Verranno eliminate tutte le timbrature e le porzioni di richieste che cadono nel mese di{' '}
                            <span className="font-bold">{monthToClean ? format(monthToClean, 'MMMM yyyy', { locale: it }) : ''}</span>. Le richieste a cavallo dei mesi verranno modificate.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCleanMonth} disabled={isCleaning}>
                            {isCleaning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Conferma ed Elabora
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Suspense>
    );
}

const MonthlySummary = ({ operatorId, operator, onCleanMonth }: { operatorId: string, operator: Operator, onCleanMonth: (date: Date) => void }) => {
    const firestore = useFirestore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [detailView, setDetailView] = useState<DetailView>(null);
    const [itemToModify, setItemToModify] = useState<{ request: Request, day: Date } | null>(null);
    const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
    const [shiftForDetail, setShiftForDetail] = useState<Shift | null>(null);
    
    const {toast} = useToast();

    useEffect(() => {
        if (!firestore || !operatorId) return;
        setIsLoading(true);

        const startOfMonthValue = startOfMonth(currentDate);
        const endOfMonthValue = endOfMonth(currentDate);

        const requestsQuery = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            where('status', '==', 'approvato')
        );
        
        const timbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', Timestamp.fromDate(startOfMonthValue)),
            where('timestamp', '<=', Timestamp.fromDate(endOfMonthValue))
        );
        
        const unsubRequests = onSnapshot(requestsQuery, s => {
            const allRequests = s.docs.map(d => ({id: d.id, ...d.data()} as Request));
            setRequests(allRequests);
            if (!unsubTimbrature) setIsLoading(false); 
        }, () => setIsLoading(false));

        const unsubTimbrature = onSnapshot(timbratureQuery, s => {
            const allTimbrature = s.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));
            allTimbrature.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            setTimbrature(allTimbrature.filter(t => t.status === 'confermata'));
            if (!unsubRequests) setIsLoading(false); 
        }, (error) => {
            console.error("Error fetching timbrature", error);
            if (error.code === 'failed-precondition') {
                 toast({
                    variant: 'destructive',
                    title: 'Indice mancante in Firestore',
                    description: "La query richiede un indice. Controlla la console per il link di creazione."
                })
            }
            setIsLoading(false);
        });
        
        Promise.all([getDocs(requestsQuery), getDocs(timbratureQuery)]).then(() => setIsLoading(false));


        return () => { 
            unsubRequests(); 
            unsubTimbrature(); 
        };
    }, [firestore, operatorId, currentDate, toast]);
    
    const summary = useMemo(() => {
        const approvedRequests = requests;
        const monthInterval = { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };

        const dailyTimbrature = timbrature.reduce((acc, t) => {
            const dayString = t.timestamp.toDate().toDateString();
            if (!acc[dayString]) acc[dayString] = [];
            acc[dayString].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);
    
        let totalOrdinaryHours = 0;
        let ordinaryHoursByDay: {date: Date, hours: number, shift: Shift}[] = [];

        Object.values(dailyTimbrature).forEach(dayEvents => {
             if (dayEvents.length > 0) {
                 const startTime = dayEvents.find(e => e.type === 'entrata')?.timestamp;
                 const endTime = dayEvents.find(e => e.type === 'uscita')?.timestamp;

                if (startTime && endTime) {
                    const shiftObject: Shift = {
                        events: [...dayEvents],
                        startTime: startTime,
                        endTime: endTime,
                        workDuration: 0, // temp value, calculated inside calculateHours
                        isOvertime: dayEvents.some(e => e.isOvertime)
                    };
                     const { ordinary } = calculateHours(shiftObject, operator);
                     totalOrdinaryHours += ordinary;
                     if(ordinary > 0){
                        ordinaryHoursByDay.push({date: startTime.toDate(), hours: ordinary, shift: shiftObject});
                     }
                }
            }
        });
        
        const totalOvertimeHours = approvedRequests
            .filter(r => r.type === 'straordinario' && isWithinInterval(r.startDate.toDate(), monthInterval))
            .reduce((sum, r) => sum + (r.hours || 0), 0);
    
        let ferieDaysCount = 0;
        let malattiaDaysCount = 0;
        const processedLeaveDays = new Set<string>();
    
        if (operator) {
            approvedRequests.forEach(req => {
                if (req.type === 'ferie' || req.type === 'malattia') {
                    for (let day = new Date(req.startDate.toDate()); day <= req.endDate.toDate(); day.setDate(day.getDate() + 1)) {
                        const dayString = day.toDateString();
                         if (isWithinInterval(day, monthInterval) && !processedLeaveDays.has(dayString)) {
                            const dayName = dayIndexToName[getDay(day)];
                            const contractualHours = operator.workSchedule[dayName]?.totalHours || 0;
                            if (contractualHours > 0) {
                                if (req.type === 'ferie') ferieDaysCount++;
                                if (req.type === 'malattia') malattiaDaysCount++;
                                processedLeaveDays.add(dayString);
                            }
                        }
                    }
                }
            });
        }
    
        return {
            workedDays: Object.keys(dailyTimbrature).length,
            workedHours: totalOrdinaryHours,
            overtimeHours: totalOvertimeHours,
            permessoHours: approvedRequests.filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval)).reduce((sum, r) => sum + (r.hours || 0), 0),
            malattiaDays: malattiaDaysCount,
            ferieDays: ferieDaysCount,
            ordinaryHoursByDay: ordinaryHoursByDay
        };
    }, [timbrature, requests, operator, currentDate]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };
    
    const handleSummaryCardClick = (type: DetailView['type'], title: string) => {
        if (!type) return;

        if (type === 'ordinarie') {
            setDetailView({ type, title, items: summary.ordinaryHoursByDay });
            return;
        }

        const approvedRequests = requests.filter(r => r.type === type && r.status === 'approvato');
        setDetailView({ type, title, items: approvedRequests });
    };
    
    const handleCancelSingleDayOfLeave = async () => {
        if (!firestore || !itemToModify) return;

        const { request, day } = itemToModify;
        const requestRef = doc(firestore, `app-users/${operatorId}/requests`, request.id);
        const requestsCollectionRef = collection(firestore, `app-users/${operatorId}/requests`);

        const startDate = request.startDate.toDate();
        const endDate = request.endDate.toDate();
        const dayToCancel = day;

        try {
            await runTransaction(firestore, async (transaction) => {
                const requestDoc = await transaction.get(requestRef);
                if (!requestDoc.exists()) {
                    throw "Request does not exist!";
                }

                if (isSameDay(startDate, endDate)) {
                    transaction.delete(requestRef);
                    return;
                }

                if (isSameDay(dayToCancel, startDate)) {
                    const newStartDate = addDays(startDate, 1);
                    transaction.update(requestRef, { startDate: Timestamp.fromDate(newStartDate) });
                    return;
                }
                
                if (isSameDay(dayToCancel, endDate)) {
                    const newEndDate = subDays(endDate, 1);
                    transaction.update(requestRef, { endDate: Timestamp.fromDate(newEndDate) });
                    return;
                }

                // Split the request
                const newEndDate1 = subDays(dayToCancel, 1);
                transaction.update(requestRef, { endDate: Timestamp.fromDate(newEndDate1) });

                const newStartDate2 = addDays(dayToCancel, 1);
                
                const { id, ...restOfRequest } = request;

                const newRequestData = {
                    ...restOfRequest, 
                    startDate: Timestamp.fromDate(newStartDate2),
                    endDate: request.endDate,
                    createdAt: serverTimestamp(),
                    viewedByOperator: false,
                };
                
                const newDocRef = doc(requestsCollectionRef);
                transaction.set(newDocRef, newRequestData);
            });
            toast({ title: 'Successo', description: 'Giorno di assenza annullato.' });
             setDetailView(prev => {
                if (!prev) return null;
                 return {
                    ...prev,
                    items: prev.items.filter(item => (item as Request).id !== request.id)
                };
            });

        } catch (err: any) {
             console.error(err);
             toast({ title: 'Errore', description: 'Impossibile annullare il giorno di assenza.', variant: 'destructive' });

        } finally {
            setItemToModify(null);
        }
    };

    const handleDeleteRequest = async () => {
        if (!firestore || !requestToDelete) return;
        const requestRef = doc(firestore, `app-users/${operatorId}/requests`, requestToDelete.id);
        
        try {
            await deleteDoc(requestRef);
            toast({ title: 'Successo', description: 'Richiesta eliminata.' });
            // Refresh the detail view
            setDetailView(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    items: prev.items.filter(item => (item as Request).id !== requestToDelete.id)
                };
            });
        } catch (error) {
            console.error("Error deleting request:", error);
            toast({ title: 'Errore', description: 'Impossibile eliminare la richiesta.', variant: 'destructive' });
        } finally {
            setRequestToDelete(null);
        }
    };
    
    const findShiftForOvertimeRequest = async (request: Request) => {
        if (!firestore || !request.associatedShiftId) {
            toast({ title: "Nessun turno associato a questo straordinario.", variant: "destructive" });
            return;
        };
        
        const startOfDay_ts = Timestamp.fromDate(startOfDay(request.startDate.toDate()));
        const endOfDay_ts = Timestamp.fromDate(endOfDay(request.startDate.toDate()));

        const timbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', startOfDay_ts),
            where('timestamp', '<=', endOfDay_ts)
        );

        const snapshot = await getDocs(timbratureQuery);
        const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Timbratura)).filter(t => t.status === 'confermata');
        
        if (events.length > 0) {
            events.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            let workDuration = 0;
            const startTime = events.find(e => e.type === 'entrata')?.timestamp;
            const endTime = events.find(e => e.type === 'uscita')?.timestamp;

            if (startTime && endTime) {
                let totalMillis = endTime.toMillis() - startTime.toMillis();
                let breakStart: Timestamp | null = null;
                events.forEach(e => {
                    if (e.type === 'pausa') breakStart = e.timestamp;
                    if (e.type === 'fine_pausa' && breakStart) {
                        totalMillis -= (e.timestamp.toMillis() - breakStart.toMillis());
                        breakStart = null;
                    }
                });
                workDuration = totalMillis > 0 ? totalMillis / (1000 * 60) : 0;
            }

            const shift: Shift = {
                events,
                startTime: startTime!,
                endTime,
                workDuration,
                isOvertime: events.some(e => e.isOvertime)
            };
            setShiftForDetail(shift);
        } else {
            toast({ title: "Nessuna timbratura trovata per questo straordinario.", variant: "destructive" });
        }
    };

    const renderDetailTable = () => {
        if (!detailView || detailView.items.length === 0) {
            return <p className="text-center text-muted-foreground py-4">Nessun dato per questo mese.</p>;
        }

        const monthInterval = { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
        
        if (detailView.type === 'ordinarie') {
             const items = detailView.items as {date: Date, hours: number, shift: Shift}[];
             return (
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Giorno</TableHead>
                                <TableHead>Ore Ordinarie</TableHead>
                                <TableHead className="text-right">Dettaglio</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell>{format(item.date, 'PPP', { locale: it })}</TableCell>
                                    <TableCell>{item.hours}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => setShiftForDetail(item.shift)}>
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            );
        }

        if (detailView.type === 'ferie' || detailView.type === 'malattia') {
            const allDays: { day: Date, request: Request }[] = [];
            (detailView.items as Request[]).forEach(item => {
                const interval = { start: item.startDate.toDate(), end: item.endDate.toDate() };
                const daysInInterval = eachDayOfInterval(interval);

                daysInInterval.forEach(day => {
                    if (isWithinInterval(day, monthInterval)) {
                        const dayName = dayIndexToName[getDay(day)];
                        const contractualHours = operator?.workSchedule[dayName]?.totalHours || 0;
                        if (contractualHours > 0) {
                            allDays.push({ day, request: item });
                        }
                    }
                });
            });

            if (allDays.length === 0) {
                return <p className="text-center text-muted-foreground py-4">Nessun giorno di {detailView.type} per questo mese.</p>;
            }

            return (
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Giorno</TableHead>
                                <TableHead className="text-right">Azione</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allDays.map(({ day, request }, index) => (
                                <TableRow key={index}>
                                    <TableCell>{format(day, 'PPP', { locale: it })}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => setItemToModify({ request, day })}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            );
        }

        const filteredItems = (detailView.items as Request[]).filter(item => {
             const start = item.startDate.toDate();
             const end = item.endDate.toDate();
             return isWithinInterval(start, monthInterval) || isWithinInterval(end, monthInterval) || (start < monthInterval.start && end > monthInterval.end);
        });
        
        if (filteredItems.length === 0) {
            return <p className="text-center text-muted-foreground py-4">Nessun dato per questo mese.</p>;
        }

        return (
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Dal</TableHead>
                            <TableHead>Al</TableHead>
                            <TableHead>Ore</TableHead>
                             <TableHead className="text-right">Azione</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredItems.map(item => (
                             <TableRow key={item.id}>
                                <TableCell>{format(item.startDate.toDate(), 'PPP', { locale: it })}</TableCell>
                                <TableCell>{format(item.endDate.toDate(), 'PPP', { locale: it })}</TableCell>
                                <TableCell>{item.hours}</TableCell>
                                <TableCell className="text-right space-x-2">
                                     {detailView.type === 'straordinario' && item.associatedShiftId && (
                                        <Button variant="ghost" size="icon" onClick={() => findShiftForOvertimeRequest(item)}>
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="icon" onClick={() => setRequestToDelete(item)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    };


    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    
    return (
        <>
        <div className="space-y-4">
            <div className="flex justify-between items-center gap-2">
                <Button variant="outline" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                <h4 className="text-lg font-semibold capitalize text-center flex-1">{format(currentDate, 'MMMM yyyy', { locale: it })}</h4>
                <Button variant="outline" onClick={() => handleMonthChange(1)}>Succ.</Button>
                 <Button variant="destructive" size="icon" onClick={() => onCleanMonth(currentDate)}><Archive className="h-4 w-4" /></Button>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle><Briefcase className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedDays}</div></CardContent>
                </Card>
                <Card
                  onClick={() => handleSummaryCardClick('ordinarie', 'Dettaglio Ore Ordinarie')}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ore Ordinarie</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedHours.toLocaleString('it-IT')}</div></CardContent>
                </Card>
                <Card
                  onClick={() => handleSummaryCardClick('straordinario', 'Dettaglio Straordinari')}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ore Straordinarie</CardTitle><Plus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.overtimeHours.toLocaleString('it-IT')}</div></CardContent></Card>
                <Card
                  onClick={() => handleSummaryCardClick('ferie', 'Dettaglio Ferie')}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle><Plane className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.ferieDays}</div></CardContent></Card>
                <Card
                    onClick={() => handleSummaryCardClick('permesso', 'Dettaglio Permessi')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle><UserCheck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.permessoHours}</div></CardContent></Card>
                <Card
                    onClick={() => handleSummaryCardClick('malattia', 'Dettaglio Malattia')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle><Stethoscope className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.malattiaDays}</div></CardContent></Card>
            </div>
        </div>

        <ResponsiveDialog open={!!detailView} onOpenChange={() => setDetailView(null)}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>{detailView?.title}</ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        Riepilogo delle voci per {format(currentDate, 'MMMM yyyy', { locale: it })}.
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                 <div className="py-4">
                    {renderDetailTable()}
                </div>
                 <ResponsiveDialogFooter>
                     <Button variant="outline" onClick={() => setDetailView(null)}>Chiudi</Button>
                </ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
        
        {shiftForDetail && (
             <ResponsiveDialog open={!!shiftForDetail} onOpenChange={() => setShiftForDetail(null)}>
                <ResponsiveDialogContent className="sm:max-w-xl">
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Dettaglio Timbratura</ResponsiveDialogTitle>
                         {shiftForDetail.startTime && <ResponsiveDialogDescription>Turno del {format(shiftForDetail.startTime.toDate(), 'PPP', { locale: it })}</ResponsiveDialogDescription>}
                    </ResponsiveDialogHeader>
                    {(() => {
                        const { ordinary, overtime, workedMinutes } = calculateHours(shiftForDetail, operator);
                        const contractualHours = (shiftForDetail.startTime && operator?.workSchedule[dayIndexToName[getDay(shiftForDetail.startTime.toDate())]]?.totalHours) || 0;
                        const formatMinutes = (minutes: number) => {
                            if (isNaN(minutes) || minutes < 0) return '00:00';
                            const h = Math.floor(minutes / 60);
                            const m = Math.round(minutes % 60);
                            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        };
                        return (
                            <>
                                <div className="grid grid-cols-3 gap-4 text-center my-4">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Ore Previste</p>
                                        <p className="text-2xl font-bold">{contractualHours}h</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Ore Lavorate</p>
                                        <p className="text-2xl font-bold">{formatMinutes(workedMinutes)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Straordinari</p>
                                        <p className="text-2xl font-bold">{overtime}h</p>
                                    </div>
                                </div>
                                <div className="overflow-x-auto mt-4">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Orario</TableHead><TableHead>Evento</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {shiftForDetail.events.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis()).map(t => (
                                                <TableRow key={t.id}>
                                                    <TableCell>{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                                    <TableCell className='capitalize'>{t.type.replace('_', ' ')}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        )
                    })()}
                     <ResponsiveDialogFooter>
                         <Button variant="outline" onClick={() => setShiftForDetail(null)}>Chiudi</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>
        )}


         <AlertDialog open={!!itemToModify} onOpenChange={(open) => !open && setItemToModify(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Annullare il giorno di assenza?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Questa azione renderà il giorno selezionato nuovamente lavorativo. L'operatore dovrà timbrare normally.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Chiudi</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelSingleDayOfLeave}>Annulla Giorno di Assenza</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        
         <AlertDialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare la richiesta?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Sei sicuro di voler eliminare questa richiesta? L'azione è permanente.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteRequest}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
};
