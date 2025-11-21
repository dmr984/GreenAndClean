'use client';
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, Timestamp, onSnapshot, doc, getDoc, getDocs, writeBatch, addDoc, serverTimestamp, runTransaction, deleteDoc, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Calendar as CalendarIcon, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Loader2, List, Clock, X, Eye, Trash2, Pencil, Archive, PackageSearch } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
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
    status: 'lavorato' | 'straordinario' | 'lavorato/straordinario' | 'ferie' | 'malattia' | 'permesso' | 'futuro' | 'vuoto';
    shift: Shift | null;
}

const DailySummaryContent = ({ operatorId, operator, initialDate, onMonthChange }: { operatorId: string, operator: Operator, initialDate: Date, onMonthChange: (date: Date) => void }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(initialDate);
    const [monthData, setMonthData] = useState<DayInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<DayInfo | null>(null);
    const [shiftDetail, setShiftDetail] = useState<Shift | null>(null);


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
            where('timestamp', '<=', Timestamp.fromDate(monthEnd)),
            where('status', '==', 'confermata')
        );

        const requestsQuery = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            where('status', '==', 'approvato')
        );

        const unsub = onSnapshot(timbratureQuery, async (timbratureSnap) => {
            const requestsSnap = await getDocs(requestsQuery);
            const approvedRequests = requestsSnap.docs.map(d => d.data() as Request);
            const timbrature = timbratureSnap.docs.map(d => d.data() as Timbratura).sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

            const daysOfMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
            const today = startOfDay(new Date());

            const processedData: DayInfo[] = daysOfMonth.map(day => {
                let dayStatus: DayInfo['status'] = 'vuoto';
                let dayShift: Shift | null = null;
                
                if (day > today) {
                    dayStatus = 'futuro';
                }

                // Check for leave/sickness first
                const leaveRequest = approvedRequests.find(req => {
                    const reqStart = startOfDay(req.startDate.toDate());
                    const reqEnd = endOfDay(req.endDate.toDate());
                    return (req.type === 'ferie' || req.type === 'malattia') && isWithinInterval(day, { start: reqStart, end: reqEnd });
                });
                
                if (leaveRequest) {
                    dayStatus = leaveRequest.type;
                }

                // Check for clockings if not on leave
                const dayTimbrature = timbrature.filter(t => isSameDay(t.timestamp.toDate(), day));
                if (dayTimbrature.length > 0) {
                     let workDuration = 0;
                     const startTime = dayTimbrature.find(e => e.type === 'entrata')?.timestamp;
                     const endTime = dayTimbrature.find(e => e.type === 'uscita')?.timestamp;
                     
                     if (startTime && endTime) {
                         let totalMillis = endTime.toMillis() - startTime.toMillis();
                         let breakStart: Timestamp | null = null;
                         dayTimbrature.forEach(e => {
                             if (e.type === 'pausa') breakStart = e.timestamp;
                             if (e.type === 'fine_pausa' && breakStart) {
                                 totalMillis -= (e.timestamp.toMillis() - breakStart.toMillis());
                                 breakStart = null;
                             }
                         });
                         workDuration = totalMillis / (1000 * 60);
                     }
                    
                    const shift: Shift = {
                        events: dayTimbrature,
                        startTime: startTime!,
                        endTime: endTime || null,
                        workDuration,
                        isOvertime: dayTimbrature[0]?.isOvertime
                    };
                    dayShift = shift;

                    const hasOvertime = (calculateShiftHours(shift).overtime > 0);
                    const isPureOvertime = shift.isOvertime || (operator.workSchedule[dayIndexToName[getDay(day)]] || 0) === 0;

                    if (isPureOvertime) dayStatus = 'straordinario';
                    else if (hasOvertime) dayStatus = 'lavorato/straordinario';
                    else dayStatus = 'lavorato';
                }
                
                const permissionRequest = approvedRequests.find(req => req.type === 'permesso' && isSameDay(day, req.startDate.toDate()));
                if(permissionRequest) dayStatus = 'permesso';


                return { date: day, status: dayStatus, shift: dayShift };
            });
            setMonthData(processedData);
            setIsLoading(false);
        });

        return () => unsub();
    }, [firestore, operatorId, operator, currentMonth]);

    const handleMonthNav = (offset: number) => {
        const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
        setCurrentMonth(newMonth);
        onMonthChange(newMonth);
        setSelectedDay(null);
    };
    
    const getStatusBadge = (status: DayInfo['status']) => {
        switch (status) {
            case 'lavorato': return <Badge variant="secondary">Ordinario</Badge>;
            case 'straordinario': return <Badge className="bg-amber-500 text-white">Straordinario</Badge>;
            case 'lavorato/straordinario': return <Badge className="bg-blue-500 text-white">Ordinario/Straordinario</Badge>;
            case 'ferie': return <Badge className="bg-green-500 text-white">Ferie</Badge>;
            case 'malattia': return <Badge className="bg-red-600 text-white">Malattia</Badge>;
            case 'permesso': return <Badge className="bg-yellow-500 text-white">Permesso</Badge>;
            default: return <Badge variant="outline"> - </Badge>;
        }
    };
    
    const calculateShiftHours = (shift: Shift | null): { ordinary: number, overtime: number } => {
        if (!shift || !operator?.workSchedule) return { ordinary: 0, overtime: 0 };
    
        const contractualHours = (operator.workSchedule[dayIndexToName[getDay(shift.startTime.toDate())]] || 0);
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

    return (
        <div className="space-y-4">
             <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                <Button variant="outline" size="sm" onClick={() => handleMonthNav(-1)}>Prec.</Button>
                <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                <Button variant="outline" size="sm" onClick={() => handleMonthNav(1)}>Succ.</Button>
            </div>
             <div className="flex flex-col lg:flex-row gap-6">
                <Card className="w-full lg:w-1/3">
                    <CardHeader><CardTitle>Giorni del Mese</CardTitle></CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                        ) : (
                            <ScrollArea className="h-[500px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data</TableHead>
                                            <TableHead>Stato</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {monthData.map((day) => (
                                            <TableRow 
                                                key={day.date.toString()} 
                                                onClick={() => setSelectedDay(day)}
                                                className={cn("cursor-pointer", isSameDay(day.date, selectedDay?.date || new Date(0)) && "bg-muted")}
                                            >
                                                <TableCell>{format(day.date, 'dd/MM/yy')}</TableCell>
                                                <TableCell>{getStatusBadge(day.status)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        )}
                    </CardContent>
                </Card>
                <Card className="flex-1">
                    <CardHeader>
                        <CardTitle>Dettaglio Giorno</CardTitle>
                        <CardDescription>
                            {selectedDay ? format(selectedDay.date, 'PPP', { locale: it }) : 'Seleziona un giorno dalla lista'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!selectedDay ? (
                            <div className="flex items-center justify-center h-64 text-muted-foreground">Seleziona un giorno per vedere i dettagli.</div>
                        ) : selectedDay.shift ? (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-semibold text-lg">Turno di Lavoro</h4>
                                    <Button variant="ghost" size="icon" onClick={() => setShiftDetail(selectedDay.shift)}><Eye className="h-5 w-5"/></Button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                     <div className="p-4 bg-muted/50 rounded-md">
                                        <p className="text-sm font-medium text-muted-foreground">Inizio</p>
                                        <p className="text-lg font-semibold">{format(selectedDay.shift.startTime.toDate(), 'HH:mm')}</p>
                                    </div>
                                    <div className="p-4 bg-muted/50 rounded-md">
                                        <p className="text-sm font-medium text-muted-foreground">Fine</p>
                                        <p className="text-lg font-semibold">{selectedDay.shift.endTime ? format(selectedDay.shift.endTime.toDate(), 'HH:mm') : 'In corso'}</p>
                                    </div>
                                </div>
                                <Table>
                                    <TableBody>
                                        {selectedDay.shift.events.map(event => (
                                            <TableRow key={event.id}>
                                                <TableCell className="capitalize font-medium">{event.type.replace('_', ' ')}</TableCell>
                                                <TableCell>{format(event.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant={event.status === 'confermata' ? 'secondary' : 'default'}>{event.status}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
                                {getStatusBadge(selectedDay.status)}
                                <p className="font-medium text-lg text-center">Nessuna attività registrata per questo giorno.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
             </div>

              {shiftDetail && (
                <ResponsiveDialog open={!!shiftDetail} onOpenChange={() => setShiftDetail(null)}>
                    <ResponsiveDialogContent>
                        <ResponsiveDialogHeader>
                            <ResponsiveDialogTitle>Dettaglio Turno</ResponsiveDialogTitle>
                            {shiftDetail.startTime && <ResponsiveDialogDescription>Turno del {format(shiftDetail.startTime.toDate(), 'PPP', {locale: it})}</ResponsiveDialogDescription>}
                        </ResponsiveDialogHeader>
                         <div className="grid grid-cols-3 gap-4 text-center my-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Ore Previste</p>
                                <p className="text-2xl font-bold">{operator.workSchedule[dayIndexToName[getDay(shiftDetail.startTime.toDate())]] || 0}h</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Ore Lavorate</p>
                                <p className="text-2xl font-bold">{formatMinutes(shiftDetail.workDuration)}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Straordinari</p>
                                <p className="text-2xl font-bold">{calculateShiftHours(shiftDetail).overtime}h</p>
                            </div>
                        </div>
                        <ScrollArea className="max-h-64">
                            <Table>
                                <TableHeader><TableRow><TableHead>Orario</TableHead><TableHead>Evento</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {shiftDetail.events.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis()).map(t => (
                                        <TableRow key={t.id}>
                                            <TableCell>{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                            <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                        <ResponsiveDialogFooter className="pt-4">
                            <Button variant="outline" onClick={() => setShiftDetail(null)}>Chiudi</Button>
                        </ResponsiveDialogFooter>
                    </ResponsiveDialogContent>
                </ResponsiveDialog>
            )}

        </div>
    )
}

export default function MonthlySummaryPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [operatorData, setOperatorData] = useState<Operator | null>(null);

    const searchParams = useSearchParams();
    const initialView = searchParams.get('view') === 'daily' ? 'daily' : 'monthly';
    const [currentView, setCurrentView] = useState<'monthly' | 'daily'>(initialView);

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
