'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { collection, query, where, Timestamp, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Loader2, List, Clock, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/hooks/use-user';
import { format, getDay, isWithinInterval, startOfMonth, endOfMonth, eachDayOfInterval, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription } from '@/components/ui/responsive-dialog';

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
};

type Operator = {
    id: string;
    workSchedule: WorkSchedule;
}

type Request = {
    id: string;
    userId: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'in_attesa' | 'approvato' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number; // Only for 'permesso' and 'straordinario'
    reason: string;
}

type Timbratura = {
    id: string;
    userId: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
};

type Shift = {
    events: Timbratura[];
    startTime: Timestamp;
    endTime: Timestamp | null;
    workDuration: number; // in minutes
};


type DetailView = {
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    title: string;
    items: Request[];
} | null;


const OperatorDailySummary = ({ userId, date, onClose }: { userId: string, date: Date, onClose: () => void }) => {
    const firestore = useFirestore();
    const [dailyShifts, setDailyShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore) return;
        setIsLoading(true);

        const start = startOfDay(date);
        const end = endOfDay(date);
        const startTs = Timestamp.fromDate(start);
        const endTs = Timestamp.fromDate(end);

        const timbratureQuery = query(
            collection(firestore, `app-users/${userId}/timbrature`),
            where('timestamp', '>=', startTs),
            where('timestamp', '<=', endTs),
            where('status', '==', 'confermata')
        );

        const unsubscribe = onSnapshot(timbratureQuery, snapshot => {
            const timbratureDelGiorno = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Timbratura));
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
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [firestore, userId, date]);

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

    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    return (
        <ResponsiveDialog open={true} onOpenChange={onClose}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>Riepilogo del {format(date, 'PPP', { locale: it })}</ResponsiveDialogTitle>
                     <ResponsiveDialogDescription>
                        Dettaglio dei turni confermati per questo giorno.
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                <div className="py-4">
                    {isLoading ? (
                         <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : dailyShifts.length > 0 ? (
                        dailyShifts.map((shift, index) => (
                             <div key={index} className="border-b last:border-b-0 py-2">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-semibold">Turno {index + 1}</h4>
                                    <span className="text-sm text-muted-foreground">Durata: {formatMinutes(shift.workDuration)}</span>
                                </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Orario</TableHead><TableHead>Evento</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {shift.events.map(t => (
                                            <TableRow key={t.id}>
                                                <TableCell className="font-medium">{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                                <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ))
                    ) : (
                        <div className="text-center h-24 flex items-center justify-center">Nessun turno confermato per questo giorno.</div>
                    )}
                </div>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    )
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
    const [dailyDetailDate, setDailyDetailDate] = useState<Date | null>(null);


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
        let workedDaysCount = 0;
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
            let dayWorked = false;

            dayEvents.forEach(event => {
                if (event.type === 'entrata') {
                    if (!entrata) entrata = event.timestamp;
                } else if (event.type === 'pausa' && entrata && !currentBreakStart) {
                    currentBreakStart = event.timestamp;
                } else if (event.type === 'fine_pausa' && entrata && currentBreakStart) {
                     totalWorkedMillis -= (event.timestamp.toMillis() - currentBreakStart.toMillis());
                     currentBreakStart = null;
                } else if (event.type === 'uscita' && entrata) {
                    if (!dayWorked) {
                        workedDaysCount++;
                        dayWorked = true;
                    }
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
        const ordinaryWorkedMinutes = totalWorkedMinutes - (overtimeTotal * 60);
        const totalWorkedHours = Math.round(ordinaryWorkedMinutes / 60);


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
    
    const handleWorkedDaysClick = () => {
        const workedDaysInMonth = timbrature
            .map(t => t.timestamp.toDate())
            .filter(d => isWithinInterval(d, { start: startOfMonth(currentDate), end: endOfMonth(currentDate) }));
        
        if (workedDaysInMonth.length > 0) {
            setDailyDetailDate(workedDaysInMonth[0]);
        } else {
            toast({ title: "Nessun giorno lavorato", description: "Non ci sono turni confermati per questo mese.", variant: "default" });
        }
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
    

    return (
        <>
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className='flex items-center gap-3'>
                    <Calendar className="h-8 w-8 text-primary" />
                    <h2 className="text-3xl font-bold tracking-tight">Riepilogo Mensile</h2>
                </div>
                <div className="flex gap-2 items-center">
                    <Button variant="outline" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                    <h3 className="text-lg font-semibold w-36 text-center capitalize">{format(currentDate, 'MMMM yyyy', { locale: it })}</h3>
                    <Button variant="outline" onClick={() => handleMonthChange(1)}>Succ.</Button>
                </div>
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                <Card
                    onClick={() => {
                        const workedDaysInMonth = [...new Set(timbrature.map(t => t.timestamp.toDate().toDateString()))];
                         if (workedDaysInMonth.length > 0) {
                             setDailyDetailDate(new Date(workedDaysInMonth[0]));
                         } else {
                            toast({ title: "Nessun giorno lavorato", description: "Non ci sono turni confermati per questo mese.", variant: "default" });
                         }
                    }}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle>
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.workedDays}</div>
                    </CardContent>
                </Card>
                 <Card
                    onClick={() => {
                        const workedDaysInMonth = [...new Set(timbrature.map(t => t.timestamp.toDate().toDateString()))];
                         if (workedDaysInMonth.length > 0) {
                             setDailyDetailDate(new Date(workedDaysInMonth[0]));
                         } else {
                            toast({ title: "Nessun giorno lavorato", description: "Non ci sono turni confermati per questo mese.", variant: "default" });
                         }
                    }}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ore Lavorate</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.workedHours}</div>
                    </CardContent>
                </Card>
                <Card
                    onClick={() => handleSummaryCardClick('straordinario', 'Dettaglio Straordinari')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Straordinari (ore)</CardTitle>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.overtimeHours}</div>
                    </CardContent>
                </Card>
                <Card
                    onClick={() => handleSummaryCardClick('ferie', 'Dettaglio Ferie')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle>
                        <Plane className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.ferieDays}</div>
                    </CardContent>
                </Card>
                 <Card
                    onClick={() => handleSummaryCardClick('permesso', 'Dettaglio Permessi')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                 >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle>
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.permessoHours}</div>
                    </CardContent>
                </Card>
                <Card
                    onClick={() => handleSummaryCardClick('malattia', 'Dettaglio Malattia')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle>
                        <Stethoscope className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.malattiaDays}</div>
                    </CardContent>
                </Card>
            </div>
             <div className="flex justify-center">
                <Button onClick={() => {
                    if (user) {
                        const workedDaysInMonth = [...new Set(timbrature.map(t => t.timestamp.toDate().toDateString()))];
                        const requestsInMonth = requests.filter(r => isWithinInterval(r.createdAt.toDate(), { start: startOfMonth(currentDate), end: endOfMonth(currentDate) }));
                         if (workedDaysInMonth.length > 0) {
                             setDailyDetailDate(new Date(workedDaysInMonth[0]));
                         } else if (requestsInMonth.length > 0) {
                             setDailyDetailDate(requestsInMonth[0].createdAt.toDate());
                         } else {
                            setDailyDetailDate(currentDate);
                         }
                    }
                }} size="lg">
                    <Calendar className="mr-2 h-4 w-4" /> Visualizza Calendario
                </Button>
            </div>
            
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <List className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Dettaglio Richieste del Mese</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Data Inizio</TableHead>
                                    <TableHead>Data Fine</TableHead>
                                    <TableHead>Quantità</TableHead>
                                    <TableHead className="text-right">Stato</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.filter(r => isWithinInterval(r.createdAt.toDate(), { start: startOfMonth(currentDate), end: endOfMonth(currentDate) })).length > 0 ? requests.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell className="font-medium capitalize">{req.type.replace('_', ' ')}</TableCell>
                                        <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                                        <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                                        <TableCell>{req.hours ? `${req.hours} ore` : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={req.status === 'approvato' ? 'secondary' : req.status === 'rifiutato' ? 'destructive' : 'default'}>
                                                {req.status.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-24">Nessuna richiesta trovata per questo mese.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

        </div>

        {dailyDetailDate && user && (
            <ResponsiveDialog open={true} onOpenChange={() => setDailyDetailDate(null)}>
                <ResponsiveDialogContent className="max-w-4xl">
                     <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Riepilogo Giornaliero</ResponsiveDialogTitle>
                    </ResponsiveDialogHeader>
                    <OperatorDailySummary userId={user.id} date={dailyDetailDate} onClose={() => setDailyDetailDate(null)}/>
                </ResponsiveDialogContent>
            </ResponsiveDialog>
        )}


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
        </>
    );
}
