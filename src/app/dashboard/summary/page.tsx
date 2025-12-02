'use client';
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';
import { Loader2, Briefcase, Plus, Plane, UserCheck, Stethoscope, Archive, Clock, Sun, Moon, Activity, Bed } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, addDays, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { useParams } from 'next/navigation';

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
    id: string;
    userId: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'confermata';
    isOvertime?: boolean;
};

const MonthlySummary = ({ operatorId, operator, onCleanMonth }: { operatorId: string, operator: Operator, onCleanMonth: (date: Date) => void }) => {
    const firestore = useFirestore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const {toast} = useToast();
    const { user } = useUser();

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
            where('timestamp', '<=', Timestamp.fromDate(endOfMonthValue)),
            where('status', '==', 'confermata')
        );
        
        const unsubRequests = onSnapshot(requestsQuery, s => {
            const allRequests = s.docs.map(d => ({id: d.id, ...d.data()} as Request));
            setRequests(allRequests);
        });

        const unsubTimbrature = onSnapshot(timbratureQuery, s => {
            const allTimbrature = s.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));
            setTimbrature(allTimbrature);
        });
        
        Promise.all([getDocs(requestsQuery), getDocs(timbratureQuery)]).then(() => setIsLoading(false));

        return () => { 
            unsubRequests(); 
            unsubTimbrature(); 
        };
    }, [firestore, operatorId, currentDate, toast]);
    
    const summary = useMemo(() => {
        if (!operator) {
            return { workedDays: 0, workedHours: 0, overtimeHours: 0, permessoHours: 0, malattiaDays: 0, ferieDays: 0 };
        }

        const monthInterval = { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };

        const timbratureByDay: { [key: string]: Timbratura[] } = {};
        timbrature.forEach(t => {
            const dayString = startOfDay(t.timestamp.toDate()).toISOString();
            if (!timbratureByDay[dayString]) timbratureByDay[dayString] = [];
            timbratureByDay[dayString].push(t);
        });

        const allWorkedShifts = Object.values(timbratureByDay).map(dayEvents => {
            const startTime = dayEvents.find(e => e.type === 'entrata')?.timestamp;
            const endTime = dayEvents.find(e => e.type === 'uscita')?.timestamp;
            let workDuration = 0;
            if (startTime && endTime) {
                let totalMillis = endTime.toMillis() - startTime.toMillis();
                let breakStart: Timestamp | null = null;
                dayEvents.forEach(e => {
                    if (e.type === 'pausa') breakStart = e.timestamp;
                    if (e.type === 'fine_pausa' && breakStart) {
                        totalMillis -= (e.timestamp.toMillis() - breakStart.toMillis());
                        breakStart = null;
                    }
                });
                workDuration = totalMillis > 0 ? totalMillis / (1000 * 60) : 0;
            }
            return {
                events: dayEvents,
                workDuration,
                isOvertime: dayEvents.some(e => e.isOvertime)
            };
        });

        const roundHours = (minutes: number): number => {
            if (minutes <= 0) return 0;
            const totalHalfHours = Math.floor(minutes / 30);
            return totalHalfHours / 2;
        };

        const totalOrdinaryHours = allWorkedShifts.filter(s => !s.isOvertime).reduce((sum, s) => sum + roundHours(s.workDuration), 0);
        const totalOvertimeHoursFromShifts = allWorkedShifts.filter(s => s.isOvertime).reduce((sum, s) => sum + roundHours(s.workDuration), 0);
        
        const totalPermessoHours = requests.filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval)).reduce((sum, r) => sum + (r.hours || 0), 0);
        const totalOvertimeHoursFromRequests = requests.filter(r => r.type === 'straordinario' && isWithinInterval(r.startDate.toDate(), monthInterval)).reduce((sum, r) => sum + (r.hours || 0), 0);
        
        let ferieDaysCount = 0;
        let malattiaDaysCount = 0;
        const processedLeaveDays = new Set<string>();

        requests.forEach(req => {
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

        return {
            workedDays: allWorkedShifts.length,
            workedHours: totalOrdinaryHours,
            overtimeHours: totalOvertimeHoursFromShifts + totalOvertimeHoursFromRequests,
            permessoHours: totalPermessoHours,
            malattiaDays: malattiaDaysCount,
            ferieDays: ferieDaysCount,
        };
    }, [timbrature, requests, operator, currentDate]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center gap-2">
                <Button variant="outline" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                <h4 className="text-lg font-semibold capitalize text-center flex-1">{format(currentDate, 'MMMM yyyy', { locale: it })}</h4>
                <Button variant="outline" onClick={() => handleMonthChange(1)}>Succ.</Button>
                 {user?.role === 'admin' && (
                    <Button variant="destructive" size="icon" onClick={() => onCleanMonth(currentDate)}><Archive className="h-4 w-4" /></Button>
                 )}
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle><Briefcase className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedDays}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ore Ordinarie</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedHours.toLocaleString('it-IT')}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ore Straordinarie</CardTitle><Plus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.overtimeHours.toLocaleString('it-IT')}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle><Plane className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.ferieDays}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle><UserCheck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.permessoHours}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle><Stethoscope className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.malattiaDays}</div></CardContent></Card>
            </div>
        </div>
    );
};

export default function OperatorSummaryPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const { toast } = useToast();
    const firestore = useFirestore();
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [monthToClean, setMonthToClean] = useState<Date | null>(null);
    const { operatorId: routeOperatorId } = useParams();

    useEffect(() => {
        if (!firestore) return;
        
        const idToFetch = user?.role === 'admin' ? routeOperatorId as string : user?.id;

        if (!idToFetch) {
            if(!isUserLoading) setIsLoading(false);
            return;
        };

        setIsLoading(true);
        const operatorDocRef = doc(firestore, 'app-users', idToFetch);
        getDoc(operatorDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            } else {
                toast({ title: 'Errore', description: 'Operatore non trovato', variant: 'destructive'});
            }
            setIsLoading(false);
        });
    }, [firestore, user, routeOperatorId, isUserLoading, toast]);

    const handleCleanMonth = async () => {
        if (!firestore || !operator?.id || !monthToClean) return;
        setIsCleaning(true);
    
        const monthStart = startOfMonth(monthToClean);
        const monthEnd = endOfMonth(monthToClean);
    
        try {
            const batch = writeBatch(firestore);
    
            // Delete timbrature
            const timbratureQuery = query(
                collection(firestore, `app-users/${operator.id}/timbrature`),
                where('timestamp', '>=', monthStart),
                where('timestamp', '<=', monthEnd)
            );
            const timbratureSnapshot = await getDocs(timbratureQuery);
            timbratureSnapshot.forEach(doc => batch.delete(doc.ref));
    
            // Handle requests
            const requestsQuery = query(
                collection(firestore, `app-users/${operator.id}/requests`),
                where('endDate', '>=', monthStart)
            );
            const requestsSnapshot = await getDocs(requestsQuery);
    
            for (const requestDoc of requestsSnapshot.docs) {
                const request = requestDoc.data() as Request;
                const reqStart = request.startDate.toDate();
                const reqEnd = request.endDate.toDate();
                if (reqStart > monthEnd) continue;
    
                const ref = requestDoc.ref;
                if (reqStart >= monthStart && reqEnd <= monthEnd) { // Fully contained
                    batch.delete(ref);
                } else if (reqStart < monthStart && reqEnd > monthEnd) { // Spans across
                    batch.update(ref, { endDate: Timestamp.fromDate(subDays(monthStart, 1)) });
                    const newDocRef = doc(collection(firestore, `app-users/${operator.id}/requests`));
                    batch.set(newDocRef, { ...request, startDate: Timestamp.fromDate(addDays(monthEnd, 1)) });
                } else if (reqEnd >= monthStart && reqEnd <= monthEnd) { // Ends in month
                    batch.update(ref, { endDate: Timestamp.fromDate(subDays(monthStart, 1)) });
                } else if (reqStart >= monthStart && reqStart <= monthEnd) { // Starts in month
                    batch.update(ref, { startDate: Timestamp.fromDate(addDays(monthEnd, 1)) });
                }
            }
    
            await batch.commit();
            toast({ title: 'Successo!', description: `I dati di ${format(monthToClean, 'MMMM yyyy', { locale: it })} sono stati elaborati.` });
    
        } catch (error) {
            console.error("Errore durante l'elaborazione del mese:", error);
            toast({ title: 'Errore', description: 'Impossibile completare l\'elaborazione.', variant: 'destructive' });
        } finally {
            setIsCleaning(false);
            setMonthToClean(null);
        }
    };

    if (isUserLoading || isLoading || !operator) {
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
                        </div>
                    </CardHeader>
                    <CardContent>
                       <MonthlySummary 
                            operatorId={operator.id} 
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
