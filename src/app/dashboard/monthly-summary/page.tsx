'use client';
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, getDocs } from 'firebase/firestore';
import { Loader2, Briefcase, Plus, Plane, UserCheck, Stethoscope, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { it } from 'date-fns/locale';

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

const MonthlySummaryContent = () => {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoadingOperator, setIsLoadingOperator] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        if (!firestore || !user?.id) {
            if(!isUserLoading) setIsLoadingOperator(false);
            return;
        };

        const operatorDocRef = doc(firestore, 'app-users', user.id);
        const unsubscribe = onSnapshot(operatorDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            } else {
                toast({ title: 'Errore', description: 'Operatore non trovato', variant: 'destructive'});
            }
            setIsLoadingOperator(false);
        });

        return () => unsubscribe();
    }, [firestore, user, isUserLoading, toast]);


    useEffect(() => {
        if (!firestore || !operator?.id) return;
        setIsLoadingData(true);

        const startOfMonthValue = startOfMonth(currentDate);
        const endOfMonthValue = endOfMonth(currentDate);

        const requestsQuery = query(
            collection(firestore, `app-users/${operator.id}/requests`),
            where('status', '==', 'approvato')
        );
        
        const timbratureQuery = query(
            collection(firestore, `app-users/${operator.id}/timbrature`),
            where('timestamp', '>=', Timestamp.fromDate(startOfMonthValue)),
            where('timestamp', '<=', Timestamp.fromDate(endOfMonthValue)),
            where('status', '==', 'confermata')
        );
        
        const unsubRequests = onSnapshot(requestsQuery, s => {
            setRequests(s.docs.map(d => ({id: d.id, ...d.data()} as Request)));
            if (!unsubTimbrature) setIsLoadingData(false); 
        }, () => setIsLoadingData(false));

        const unsubTimbrature = onSnapshot(timbratureQuery, s => {
            setTimbrature(s.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)));
            if (!unsubRequests) setIsLoadingData(false); 
        }, () => setIsLoadingData(false));
        
        Promise.all([getDocs(requestsQuery), getDocs(timbratureQuery)]).then(() => setIsLoadingData(false));

        return () => { 
            unsubRequests(); 
            unsubTimbrature(); 
        };
    }, [firestore, operator, currentDate]);
    
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

    if (isUserLoading || isLoadingOperator) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!operator) {
        return <div className="text-center text-muted-foreground p-8">Operatore non trovato.</div>;
    }

    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                           <h1 className="text-3xl font-bold tracking-tight">{operator.firstName} {operator.lastName}</h1>
                           <p className="text-muted-foreground">Riepilogo Mensile (Codice: {operator.username})</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center gap-2">
                            <Button variant="outline" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                            <h4 className="text-lg font-semibold capitalize text-center flex-1">{format(currentDate, 'MMMM yyyy', { locale: it })}</h4>
                            <Button variant="outline" onClick={() => handleMonthChange(1)}>Succ.</Button>
                        </div>
                        
                        {isLoadingData ? (
                            <div className="flex justify-center items-center h-48"><Loader2 className="h-6 w-6 animate-spin"/></div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle><Briefcase className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedDays}</div></CardContent></Card>
                                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ore Ordinarie</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedHours.toLocaleString('it-IT')}</div></CardContent></Card>
                                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ore Straordinarie</CardTitle><Plus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.overtimeHours.toLocaleString('it-IT')}</div></CardContent></Card>
                                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle><Plane className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.ferieDays}</div></CardContent></Card>
                                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle><UserCheck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.permessoHours}</div></CardContent></Card>
                                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle><Stethoscope className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.malattiaDays}</div></CardContent></Card>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};


export default function MonthlySummaryPage() {
    return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <MonthlySummaryContent />
        </Suspense>
    );
}