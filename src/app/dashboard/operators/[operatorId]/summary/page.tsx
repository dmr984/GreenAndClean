'use client';
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Loader2, User, ClipboardList, PackageSearch, ListChecks, Calendar as CalendarIcon, CheckCircle, XCircle, MapPin, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Trash2, Eye, Pencil, AlertCircle, Circle, Archive, Clock, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, parse, set, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, addDays, subDays, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { getDay as getDayFns } from 'date-fns';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter, ResponsiveDialogDescription } from '@/components/ui/responsive-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';


type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
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
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    latitude?: number;
    longitude?: number;
    isOvertime: boolean;
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

type SelectedDayInfo = {
    type: 'ferie' | 'malattia' | 'permesso';
} | null;


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
        );
        
        const timbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', Timestamp.fromDate(startOfMonthValue)),
            where('timestamp', '<=', Timestamp.fromDate(endOfMonthValue))
        );
        
        const unsubRequests = onSnapshot(requestsQuery, s => {
            const allRequests = s.docs.map(d => ({id: d.id, ...d.data()} as Request));
            setRequests(allRequests);
        }, () => setIsLoading(false));

        const unsubTimbrature = onSnapshot(timbratureQuery, s => {
            setTimbrature(s.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)));
            setIsLoading(false);
        }, () => setIsLoading(false));

        return () => { 
            unsubRequests(); 
            unsubTimbrature(); 
        };
    }, [firestore, operatorId, currentDate]);
    
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


    const summary = useMemo(() => {
        const confirmedTimbrature = timbrature.filter(t => t.status === 'confermata');
        const approvedRequests = requests.filter(r => r.status === 'approvato');
        
        let workedDaysCount = 0;
        let totalOrdinaryMinutes = 0;
        let totalOvertimeMinutesFromShifts = 0;
        let ordinaryHoursByDay: {date: Date, hours: number, shift: Shift}[] = [];
    
        const dailyTimbrature = confirmedTimbrature.reduce((acc, t) => {
            const dayString = t.timestamp.toDate().toDateString();
            if (!acc[dayString]) acc[dayString] = [];
            acc[dayString].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);
    
        for (const dayString in dailyTimbrature) {
            workedDaysCount++;
            const events = dailyTimbrature[dayString];
            events.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            const isOvertimeDay = events.find(e => e.type === 'entrata')?.isOvertime || false;

            let dayTotalMillis = 0;
            let entrata: Timestamp | null = null;
            let currentBreakStart: Timestamp | null = null;
    
            for (const event of events) {
                if (event.type === 'entrata' && !entrata) {
                    entrata = event.timestamp;
                } else if (event.type === 'pausa' && entrata && !currentBreakStart) {
                    currentBreakStart = event.timestamp;
                } else if (event.type === 'fine_pausa' && entrata && currentBreakStart) {
                     dayTotalMillis -= (event.timestamp.toMillis() - currentBreakStart.toMillis());
                     currentBreakStart = null;
                } else if (event.type === 'uscita' && entrata) {
                    dayTotalMillis += (event.timestamp.toMillis() - entrata.toMillis());
                    entrata = null; // Reset for potential next shift
                }
            }
            const dayTotalMinutes = dayTotalMillis / (1000 * 60);
            
             const shiftObject: Shift = {
                events: events,
                startTime: events.find(e => e.type === 'entrata')!.timestamp,
                endTime: events.find(e => e.type === 'uscita')?.timestamp || null,
                workDuration: dayTotalMinutes,
                isOvertime: isOvertimeDay
            };

            const dayDate = new Date(dayString);
            const dayName = dayIndexToName[getDay(dayDate)];
            const contractualHours = operator.workSchedule[dayName] || 0;
            
            if (contractualHours === 0 || isOvertimeDay) {
                 totalOvertimeMinutesFromShifts += dayTotalMinutes;
            } else {
                 const contractualMinutes = contractualHours * 60;
                 if (dayTotalMinutes > contractualMinutes) {
                    const overtimeMinutes = dayTotalMinutes - contractualMinutes;
                    totalOvertimeMinutesFromShifts += overtimeMinutes;
                    totalOrdinaryMinutes += contractualMinutes;
                 } else {
                    totalOrdinaryMinutes += dayTotalMinutes;
                 }
            }

            const ordinaryPart = Math.min(dayTotalMinutes, contractualHours * 60);
            const roundedOrdinaryHours = roundOrdinaryHours(ordinaryPart);
            if (roundedOrdinaryHours > 0 && !isOvertimeDay) {
               ordinaryHoursByDay.push({date: dayDate, hours: roundedOrdinaryHours, shift: shiftObject});
            }
        }
        
        const periodStart = startOfMonth(currentDate);
        const periodEnd = endOfMonth(currentDate);

        const manuallyAddedOvertimeHours = approvedRequests
            .filter(r => r.type === 'straordinario' && r.reason !== 'Straordinario da giorno non lavorativo approvato' && r.reason !== 'Straordinario approvato da turno' && isWithinInterval(r.startDate.toDate(), {start: periodStart, end: periodEnd}))
            .reduce((sum, r) => sum + (r.hours || 0), 0);
        
        const ordinaryWorkedHours = roundOrdinaryHours(totalOrdinaryMinutes);
        const overtimeFromShiftsHours = roundOvertimeHours(totalOvertimeMinutesFromShifts);
        const totalOvertimeHours = overtimeFromShiftsHours + manuallyAddedOvertimeHours;
    
        let ferieDaysCount = 0;
        let malattiaDaysCount = 0;
    
        if (operator) {
            approvedRequests.forEach(req => {
                if (req.type === 'ferie' || req.type === 'malattia') {
                    for (let day = new Date(req.startDate.toDate()); day <= req.endDate.toDate(); day.setDate(day.getDate() + 1)) {
                        if (isWithinInterval(day, { start: periodStart, end: periodEnd })) {
                            const dayName = dayIndexToName[getDay(day)];
                            const contractualHours = operator.workSchedule[dayName] || 0;
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
            workedHours: ordinaryWorkedHours,
            overtimeHours: totalOvertimeHours,
            permessoHours: approvedRequests.filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), {start: periodStart, end: periodEnd})).reduce((sum, r) => sum + (r.hours || 0), 0),
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
                    items: prev.items.filter(item => item.id !== request.id)
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
                    items: prev.items.filter(item => item.id !== requestToDelete.id)
                };
            });
        } catch (error) {
            console.error("Error deleting request:", error);
            toast({ title: 'Errore', description: 'Impossibile eliminare la richiesta.', variant: 'destructive' });
        } finally {
            setRequestToDelete(null);
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
                        const contractualHours = operator?.workSchedule[dayName] || 0;
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
                                <TableCell className="text-right">
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


export default function OperatorSummaryPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const operatorId = params.operatorId as string;
    const { toast } = useToast();
    const firestore = useFirestore();
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [monthToClean, setMonthToClean] = useState<Date | null>(null);


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
                 toast({ title: 'Nessun dato', description: 'Non ci sono dati da eliminare per questo mese.' });
            } else {
                await batch.commit();
                toast({ title: 'Successo!', description: `I dati di ${format(monthToClean, 'MMMM yyyy', { locale: it })} sono stati elaborati.` });
            }
    
        } catch (error) {
            console.error("Errore durante la pulizia del mese:", error);
            toast({ title: 'Errore', description: 'Impossibile completare la pulizia.', variant: 'destructive' });
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
                        <div className="flex flex-col items-start gap-4">
                            <div>
                                 <CardTitle>Riepilogo Attività di {operator.username}</CardTitle>
                                 <CardDescription>Visualizza il riepilogo mensile delle attività.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <MonthlySummary 
                            operatorId={operatorId} 
                            operator={operator} 
                            onCleanMonth={(date) => setMonthToClean(date)}
                        />
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
