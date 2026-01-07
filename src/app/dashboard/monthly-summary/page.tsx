// src/app/dashboard/monthly-summary/page.tsx

'use client';
import React, { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, set, startOfDay, parse, isAfter } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { isPublicHoliday } from '@/lib/holidays';
import { processMonthlyData, calculateShiftDetails, type DailyDetail, type MonthlySummary, calculateHours } from '@/lib/calculations';


// Type definitions are now in calculations.ts
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
    startTime?: string; // "HH:mm"
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
    contractType?: 'weekly' | 'monthly';
    totalMonthlyHours?: number;
    overtimeCalculation?: 'hourly' | 'half_hourly';
    hourlyRate?: number;
    overtimeRate?: number;
};

type Request = {
    id: string;
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
    status: 'sospesa' | 'confermata' | 'rifiutata';
    isOvertime?: boolean;
    isAuto?: boolean;
    ignoreContractualStart?: boolean;
    makeupOfDay?: string;
};

const SummaryCard = ({ title, value, icon: Icon }: { title: string, value: string | number, icon: React.ElementType }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

const InfoBox = ({ label, value }: { label: string, value: string }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
    </div>
);


const MonthlySummaryContent = () => {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoadingOperator, setIsLoadingOperator] = useState(true);
    const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[] }>({ timbrature: [], requests: [] });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Set the initial month only on the client side
        setCurrentMonth(new Date());
    }, []);

    const fetchOperatorData = useCallback(async () => {
        if (!firestore || !user?.id) {
            if(!isUserLoading) setIsLoadingOperator(false);
            return;
        }
        setIsLoadingOperator(true);
        const operatorDocRef = doc(firestore, 'app-users', user.id);
        const docSnap = await getDoc(operatorDocRef);
        if (docSnap.exists()) {
            setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
        } else {
            toast({ title: 'Errore', description: 'Operatore non trovato', variant: 'destructive'});
        }
        setIsLoadingOperator(false);
    }, [firestore, user, isUserLoading, toast]);


    useEffect(() => {
        fetchOperatorData();
    }, [fetchOperatorData]);


    const fetchDataForMonth = useCallback(async () => {
        if (!firestore || !user?.id || !currentMonth) {
            setIsLoading(false);
            return;
        };
        setIsLoading(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        try {
            const timbratureQuery = query(
                collection(firestore, `app-users/${user.id}/timbrature`),
                where('timestamp', '>=', monthStart),
                where('timestamp', '<=', monthEnd)
            );
            const requestsQuery = query(
                collection(firestore, `app-users/${user.id}/requests`),
                where('status', '==', 'approvato')
            );
    
            const [timbratureSnapshot, requestsSnapshot] = await Promise.all([
                getDocs(timbratureQuery),
                getDocs(requestsSnapshot)
            ]);

            const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)).filter(t => t.status === 'confermata');
            const requestsData = requestsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Request));

            setMonthlyData({ timbrature: timbratureData, requests: requestsData });
        } catch (error) {
            console.error("Error fetching monthly data:", error);
            toast({ title: 'Errore', description: "Impossibile caricare i dati del mese.", variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, user, currentMonth, toast]);

    useEffect(() => {
        if(currentMonth) {
            fetchDataForMonth();
        }
    }, [fetchDataForMonth, currentMonth]);

    
    const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator || isLoading || !currentMonth) {
            return { monthlySummary: {} as MonthlySummary, dailyDetails: [] as DailyDetail[] };
        }
        return processMonthlyData(currentMonth, operator, monthlyData);
    }, [operator, currentMonth, monthlyData, isLoading]);


    const handleMonthChange = (offset: number) => {
        setCurrentMonth(prev => prev ? new Date(prev.getFullYear(), prev.getMonth() + offset, 1) : new Date());
    };

    const canGoBack = useMemo(() => {
        if (!currentMonth) return false;
        const realCurrentMonth = startOfMonth(new Date());
        const previousMonth = startOfMonth(new Date(realCurrentMonth.setMonth(realCurrentMonth.getMonth() - 1)));
        return isAfter(startOfMonth(currentMonth), previousMonth);
    }, [currentMonth]);
    
    const canGoForward = useMemo(() => {
        if (!currentMonth) return false;
        const realCurrentMonth = startOfMonth(new Date());
        return isAfter(realCurrentMonth, startOfMonth(currentMonth));
    }, [currentMonth]);


    if (isUserLoading || isLoadingOperator || !currentMonth) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!operator) {
        return <div className="text-center text-muted-foreground p-8">Operatore non trovato.</div>;
    }


    return (
        <Card className="p-4 sm:p-6">
            <CardHeader className="pt-2">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                         <h1 className="text-3xl font-bold tracking-tight">{operator.firstName} {operator.lastName}</h1>
                        <p className="text-muted-foreground">Riepilogo Mensile (Codice: {operator.username})</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                 <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                    <Button variant="outline" size="icon" onClick={() => handleMonthChange(-1)} disabled={!canGoBack}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                        <Button variant="ghost" size="icon" onClick={fetchDataForMonth} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => handleMonthChange(1)} disabled={!canGoForward}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                
                 {isLoading ? (
                    <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                ) : (
                <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SummaryCard title="Giorni Lavorati" value={monthlySummary.workedDays || 0} icon={Briefcase} />
                    <SummaryCard title="Ore Ordinarie" value={(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')} icon={Clock} />
                    <SummaryCard title="Ore Straordinarie" value={(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')} icon={Plus} />
                    <SummaryCard title="Ferie (giorni)" value={monthlySummary.ferieDays || 0} icon={Plane} />
                    <SummaryCard title="Permessi (ore)" value={(monthlySummary.permessoHours || 0).toLocaleString('it-IT')} icon={UserCheck} />
                    <SummaryCard title="Malattia (giorni)" value={monthlySummary.malattiaDays || 0} icon={Stethoscope} />
                </div>

                <Separator />

                <div>
                    <h3 className="text-xl font-semibold mb-4">Dettaglio Giornaliero</h3>
                    {dailyDetails.length > 0 ? (
                        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                            {dailyDetails.map(detail => {
                                 if (detail.status === 'riposo') return null;

                                 const isSunday = getDay(detail.date) === 0;

                                return (
                                <div key={detail.date.toISOString()} className={cn("border rounded-lg p-3", isSunday && "border-red-500/30 bg-red-500/5")}>
                                    <h4 className={cn("font-bold text-lg capitalize flex items-center gap-3", isSunday && "text-red-600")}>
                                        {detail.status === 'ferie' && <Plane className="h-5 w-5 text-green-500" />}
                                        {detail.status === 'malattia' && <Stethoscope className="h-5 w-5 text-red-500" />}
                                        {detail.status === 'mancata_timbratura' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                                        {detail.status === 'lavorato' && <Briefcase className="h-5 w-5 text-blue-500" />}
                                        {detail.status === 'festa' && <Briefcase className="h-5 w-5 text-purple-500" />}

                                        {format(detail.date, 'eeee dd MMMM', { locale: it })}
                                    </h4>

                                    <div className="border-b my-2"></div>
                                    
                                    {detail.status === 'lavorato' && detail.shift?.allShifts ? (
                                        <>
                                            <div className="text-sm text-muted-foreground mt-1 mb-3 space-y-2">
                                                 {detail.shift.allShifts.map((shiftBlock, idx) => {
                                                    const timbratureString = shiftBlock.events.map(e => {
                                                        const originalTime = format(e.timestamp.toDate(), 'HH:mm:ss');
                                                        let referenceTime = '';
                                                        
                                                        if (e.type === 'entrata' && shiftBlock.calculationStart) {
                                                            referenceTime = `(${format(shiftBlock.calculationStart, 'HH:mm')})`;
                                                        } else if (e.type === 'uscita' && shiftBlock.calculationEnd) {
                                                            referenceTime = `(${format(shiftBlock.calculationEnd, 'HH:mm')})`;
                                                        }

                                                        const typeFormatted = e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ');
                                                        return `${typeFormatted}: ${originalTime} ${referenceTime}`.trim();
                                                    }).join(' | ');

                                                     return (
                                                        <div key={idx} className="border-b pb-1 last:border-b-0">
                                                            <span className="font-medium mr-2 text-foreground">{`Turno ${idx + 1}:`}</span>
                                                            <span className="text-muted-foreground">{timbratureString}</span>
                                                        </div>
                                                     )
                                                 })}
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <InfoBox label="Ore Previste" value={`${detail.shift.contractualHours}h`} />
                                                <InfoBox label="Ore Ordinarie" value={`${detail.shift.ordinaryHours}h`} />
                                                <InfoBox label="Straordinario" value={`${detail.shift.overtimeHours}h`} />
                                                <InfoBox label="Permesso" value={`${detail.shift.permissionHours}h`} />
                                            </div>
                                        </>
                                    ) : detail.status === 'ferie' ? (
                                        <p className="text-muted-foreground mt-1">Giorno di ferie approvato.</p>
                                    ) : detail.status === 'malattia' ? (
                                        <p className="text-muted-foreground mt-1">Giorno di malattia approvato.</p>
                                    ) : detail.status === 'festa' ? (
                                        <p className="text-muted-foreground mt-1">Giorno festivo.</p>
                                    ) : detail.status === 'mancata_timbratura' ? (
                                        <p className="text-yellow-600 font-semibold mt-1">Assenza.</p>
                                    ) : null}

                                </div>
                            )})}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Nessun dato da mostrare per questo mese.</p>
                    )}
                </div>
                </>
                )}
            </CardContent>
        </Card>
    );
}

export default function MonthlySummaryPage() {
    return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <MonthlySummaryContent />
        </Suspense>
    );
}
