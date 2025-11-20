'use client';
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, Timestamp, onSnapshot, doc, getDoc, getDocs, writeBatch, addDoc, serverTimestamp, runTransaction, deleteDoc } from 'firebase/firestore';
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
import { Calendar as DayPickerCalendar } from '@/components/ui/calendar';

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


const OperatorDailySummaryContent = ({ operatorId, initialDate, operator }: { operatorId: string, initialDate: Date, operator: Operator }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
    const [currentMonth, setCurrentMonth] = useState(initialDate);
    const [dailyShifts, setDailyShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [detailShift, setDetailShift] = useState<Shift | null>(null);

    const [workedDays, setWorkedDays] = useState<Date[]>([]);
    const [leaveDays, setLeaveDays] = useState<{ferie: Date[], malattia: Date[], permesso: Date[], straordinario: Date[]}>({ ferie: [], malattia: [], permesso: [], straordinario: [] });
    const [selectedDayInfo, setSelectedDayInfo] = useState<'ferie' | 'malattia' | 'permesso' | 'straordinario' | null>(null);

    const { startOfPeriod, endOfPeriod } = useMemo(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        return {
            startOfPeriod: Timestamp.fromDate(start),
            endOfPeriod: Timestamp.fromDate(end),
        };
    }, [currentMonth]);

    useEffect(() => {
        if (!firestore || !operatorId || !operator) return;

        const monthlyTimbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', startOfPeriod),
            where('timestamp', '<=', endOfPeriod),
        );

        const unsubTimbrature = onSnapshot(monthlyTimbratureQuery, (snapshot) => {
            const allTimbrature = snapshot.docs.map(doc => doc.data() as {type: string, timestamp: Timestamp, status: string});
            const confirmedTimbrature = allTimbrature.filter(data => data.status === 'confermata');
            
            const dailyEvents = confirmedTimbrature.reduce((acc, t) => {
                const day = format(t.timestamp.toDate(), 'yyyy-MM-dd');
                if (!acc[day]) acc[day] = [];
                acc[day].push(t.type);
                return acc;
            }, {} as Record<string, string[]>);

            const validWorkedDays: Date[] = [];
            for (const dayStr in dailyEvents) {
                const events = dailyEvents[dayStr];
                if (events.includes('entrata') && events.includes('uscita')) {
                    validWorkedDays.push(new Date(dayStr + 'T12:00:00'));
                }
            }
            setWorkedDays(validWorkedDays);
        });

        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`));

        const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(currentMonth);
            const ferie: Date[] = [];
            const malattia: Date[] = [];
            const permesso: Date[] = [];
            const straordinario: Date[] = [];

            const approvedRequests = snapshot.docs.map(doc => doc.data() as Request).filter(req => req.status === 'approvato');

            approvedRequests.forEach(req => {
                const startReq = req.startDate.toDate();
                const endReq = req.endDate.toDate();

                for (let day = new Date(startReq); day <= endReq; day.setDate(day.getDate() + 1)) {
                     if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                        const dayOfWeekIndex = getDay(day);
                        const dayName = dayIndexToName[dayOfWeekIndex];
                        const contractualHours = operator.workSchedule[dayName] || 0;

                        if (req.type === 'ferie' && contractualHours > 0) ferie.push(new Date(day));
                        if (req.type === 'malattia' && contractualHours > 0) malattia.push(new Date(day));
                        if (req.type === 'permesso') permesso.push(new Date(day));
                        if (req.type === 'straordinario') straordinario.push(new Date(day));
                    }
                }
            });
            setLeaveDays({ ferie, malattia, permesso, straordinario });
        });

        return () => {
            unsubTimbrature();
            unsubRequests();
        };
    }, [firestore, operatorId, startOfPeriod, endOfPeriod, currentMonth, operator]);

    useEffect(() => {
        if (!firestore || !operatorId || !selectedDate) {
            setIsLoading(false);
            setDailyShifts([]);
            setSelectedDayInfo(null);
            return;
        }
        setIsLoading(true);
        let dayInfo: 'ferie' | 'malattia' | 'permesso' | 'straordinario' | null = null;
        if (leaveDays.ferie.some(d => isSameDay(d, selectedDate))) dayInfo = 'ferie';
        else if (leaveDays.malattia.some(d => isSameDay(d, selectedDate))) dayInfo = 'malattia';
        else if (leaveDays.permesso.some(d => isSameDay(d, selectedDate))) dayInfo = 'permesso';

        const isExtraDay = leaveDays.straordinario.some(d => isSameDay(d, selectedDate));
        const isWorkedDay = workedDays.some(d => isSameDay(d, selectedDate));

        if (isExtraDay && !isWorkedDay) {
           dayInfo = 'straordinario';
        }

        setSelectedDayInfo(dayInfo);

        if (dayInfo && dayInfo !== 'straordinario') {
            setDailyShifts([]);
            setIsLoading(false);
            return;
        }

        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        const fetchDailyData = async () => {
            const timbratureQuery = query(
                collection(firestore, `app-users/${operatorId}/timbrature`),
                where('timestamp', '>=', Timestamp.fromDate(start)),
                where('timestamp', '<=', Timestamp.fromDate(end))
            );
            
            try {
                const timbratureSnapshot = await getDocs(timbratureQuery);

                const timbratureDelGiorno = timbratureSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Timbratura));
                timbratureDelGiorno.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                const shifts: Shift[] = [];
                let currentShiftEvents: Timbratura[] = [];

                timbratureDelGiorno.forEach(t => {
                    currentShiftEvents.push(t);
                    if (t.type === 'uscita') {
                        shifts.push(calculateShiftDetails(currentShiftEvents));
                        currentShiftEvents = [];
                    }
                });

                if (currentShiftEvents.length > 0) {
                    shifts.push(calculateShiftDetails(currentShiftEvents));
                }

                setDailyShifts(shifts);
            } catch (error) {
                console.error("Error fetching daily data:", error);
                toast({title: "Errore", description: "Impossibile caricare i dati del giorno."});
            } finally {
                setIsLoading(false);
            }
        };

        fetchDailyData();

    }, [firestore, operatorId, selectedDate, leaveDays, toast, workedDays]);

    const calculateShiftDetails = (events: Timbratura[]): Shift => {
        const startTime = events.find(e => e.type === 'entrata')?.timestamp;
        const endTime = events.find(e => e.type === 'uscita')?.timestamp;

        let workDuration = 0;
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
             workDuration = totalMillis / (1000 * 60);
        }

        return {
            events: events,
            startTime: startTime || events[0].timestamp,
            endTime: endTime || null,
            workDuration: workDuration
        };
    };

    const LeaveDayCard = ({ type }: { type: 'ferie' | 'malattia' | 'permesso' }) => {
        const details = {
            ferie: { Icon: Plane, text: 'Giorno di Ferie', color: 'text-green-600' },
            malattia: { Icon: Stethoscope, text: 'Giorno di Malattia', color: 'text-red-600' },
            permesso: { Icon: UserCheck, text: 'Giorno di Permesso', color: 'text-yellow-600' },
        };
        const { Icon, text, color } = details[type];
        return (
            <div className="text-center h-40 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <Icon className={cn("h-12 w-12", color)} />
                <p className="text-lg font-medium">{text}</p>
                <p>Nessun turno di lavoro registrato.</p>
            </div>
        )
    };


    return (
        <>
            <div className="flex flex-col xl:flex-row gap-6">
                <div className="flex flex-col w-full xl:max-w-sm mx-auto">
                    <Card>
                        <CardHeader><CardTitle>Calendario</CardTitle></CardHeader>
                        <CardContent className="flex justify-center">
                            <DayPickerCalendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                month={currentMonth}
                                onMonthChange={setCurrentMonth}
                                className="p-0"
                                locale={it}
                                disabled={(date) => date > new Date() && !isSameDay(date, new Date())}
                                modifiers={{ 
                                    worked: workedDays, 
                                    ferie: leaveDays.ferie, 
                                    malattia: leaveDays.malattia, 
                                    permesso: leaveDays.permesso, 
                                    straordinario: leaveDays.straordinario.filter(extraDay => !workedDays.some(workDay => isSameDay(extraDay, workDay)))
                                }}
                                modifiersClassNames={{ 
                                    worked: 'bg-primary/20', 
                                    ferie: 'bg-green-500/30 text-green-800', 
                                    malattia: 'bg-red-500/30 text-red-800', 
                                    permesso: 'bg-yellow-500/30 text-yellow-800',
                                    straordinario: 'bg-amber-500/30 text-amber-800'
                                }}
                            />
                        </CardContent>
                        <CardFooter className="flex-col items-stretch gap-2 text-sm text-muted-foreground pt-4">
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-primary/20 border"></div> Giorno Lavorato</div>
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-green-500/30 border"></div> Ferie</div>
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-red-500/30 border"></div> Malattia</div>
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-yellow-500/30 border"></div> Permesso</div>
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-amber-500/30 border"></div> Straordinario</div>
                        </CardFooter>
                    </Card>
                </div>
                
                <div className="flex-1 min-w-0">
                    <Card>
                        <CardHeader>
                            <CardTitle>Dettaglio del {selectedDate ? format(selectedDate, 'PPP', { locale: it }) : '...'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                            ) : selectedDayInfo && selectedDayInfo !== 'straordinario' ? (
                                <LeaveDayCard type={selectedDayInfo} />
                            ) : (
                                <div className="border rounded-md">
                                    {dailyShifts.length > 0 ? (
                                        dailyShifts.map((shift, index) => (
                                            <div key={index} className="border-b last:border-b-0">
                                                <div className='p-4'>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <h4 className="font-semibold">Turno {index + 1}</h4>
                                                        <Button variant="ghost" size="icon" onClick={() => setDetailShift(shift)}><Eye className="h-5 w-5" /></Button>
                                                    </div>
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Orario</TableHead><TableHead>Evento</TableHead><TableHead className="text-right">Stato</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {shift.events.map(t => (
                                                                <TableRow key={t.id}>
                                                                    <TableCell className="font-medium">{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                                                    <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                                                                    <TableCell className="text-right"><Badge variant={t.status === 'confermata' ? 'secondary' : t.status === 'rifiutata' ? 'destructive' : 'default'} className={cn(t.status === 'sospesa' && 'bg-yellow-500 text-white')}>{t.status}</Badge></TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center h-24 flex items-center justify-center">Nessun turno trovato per questo giorno.</div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {detailShift && (
                <ResponsiveDialog open={!!detailShift} onOpenChange={() => setDetailShift(null)}>
                    <ResponsiveDialogContent>
                        <ResponsiveDialogHeader>
                            <ResponsiveDialogTitle>Dettaglio Turno</ResponsiveDialogTitle>
                        </ResponsiveDialogHeader>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Orario</TableHead>
                                    <TableHead>Evento</TableHead>
                                    <TableHead>Stato</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detailShift.events.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell className="font-medium">{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                        <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                                        <TableCell>
                                            <Badge variant={t.status === 'confermata' ? 'secondary' : t.status === 'rifiutata' ? 'destructive' : 'default'}>
                                                {t.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <ResponsiveDialogFooter>
                            <Button variant="outline" onClick={() => setDetailShift(null)}>Chiudi</Button>
                        </ResponsiveDialogFooter>
                    </ResponsiveDialogContent>
                </ResponsiveDialog>
            )}
        </>
    );
};


export default function MonthlySummaryPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [detailView, setDetailView] = useState<DetailView>(null);
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


    const { monthStart, monthEnd } = useMemo(() => {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        return {
            monthStart: Timestamp.fromDate(start),
            monthEnd: Timestamp.fromDate(end),
        };
    }, [currentDate]);

    useEffect(() => {
        if (!firestore || !user?.id || isUserLoading) {
            return;
        }

        setIsDataLoading(true);
        const requestsQuery = query(
            collection(firestore, `app-users/${user.id}/requests`),
        );
        
        const timbratureQuery = query(
            collection(firestore, `app-users/${user.id}/timbrature`),
            where('timestamp', '>=', monthStart),
            where('timestamp', '<=', monthEnd)
        );

        const unsubscribeRequests = onSnapshot(requestsQuery, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Request[];
                setRequests(data);
                if(!isDataLoading) setIsDataLoading(false);
            },
            (error) => {
                console.error("Error fetching requests:", error);
                toast({ title: "Errore", description: "Impossibile caricare le richieste.", variant: "destructive" });
                setIsDataLoading(false);
            }
        );
        
        const unsubscribeTimbrature = onSnapshot(timbratureQuery, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Timbratura[];
                setTimbrature(data.filter(t => t.status === 'confermata'));
                setIsDataLoading(false);
            },
            (error) => {
                 console.error("Error fetching timbrature:", error);
                 toast({ title: "Errore", description: "Impossibile caricare le timbrature confermate.", variant: "destructive" });
                 setIsDataLoading(false);
            }
        );

        return () => {
            unsubscribeRequests();
            unsubscribeTimbrature();
        };
    }, [firestore, user, isUserLoading, monthStart, monthEnd, toast]);
    
    const summary = useMemo(() => {
        let totalWorkedMillis = 0;

        const dailyTimbrature = timbrature.reduce((acc, t) => {
            const dayString = t.timestamp.toDate().toDateString();
            if (!acc[dayString]) {
                acc[dayString] = [];
            }
            acc[dayString].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);

        for (const dayString in dailyTimbrature) {
            const dayEvents = dailyTimbrature[dayString].sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            let entrata: Timestamp | null = null;
            let currentBreakStart: Timestamp | null = null;
            
            dayEvents.forEach(event => {
                if (event.type === 'entrata') {
                    if (!entrata) entrata = event.timestamp;
                } else if (event.type === 'pausa' && entrata && !currentBreakStart) {
                    currentBreakStart = event.timestamp;
                } else if (event.type === 'fine_pausa' && entrata && currentBreakStart) {
                     totalWorkedMillis -= (event.timestamp.toMillis() - currentBreakStart.toMillis());
                     currentBreakStart = null;
                } else if (event.type === 'uscita' && entrata) {
                    totalWorkedMillis += (event.timestamp.toMillis() - entrata.toMillis());
                    entrata = null; // Reset for next shift on same day
                }
            });
        }
        
        const approvedRequests = requests.filter(r => r.status === 'approvato');
        const periodStart = startOfMonth(currentDate);
        const periodEnd = endOfMonth(currentDate);

        const overtimeTotal = approvedRequests
            .filter(r => r.type === 'straordinario' && isWithinInterval(r.startDate.toDate(), {start: periodStart, end: periodEnd}))
            .reduce((sum, r) => sum + (r.hours || 0), 0);
        
        const totalWorkedMinutes = totalWorkedMillis / (1000 * 60);
        const ordinaryWorkedMinutes = totalWorkedMinutes; // totalWorkedMinutes already excludes crystallized overtime
        const totalWorkedHours = Math.round(ordinaryWorkedMinutes / 60);

        const workedDaysCount = Object.keys(dailyTimbrature).length;


        let ferieDaysCount = 0;
        let malattiaDaysCount = 0;

        if (operatorData) {
            approvedRequests.forEach(req => {
                if (req.type === 'ferie' || req.type === 'malattia') {
                    for (let day = new Date(req.startDate.toDate()); day <= req.endDate.toDate(); day.setDate(day.getDate() + 1)) {
                        if (isWithinInterval(day, { start: periodStart, end: periodEnd })) {
                            const dayName = dayIndexToName[getDay(day)];
                            const contractualHours = operatorData.workSchedule[dayName] || 0;
                            if (contractualHours > 0) {
                                if (req.type === 'ferie') ferieDaysCount++;
                                if (req.type === 'malattia') malattiaDaysCount++;
                            }
                        }
                    }
                }
            });
        }
        
        return {
            workedDays: workedDaysCount,
            workedHours: totalWorkedHours,
            overtimeHours: overtimeTotal,
            ferieDays: ferieDaysCount,
            permessoHours: approvedRequests.filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), {start: periodStart, end: periodEnd})).reduce((sum, r) => sum + (r.hours || 0), 0),
            malattiaDays: malattiaDaysCount,
        };
    }, [timbrature, requests, operatorData, currentDate]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const handleSummaryCardClick = (type: DetailView['type'], title: string) => {
        if (!type) return;
        const approvedRequests = requests.filter(r => r.status === 'approvato' && r.type === type);
        setDetailView({ type, title, items: approvedRequests });
    };

    if (isUserLoading || isDataLoading || !operatorData) {
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

    const renderDetailTable = () => {
        if (!detailView || detailView.items.length === 0) {
            return <p className="text-center text-muted-foreground py-4">Nessun dato per questo mese.</p>;
        }
        
        const monthInterval = { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };

        if (detailView.type === 'ferie' || detailView.type === 'malattia') {
            const allDays: Date[] = [];
            detailView.items.forEach(item => {
                const interval = { start: item.startDate.toDate(), end: item.endDate.toDate() };
                const daysInInterval = eachDayOfInterval(interval);

                daysInInterval.forEach(day => {
                    if (isWithinInterval(day, monthInterval)) {
                        const dayName = dayIndexToName[getDay(day)];
                        const contractualHours = operatorData?.workSchedule[dayName] || 0;
                        if (contractualHours > 0) {
                            allDays.push(day);
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
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allDays.map((day, index) => (
                                <TableRow key={index}>
                                    <TableCell>{format(day, 'PPP', { locale: it })}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            );
        }

        const filteredItems = detailView.items.filter(item => {
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
                            { (detailView.type === 'permesso' || detailView.type === 'straordinario') && <TableHead>Ore</TableHead> }
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredItems.map(item => (
                             <TableRow key={item.id}>
                                <TableCell>{format(item.startDate.toDate(), 'PPP', { locale: it })}</TableCell>
                                <TableCell>{format(item.endDate.toDate(), 'PPP', { locale: it })}</TableCell>
                                { (detailView.type === 'permesso' || detailView.type === 'straordinario') && <TableCell>{item.hours}</TableCell> }
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    };

    const MonthlyView = () => (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className='flex items-center gap-3'>
                    <CalendarIcon className="h-8 w-8 text-primary" />
                    <h2 className="text-3xl font-bold tracking-tight">Riepilogo Mensile</h2>
                </div>
                <div className="flex gap-2 items-center">
                    <Button variant="outline" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                    <h3 className="text-lg font-semibold w-36 text-center capitalize">{format(currentDate, 'MMMM yyyy', { locale: it })}</h3>
                    <Button variant="outline" onClick={() => handleMonthChange(1)}>Succ.</Button>
                </div>
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle>
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{summary.workedDays}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ore Lavorate</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{summary.workedHours}</div></CardContent>
                </Card>
                <Card
                    onClick={() => handleSummaryCardClick('straordinario', 'Dettaglio Straordinari')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Straordinari (ore)</CardTitle>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{summary.overtimeHours}</div></CardContent>
                </Card>
                <Card
                    onClick={() => handleSummaryCardClick('ferie', 'Dettaglio Ferie')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle>
                        <Plane className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{summary.ferieDays}</div></CardContent>
                </Card>
                 <Card
                    onClick={() => handleSummaryCardClick('permesso', 'Dettaglio Permessi')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                 >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle>
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{summary.permessoHours}</div></CardContent>
                </Card>
                <Card
                    onClick={() => handleSummaryCardClick('malattia', 'Dettaglio Malattia')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle>
                        <Stethoscope className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{summary.malattiaDays}</div></CardContent>
                </Card>
            </div>
             <div className="flex justify-center">
                <Button onClick={() => setCurrentView('daily')} size="lg">
                    <CalendarIcon className="mr-2 h-4 w-4" /> Visualizza Calendario
                </Button>
            </div>
        </div>
    );
    

    return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>

            <Card>
                <CardHeader>
                    <div className="flex flex-col items-start gap-4">
                        <div>
                            <CardTitle>Riepilogo Attività di {operatorData.username}</CardTitle>
                            <CardDescription>Visualizza il riepilogo mensile o giornaliero.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant={currentView === 'monthly' ? 'secondary' : 'outline'} onClick={() => setCurrentView('monthly')}>Mensile</Button>
                            <Button variant={currentView === 'daily' ? 'secondary' : 'outline'} onClick={() => setCurrentView('daily')}>Giornaliero</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {currentView === 'monthly' ? (
                        <MonthlyView />
                    ) : (
                        <OperatorDailySummaryContent operatorId={user.id} operator={operatorData} initialDate={dailyViewDate} />
                    )}
                </CardContent>
            </Card>

            <ResponsiveDialog open={!!detailView} onOpenChange={() => setDetailView(null)}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>{detailView?.title}</ResponsiveDialogTitle>
                        <ResponsiveDialogDescription>
                            Riepilogo delle richieste approvate per il mese di {format(currentDate, 'MMMM yyyy', { locale: it })}.
                        </ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                    <div className="py-4">
                        {renderDetailTable()}
                    </div>
                </ResponsiveDialogContent>
            </ResponsiveDialog>
        </Suspense>
    );
}
