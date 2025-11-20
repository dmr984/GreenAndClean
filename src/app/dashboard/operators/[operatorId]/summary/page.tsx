'use client';
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Loader2, User, ClipboardList, PackageSearch, ListChecks, Calendar as CalendarIcon, CheckCircle, XCircle, MapPin, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Trash2, Eye, Pencil, AlertCircle, Circle, Archive, Clock } from 'lucide-react';
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
import { Calendar } from '@/components/ui/calendar';

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

type SelectedDayInfo = {
    type: 'ferie' | 'malattia' | 'permesso';
} | null;


const MonthlySummary = ({ operatorId, operator, onDateClick, onCleanMonth }: { operatorId: string, operator: Operator, onDateClick: (date: Date) => void, onCleanMonth: (date: Date) => void }) => {
    const firestore = useFirestore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [detailView, setDetailView] = useState<DetailView>(null);
    const [itemToModify, setItemToModify] = useState<{ request: Request, day: Date } | null>(null);
    const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
    
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


    const summary = useMemo(() => {
        const confirmedTimbrature = timbrature.filter(t => t.status === 'confermata');
        const approvedRequests = requests.filter(r => r.status === 'approvato');
        
        let workedDaysCount = 0;
        let totalWorkedMillis = 0;

        const dailyTimbrature = confirmedTimbrature.reduce((acc, t) => {
            const dayString = t.timestamp.toDate().toDateString();
            if (!acc[dayString]) acc[dayString] = [];
            acc[dayString].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);

        for (const dayString in dailyTimbrature) {
            const dayEvents = dailyTimbrature[dayString].sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            let entrata: Timestamp | null = null;
            let currentBreakStart: Timestamp | null = null;
            let dayWorked = false;

            for (const event of dayEvents) {
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
                    // Reset for potential second shift on same day
                    entrata = null; 
                    currentBreakStart = null;
                }
            }
        }
        
        const periodStart = startOfMonth(currentDate);
        const periodEnd = endOfMonth(currentDate);

        const overtimeTotal = approvedRequests
            .filter(r => r.type === 'straordinario' && isWithinInterval(r.startDate.toDate(), {start: periodStart, end: periodEnd}))
            .reduce((sum, r) => sum + (r.hours || 0), 0);
        
        const totalWorkedMinutes = totalWorkedMillis / (1000 * 60);
        const ordinaryWorkedMinutes = totalWorkedMinutes; // totalWorkedMinutes already excludes crystallized overtime
        const totalWorkedHours = Math.round(ordinaryWorkedMinutes / 60);

    
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
            workedHours: totalWorkedHours,
            overtimeHours: overtimeTotal,
            ferieDays: ferieDaysCount,
            permessoHours: approvedRequests.filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), {start: periodStart, end: periodEnd})).reduce((sum, r) => sum + (r.hours || 0), 0),
            malattiaDays: malattiaDaysCount,
        };
    }, [timbrature, requests, operator, currentDate]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };
    
    const handleSummaryCardClick = (type: DetailView['type'], title: string) => {
        if (!type) return;
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
            toast({ title: 'Successo', description: 'Richiesta di straordinario eliminata.' });
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

        if (detailView.type === 'ferie' || detailView.type === 'malattia') {
            const allDays: { day: Date, request: Request }[] = [];
            detailView.items.forEach(item => {
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
                            <TableHead>Ore</TableHead>
                             {detailView.type === 'straordinario' && <TableHead className="text-right">Azione</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredItems.map(item => (
                             <TableRow key={item.id}>
                                <TableCell>{format(item.startDate.toDate(), 'PPP', { locale: it })}</TableCell>
                                <TableCell>{format(item.endDate.toDate(), 'PPP', { locale: it })}</TableCell>
                                <TableCell>{item.hours}</TableCell>
                                {detailView.type === 'straordinario' && (
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => setRequestToDelete(item)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                )}
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
                <Card
                  onClick={() => onDateClick(currentDate)}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle><Briefcase className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedDays}</div></CardContent>
                </Card>
                <Card
                  onClick={() => onDateClick(currentDate)}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ore Lavorate</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedHours}</div></CardContent>
                </Card>
                <Card
                  onClick={() => handleSummaryCardClick('straordinario', 'Dettaglio Straordinari')}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Straordinari (ore)</CardTitle><Plus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.overtimeHours}</div></CardContent></Card>
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
                        Riepilogo delle richieste approvate per {format(currentDate, 'MMMM yyyy', { locale: it })}.
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                 <div className="py-4">
                    {renderDetailTable()}
                </div>
            </ResponsiveDialogContent>
        </ResponsiveDialog>

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
                       Sei sicuro di voler eliminare questa richiesta di straordinario? L'azione è permanente.
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

function DailySummaryContent({ operatorId, operator, initialDate }: { operatorId: string, operator: Operator, initialDate: Date }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
    const [currentMonth, setCurrentMonth] = useState(initialDate);
    const [dailyShifts, setDailyShifts] = useState<Shift[]>([]);
    const [workedDays, setWorkedDays] = useState<Date[]>([]);
    const [leaveDays, setLeaveDays] = useState<{ferie: Date[], malattia: Date[], permesso: Date[]}>({ ferie: [], malattia: [], permesso: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDayInfo, setSelectedDayInfo] = useState<SelectedDayInfo>(null);

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newShift, setNewShift] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editShiftTimes, setEditShiftTimes] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    
    const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const [detailShift, setDetailShift] = useState<Shift | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);


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

            const approvedRequests = snapshot.docs.map(doc => doc.data() as Request).filter(req => req.status === 'approvato');

            approvedRequests.forEach(req => {
                const startReq = req.startDate.toDate();
                const endReq = req.endDate.toDate();

                for (let day = new Date(startReq); day <= endReq; day.setDate(day.getDate() + 1)) {
                    const dayOfWeekIndex = getDay(day);
                    const dayName = dayIndexToName[dayOfWeekIndex];
                    const contractualHours = operator.workSchedule[dayName] || 0;

                    if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                        if (req.type === 'ferie' && contractualHours > 0) ferie.push(new Date(day));
                        if (req.type === 'malattia' && contractualHours > 0) malattia.push(new Date(day));
                        if (req.type === 'permesso') permesso.push(new Date(day));
                    }
                }
            });
             setLeaveDays({ ferie, malattia, permesso });
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
                const timbratureDelGiorno = timbratureSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Timbratura[];
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
                
                // ONLY if no shifts are found, check for leave days
                if (shifts.length === 0) {
                    let dayInfo: SelectedDayInfo = null;
                    if (leaveDays.ferie.some(d => isSameDay(d, selectedDate))) dayInfo = { type: 'ferie' };
                    else if (leaveDays.malattia.some(d => isSameDay(d, selectedDate))) dayInfo = { type: 'malattia' };
                    else if (leaveDays.permesso.some(d => isSameDay(d, selectedDate))) dayInfo = { type: 'permesso' };
                    setSelectedDayInfo(dayInfo);
                } else {
                    setSelectedDayInfo(null);
                }

            } catch (error) {
                console.error("Error fetching daily data:", error);
                toast({title: "Errore", description: "Impossibile caricare i dati del giorno."});
            } finally {
                setIsLoading(false);
            }
        };

        fetchDailyData();

    }, [firestore, operatorId, selectedDate, leaveDays, toast]);

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
        } else if (startTime) {
             // Handle ongoing shift if needed
        }

        return {
            events: events,
            startTime: startTime || events[0].timestamp,
            endTime: endTime || null,
            workDuration: workDuration
        };
    };

    const handleAddManualShift = async () => {
        if (!firestore || !operatorId || !selectedDate || !newShift.entrata || !newShift.uscita) {
            toast({ title: 'Dati mancanti', description: 'Entrata e Uscita sono obbligatorie.', variant: 'destructive'});
            return;
        }

        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if(isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(selectedDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };

        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operatorId}/timbrature`);

        const events: { type: Timbratura['type'], time: string }[] = [
            { type: 'entrata', time: newShift.entrata },
            { type: 'uscita', time: newShift.uscita },
            { type: 'pausa', time: newShift.pausa },
            { type: 'fine_pausa', time: newShift.fine_pausa },
        ];

        for (const event of events) {
            if (event.time) {
                const timestamp = createTimestamp(event.time);
                if (!timestamp) {
                    toast({ title: `Orario non valido per ${event.type}`, variant: 'destructive'});
                    return;
                }
                const newDocRef = doc(timbratureCollectionRef);
                batch.set(newDocRef, {
                    userId: operatorId,
                    type: event.type,
                    timestamp: timestamp,
                    status: 'sospesa' as const,
                    viewedByOperator: false,
                });
            }
        }
        
        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno manuale aggiunto con successo. In attesa di approvazione.' });
            setIsAddDialogOpen(false);
            setNewShift({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile aggiungere il turno manuale.', variant: 'destructive'});
        }
    };
    
    const handleOpenEditDialog = (shift: Shift) => {
        setEditingShift(shift);
        const times = { entrata: '', uscita: '', pausa: '', fine_pausa: '' };
        shift.events.forEach(e => {
            times[e.type] = format(e.timestamp.toDate(), 'HH:mm');
        });
        setEditShiftTimes(times);
        setIsEditDialogOpen(true);
    };

    const handleEditShift = async () => {
        if (!firestore || !editingShift || !operatorId || !selectedDate) return;

        const batch = writeBatch(firestore);

        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(selectedDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };

        const newEventsMap: Partial<Record<Timbratura['type'], { timestamp: Timestamp | null }>> = {
            entrata: { timestamp: createTimestamp(editShiftTimes.entrata) },
            uscita: { timestamp: createTimestamp(editShiftTimes.uscita) },
            pausa: { timestamp: createTimestamp(editShiftTimes.pausa) },
            fine_pausa: { timestamp: createTimestamp(editShiftTimes.fine_pausa) },
        };
        
        const existingEventTypes = new Set(editingShift.events.map(e => e.type));

        for (const event of editingShift.events) {
            const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, event.id);
            const newTimestamp = newEventsMap[event.type]?.timestamp;
            if (newTimestamp) {
                batch.update(docRef, { timestamp: newTimestamp, viewedByOperator: false });
            } else {
                batch.delete(docRef);
            }
        }

        for (const type in newEventsMap) {
            const eventType = type as Timbratura['type'];
            if (!existingEventTypes.has(eventType)) {
                const timestamp = newEventsMap[eventType]?.timestamp;
                if (timestamp) {
                    const newDocRef = doc(collection(firestore, `app-users/${operatorId}/timbrature`));
                    batch.set(newDocRef, { userId: operatorId, type: eventType, timestamp: timestamp, status: 'confermata', viewedByOperator: false });
                }
            }
        }

        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno aggiornato.' });
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile aggiornare il turno.', variant: 'destructive' });
        } finally {
            setIsEditDialogOpen(false);
            setEditingShift(null);
            setIsDetailOpen(false);
        }
    };
    
    const handleDeleteShift = async () => {
        if (!firestore || !shiftToDelete || !operatorId) return;
        const batch = writeBatch(firestore);
        shiftToDelete.events.forEach(event => {
            const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, event.id);
            batch.delete(docRef);
        });
        
        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno eliminato con successo.' });
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile eliminare il turno.', variant: 'destructive' });
        } finally {
            setIsDeleteDialogOpen(false);
            setShiftToDelete(null);
            setIsDetailOpen(false);
        }
    };

    const handleInputChange = (field: keyof typeof newShift, value: string) => setNewShift(prev => ({ ...prev, [field]: value }));
    const handleEditInputChange = (field: keyof typeof editShiftTimes, value: string) => setEditShiftTimes(prev => ({ ...prev, [field]: value }));
    
    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const getContractualHoursForShift = (shift: Shift | null): number => {
        if (!shift || !operator?.workSchedule) return 0;
        const shiftDate = shift.events[0]?.timestamp.toDate();
        if (!shiftDate) return 0;
        const dayOfWeek = getDayFns(shiftDate);
        const dayName = dayIndexToName[dayOfWeek];
        return operator.workSchedule[dayName] || 0;
    };
    
     const calculateOvertimeWithTolerance = (shift: Shift | null): number => {
        if (!shift || !operator?.workSchedule) return 0;

        const contractualMinutes = getContractualHoursForShift(shift) * 60;
        const totalMinutes = shift.workDuration;
        
        if (totalMinutes <= contractualMinutes) return 0;
        
        const overtimeMinutes = totalMinutes - contractualMinutes;
        
        const hours = Math.floor(overtimeMinutes / 60);
        const remainingMinutes = overtimeMinutes % 60;

        if (remainingMinutes >= 50) {
            return hours + 1;
        }

        return hours;
    };

    const isDateDisabled = (date: Date): boolean => {
        const today = startOfDay(new Date());
        const isLeaveOrSickDay = leaveDays.ferie.some(d => isSameDay(d, date)) || leaveDays.malattia.some(d => isSameDay(d, date));
        
        if (date > today && !isSameDay(date, today)) {
          return !isLeaveOrSickDay;
        }
        
        return false;
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
                <p>Nessun turno di lavoro registrato per oggi.</p>
            </div>
        )
    };
    
    const isWorkDay = selectedDate ? (operator.workSchedule[dayIndexToName[getDay(selectedDate)]] || 0) > 0 : false;

    return (
        <>
        <div className="flex flex-col xl:flex-row gap-6">
             <div className="flex flex-col w-full xl:max-w-sm mx-auto">
                 <Card>
                    <CardHeader><CardTitle>Calendario</CardTitle></CardHeader>
                    <CardContent className="flex justify-center">
                         <Calendar
                            locale={it}
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            month={currentMonth}
                            onMonthChange={setCurrentMonth}
                            className="p-0"
                            disabled={isDateDisabled}
                            modifiers={{ 
                                worked: workedDays, 
                                ferie: leaveDays.ferie, 
                                malattia: leaveDays.malattia, 
                                permesso: leaveDays.permesso, 
                                straordinario: workedDays.filter(workDay => {
                                    const dayName = dayIndexToName[getDay(workDay)];
                                    return (operator.workSchedule[dayName] || 0) === 0;
                                })
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
                         <Button className="w-full mt-4" onClick={() => setIsAddDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Aggiungi Turno Manuale</Button>
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
                        ) : dailyShifts.length > 0 ? (
                           <>
                                {dailyShifts.map((shift, index) => (
                                    <div key={index} className="border rounded-md mb-4 last:mb-0">
                                        <div className='p-4'>
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold">Turno {index + 1}</h4>
                                                    {!isWorkDay && (
                                                        <Badge variant="outline" className="border-amber-500 text-amber-600">Straordinario</Badge>
                                                    )}
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => { setDetailShift(shift); setIsDetailOpen(true); }}><Eye className="h-5 w-5" /></Button>
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
                                ))}
                            </>
                        ) : selectedDayInfo ? (
                            <LeaveDayCard type={selectedDayInfo.type} />
                        ): (
                            <div className="text-center h-24 flex items-center justify-center text-muted-foreground">Nessun turno trovato per questo giorno.</div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>

        <ResponsiveDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader><ResponsiveDialogTitle>Aggiungi Turno Manuale</ResponsiveDialogTitle></ResponsiveDialogHeader>
                <div className="grid gap-4 py-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label htmlFor="manual-entrata">Entrata*</Label><Input id="manual-entrata" type="time" value={newShift.entrata} onChange={e => handleInputChange('entrata', e.target.value)} required /></div>
                        <div className="space-y-2"><Label htmlFor="manual-uscita">Uscita*</Label><Input id="manual-uscita" type="time" value={newShift.uscita} onChange={e => handleInputChange('uscita', e.target.value)} required /></div>
                     </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label htmlFor="manual-pausa">Inizio Pausa (Opz.)</Label><Input id="manual-pausa" type="time" value={newShift.pausa} onChange={e => handleInputChange('pausa', e.target.value)} /></div>
                        <div className="space-y-2"><Label htmlFor="manual-fine-pausa">Fine Pausa (Opz.)</Label><Input id="manual-fine-pausa" type="time" value={newShift.fine_pausa} onChange={e => handleInputChange('fine_pausa', e.target.value)} /></div>
                     </div>
                </div>
                <ResponsiveDialogFooter><Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Annulla</Button><Button onClick={handleAddManualShift}>Salva Turno</Button></ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
        
        <ResponsiveDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader><ResponsiveDialogTitle>Modifica Turno</ResponsiveDialogTitle></ResponsiveDialogHeader>
                <div className="grid gap-4 py-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label htmlFor="edit-entrata">Entrata*</Label><Input id="edit-entrata" type="time" value={editShiftTimes.entrata} onChange={e => handleEditInputChange('entrata', e.target.value)} required /></div>
                        <div className="space-y-2"><Label htmlFor="edit-uscita">Uscita*</Label><Input id="edit-uscita" type="time" value={editShiftTimes.uscita} onChange={e => handleEditInputChange('uscita', e.target.value)} required /></div>
                     </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label htmlFor="edit-pausa">Inizio Pausa (Opz.)</Label><Input id="edit-pausa" type="time" value={editShiftTimes.pausa} onChange={e => handleEditInputChange('pausa', e.target.value)} /></div>
                        <div className="space-y-2"><Label htmlFor="edit-fine-pausa">Fine Pausa (Opz.)</Label><Input id="edit-fine-pausa" type="time" value={editShiftTimes.fine_pausa} onChange={e => handleEditInputChange('fine_pausa', e.target.value)} /></div>
                     </div>
                </div>
                <ResponsiveDialogFooter><Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Annulla</Button><Button onClick={handleEditShift}>Salva Modifiche</Button></ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>

         <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Sei sicuro di voler eliminare questo turno?</AlertDialogTitle><AlertDialogDescription>Questa azione è permanente e non può essere annullata. Tutte le timbrature associate a questo turno verranno eliminate.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel onClick={() => setShiftToDelete(null)}>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleDeleteShift}>Elimina</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

         <ResponsiveDialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <ResponsiveDialogContent className="sm:max-w-3xl">
                <ResponsiveDialogHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <ResponsiveDialogTitle>Dettaglio Turno</ResponsiveDialogTitle>
                            {detailShift?.startTime && <ResponsiveDialogDescription>Turno del {format(detailShift.startTime.toDate(), 'PPP', { locale: it })}</ResponsiveDialogDescription>}
                        </div>
                    </div>
                </ResponsiveDialogHeader>

                {detailShift && operator && (
                    <div className="grid grid-cols-3 gap-4 text-center my-4">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Ore Previste</p>
                            <p className="text-2xl font-bold">{getContractualHoursForShift(detailShift)}h</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Ore Lavorate</p>
                            <p className="text-2xl font-bold">{formatMinutes(detailShift.workDuration)}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Straordinari</p>
                            <p className="text-2xl font-bold">{calculateOvertimeWithTolerance(detailShift)}h</p>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto mt-2 max-h-80 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="whitespace-nowrap">Orario</TableHead>
                                <TableHead className="whitespace-nowrap">Evento</TableHead>
                                <TableHead className="whitespace-nowrap">Stato</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {detailShift?.events.map(t => (
                                <TableRow key={t.id}>
                                    <TableCell className="whitespace-nowrap">{format(t.timestamp.toDate(), 'p', { locale: it })}</TableCell>
                                    <TableCell className="capitalize whitespace-nowrap">{t.type.replace('_', ' ')}</TableCell>
                                    <TableCell className="whitespace-nowrap"><Badge variant={t.status === 'confermata' ? 'secondary' : t.status === 'rifiutata' ? 'destructive' : 'default'}>{t.status}</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <ResponsiveDialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Chiudi</Button>
                    {detailShift && !detailShift.isOvertime && (
                      <>
                        <Button variant="destructive" onClick={() => { setShiftToDelete(detailShift); setIsDeleteDialogOpen(true); }}><Trash2 className="mr-2 h-4 w-4"/> Elimina</Button>
                        <Button variant="outline" onClick={() => handleOpenEditDialog(detailShift)}><Pencil className="mr-2 h-4 w-4" /> Modifica</Button>
                      </>
                    )}
                </ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>

        </>
    );
}

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

    const handleDateClick = (date: Date) => {
        setDailyViewDate(date);
        setCurrentView('daily');
    };

    const handleCleanMonth = async () => {
        if (!firestore || !operatorId || !monthToClean) return;
        setIsCleaning(true);
    
        const monthStart = startOfMonth(monthToClean);
        const monthEnd = endOfMonth(monthToClean);
    
        try {
            const batch = writeBatch(firestore);
    
            // 1. Delete timbrature within the month
            const timbratureQuery = query(
                collection(firestore, `app-users/${operatorId}/timbrature`),
                where('timestamp', '>=', monthStart),
                where('timestamp', '<=', monthEnd)
            );
            const timbratureSnapshot = await getDocs(timbratureQuery);
            timbratureSnapshot.forEach(doc => batch.delete(doc.ref));
    
            // 2. Handle requests that overlap with the month
            const requestsQuery = query(
                collection(firestore, `app-users/${operatorId}/requests`),
                where('endDate', '>=', monthStart)
            );
            const requestsSnapshot = await getDocs(requestsQuery);
    
            for (const requestDoc of requestsSnapshot.docs) {
                const request = requestDoc.data() as Request;
                const reqStart = request.startDate.toDate();
                const reqEnd = request.endDate.toDate();
    
                // Skip if request is completely outside the month's potential overlap
                if (reqStart > monthEnd) continue;
    
                const ref = requestDoc.ref;
    
                // Case 1: Request is fully contained within the month
                if (reqStart >= monthStart && reqEnd <= monthEnd) {
                    batch.delete(ref);
                    continue;
                }
    
                // Case 2: Request starts before and ends after the month (spans across)
                if (reqStart < monthStart && reqEnd > monthEnd) {
                    // Split into two requests
                    // First part: update original to end before the cleaned month
                    batch.update(ref, { endDate: Timestamp.fromDate(subDays(monthStart, 1)) });
                    
                    // Second part: create a new request for the period after the cleaned month
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
    
                // Case 3: Request starts in the month and ends after
                if (reqStart >= monthStart && reqStart <= monthEnd && reqEnd > monthEnd) {
                    batch.update(ref, { startDate: Timestamp.fromDate(addDays(monthEnd, 1)) });
                    continue;
                }
    
                // Case 4: Request starts before and ends in the month
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
        <>
            <div className="space-y-6">
                <Card>
                     <CardHeader>
                        <div className="flex flex-col items-start gap-4">
                            <div>
                                 <CardTitle>Riepilogo Attività di {operator.username}</CardTitle>
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
                            <MonthlySummary 
                                operatorId={operatorId} 
                                operator={operator} 
                                onDateClick={handleDateClick} 
                                onCleanMonth={(date) => setMonthToClean(date)}
                            />
                        ) : (
                            <DailySummaryContent operatorId={operatorId} operator={operator} initialDate={dailyViewDate} />
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
        </>
    );
}
