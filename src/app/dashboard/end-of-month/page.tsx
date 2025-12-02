'use client';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import { Loader2, Printer } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, set, parse, isValid } from 'date-fns';
import { it } from 'date-fns/locale';
import { useSearchParams } from 'next/navigation';

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
    role: 'admin' | 'operator';
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    userId: string;
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    isAuto?: boolean;
    userId: string;
};

type OperatorMonthlyData = {
    operator: Operator;
    dailyDetails: {
        date: Date;
        status: 'lavorato' | 'ferie' | 'malattia' | 'permesso' | 'mancata_timbratura' | 'riposo';
        timbrature: Timbratura[];
        calculatedHours: {
            ordinary: number;
            overtime: number;
            permission: number;
            worked: number;
        };
        calculationTimes: {
            start: Date | null;
            end: Date | null;
        }
    }[];
    summary: {
        ordinaryHours: number;
        overtimeHours: number;
        permissionHours: number;
        ferieDays: number;
        malattiaDays: number;
    }
};

const MonthlyReportContent = () => {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const [operators, setOperators] = useState<Operator[]>([]);
    const [monthlyData, setMonthlyData] = useState<OperatorMonthlyData[]>([]);
    const [targetMonth, setTargetMonth] = useState(new Date());
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isPrinting, setIsPrinting] = useState(false);

    useEffect(() => {
        const monthParam = searchParams.get('month'); // YYYY-MM
        if (monthParam) {
            const [year, month] = monthParam.split('-').map(Number);
            const date = new Date(year, month - 1, 15); // Use 15th to avoid timezone issues
            if (isValid(date)) {
                setTargetMonth(date);
            }
        }
    }, [searchParams]);

    useEffect(() => {
        if (!firestore) return;
        
        const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const allOperators = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            const filteredOperators = allOperators.filter(op => op.username !== 'test');
            filteredOperators.sort((a,b) => a.firstName.localeCompare(b.firstName));
            setOperators(filteredOperators);
        });
        return () => unsubscribe();
    }, [firestore]);

    const calculateHours = (timbrature: Timbratura[], schedule: DailySchedule | undefined, operator: Operator | null): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date | null } => {
        if (!operator) return { workedMinutes: 0, calculationStart: null, calculationEnd: null };
        const clockInEvent = timbrature.find(e => e.type === 'entrata');
        const clockOutEvent = timbrature.find(e => e.type === 'uscita');

        if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null, calculationEnd: null };

        const clockInTime = clockInEvent.timestamp.toDate();
        const clockOutTime = clockOutEvent.timestamp.toDate();
        
        let calculationStartTime = clockInTime;
        
        if (schedule?.startTime) {
            const [contractualH, contractualM] = schedule.startTime.split(':').map(Number);
            const contractualStartDateTime = set(clockInTime, { hours: contractualH, minutes: contractualM, seconds: 0, milliseconds: 0 });
            if (calculationStartTime < contractualStartDateTime) {
                calculationStartTime = contractualStartDateTime;
            }
        }
        
        let calculationEndTime = clockOutTime;
        if(schedule?.endTime) {
            const [h, m] = schedule.endTime.split(':').map(Number);
            const contractualEnd = set(clockInTime, {hours: h, minutes: m, seconds: 0});
            if(calculationEndTime > contractualEnd) {
                calculationEndTime = contractualEnd;
            }
        }

        let totalMillis = calculationEndTime.getTime() - calculationStartTime.getTime();
        
        let breakDurationMillis = 0;
        let breakStartTs: Timestamp | null = null;
        for (const e of timbrature) {
            if (e.type === 'pausa') breakStartTs = e.timestamp;
            if (e.type === 'fine_pausa' && breakStartTs) {
                breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
                breakStartTs = null;
            }
        }
        totalMillis -= breakDurationMillis;
        
        return { 
            workedMinutes: totalMillis > 0 ? totalMillis / (1000 * 60) : 0, 
            calculationStart: calculationStartTime,
            calculationEnd: calculationEndTime
        };
    };

    useEffect(() => {
        if (!firestore || operators.length === 0) {
            setIsLoadingData(false);
            return;
        }

        setIsLoadingData(true);
        const monthStart = startOfMonth(targetMonth);
        const monthEnd = endOfMonth(targetMonth);
        const allDaysOfMonth = eachDayOfInterval({start: monthStart, end: monthEnd});

        const fetchData = async () => {
            try {
                const requestsCollectionGroup = collectionGroup(firestore, 'requests');
                const requestsQuery = query(requestsCollectionGroup, where('status', '==', 'approvato'));
                const requestsSnapshot = await getDocs(requestsQuery);
                const allRequests = requestsSnapshot.docs.map(doc => ({ id: doc.id, userId: doc.ref.parent.parent?.id, ...doc.data() } as Request));

                const timbratureCollectionGroup = collectionGroup(firestore, 'timbrature');
                const timbratureQuery = query(timbratureCollectionGroup, 
                    where('timestamp', '>=', monthStart), 
                    where('timestamp', '<=', monthEnd),
                    where('status', '==', 'confermata')
                );
                const timbratureSnapshot = await getDocs(timbratureQuery);
                const allTimbrature = timbratureSnapshot.docs.map(doc => ({ id: doc.id, userId: doc.ref.parent.parent?.id, ...doc.data() } as Timbratura));
                
                const processedData: OperatorMonthlyData[] = operators.map(op => {
                    const operatorRequests = allRequests.filter(r => r.userId === op.id);
                    const operatorTimbratureAll = allTimbrature.filter(t => t.userId === op.id);

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

                    const dailyDetails = allDaysOfMonth.map(day => {
                        const dayName = dayIndexToName[getDay(day)];
                        const schedule = op.workSchedule?.[dayName];
                        const contractualHours = schedule?.totalHours || 0;

                        const dayTimbrature = operatorTimbratureAll.filter(t => isSameDay(t.timestamp.toDate(), day)).sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                        const leaveRequest = operatorRequests.find(r => 
                            (r.type === 'ferie' || r.type === 'malattia') && 
                            isWithinInterval(day, { start: r.startDate.toDate(), end: r.endDate.toDate() })
                        );
                        
                        const permissionRequest = operatorRequests.find(r => 
                            r.type === 'permesso' && isSameDay(day, r.startDate.toDate())
                        );

                        let status: OperatorMonthlyData['dailyDetails'][0]['status'] = 'riposo';
                        let calculatedHours = { ordinary: 0, overtime: 0, permission: permissionRequest?.hours || 0, worked: 0 };
                        let calculationTimes = { start: null, end: null };

                        if (dayTimbrature.length > 0) {
                             status = 'lavorato';
                            const { workedMinutes, calculationStart, calculationEnd } = calculateHours(dayTimbrature, schedule, op);
                            calculationTimes.start = calculationStart;
                            calculationTimes.end = calculationEnd;
                            calculatedHours.worked = workedMinutes;
                            const contractualMinutes = contractualHours * 60;
                            
                            const ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
                            calculatedHours.ordinary = roundOrdinaryHours(ordinaryMinutes);
                            
                            const overtimeMinutes = workedMinutes > contractualMinutes ? workedMinutes - contractualMinutes : 0;
                            calculatedHours.overtime = roundOvertimeHours(overtimeMinutes);
                        } else if (leaveRequest) {
                            status = leaveRequest.type;
                        } else if (permissionRequest) {
                            status = 'permesso';
                        } else if (contractualHours > 0) {
                            status = 'mancata_timbratura';
                        }
                        
                        return { date: day, status, timbrature: dayTimbrature, calculatedHours, calculationTimes };
                    });

                    const summary = dailyDetails.reduce((acc, day) => {
                        if (day.status === 'lavorato') {
                           acc.ordinaryHours += day.calculatedHours.ordinary;
                           acc.overtimeHours += day.calculatedHours.overtime;
                        }
                         if (day.status === 'permesso') {
                           acc.permissionHours += day.calculatedHours.permission;
                        }
                        if (day.status === 'ferie') acc.ferieDays += 1;
                        if (day.status === 'malattia') acc.malattiaDays += 1;
                        return acc;
                    }, { ordinaryHours: 0, overtimeHours: 0, permissionHours: 0, ferieDays: 0, malattiaDays: 0 });

                    return { operator: op, dailyDetails, summary };
                });
                
                setMonthlyData(processedData);
            } catch (error) {
                console.error("Error fetching monthly report data:", error);
                toast({
                    title: "Errore di Caricamento",
                    description: "Impossibile caricare i dati per il report mensile.",
                    variant: "destructive"
                });
            } finally {
                setIsLoadingData(false);
            }
        };

        fetchData();

    }, [firestore, targetMonth, operators, toast]);
    
    const handlePrint = () => {
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 100);
    };

    if (isUserLoading) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
     if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground p-8">Accesso negato.</div>;
    }

    return (
         <Card className="p-4 sm:p-6 print:shadow-none print:border-none">
            <CardHeader className="print:hidden">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <CardTitle className="text-2xl capitalize">Report Mensile - {format(targetMonth, 'MMMM yyyy', { locale: it })}</CardTitle>
                        <CardDescription>
                           Riepilogo mensile delle attività di tutti gli operatori.
                        </CardDescription>
                    </div>
                     <Button onClick={handlePrint} disabled={isPrinting}>
                        <Printer className="mr-2 h-4 w-4" />
                        {isPrinting ? 'Stampa in corso...' : 'Stampa Report'}
                    </Button>
                </div>
            </CardHeader>
             <CardContent>
                <div className="mt-6 print:mt-0" id="print-area">
                     {isLoadingData ? (
                        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                     ) : monthlyData.length > 0 ? (
                        <div className="space-y-8">
                            {monthlyData.map(({operator, dailyDetails, summary}) => (
                                <div key={operator.id} className="break-inside-avoid">
                                     <div className="border-b-2 border-primary pb-2 mb-4">
                                        <h3 className="text-xl font-bold">{operator.firstName} {operator.lastName}</h3>
                                        <p className="text-sm text-muted-foreground">Codice: {operator.username}</p>
                                     </div>
                                     <div className="grid grid-cols-3 md:grid-cols-5 gap-2 text-center mb-4 text-sm">
                                         <div className="border rounded p-2"><p className="font-bold">{summary.ordinaryHours}h</p><p className="text-xs text-muted-foreground">Ordinarie</p></div>
                                         <div className="border rounded p-2"><p className="font-bold">{summary.overtimeHours}h</p><p className="text-xs text-muted-foreground">Straordinario</p></div>
                                         <div className="border rounded p-2"><p className="font-bold">{summary.permissionHours}h</p><p className="text-xs text-muted-foreground">Permessi</p></div>
                                         <div className="border rounded p-2"><p className="font-bold">{summary.ferieDays}</p><p className="text-xs text-muted-foreground">Ferie</p></div>
                                         <div className="border rounded p-2"><p className="font-bold">{summary.malattiaDays}</p><p className="text-xs text-muted-foreground">Malattia</p></div>
                                     </div>
                                     <div className="space-y-1 text-xs">
                                     {dailyDetails.filter(d => d.status !== 'riposo').map(day => {
                                         let statusText;
                                         let resultText = '';
                                         
                                          const formatTimbraturaTime = (type: Timbratura['type'], calcTime: Date | null, timbrature: Timbratura[]) => {
                                            const event = timbrature.find(t => t.type === type);
                                            if (!event) return '-';
                                            const originalTime = format(event.timestamp.toDate(), 'HH:mm');
                                            if (calcTime && Math.abs(calcTime.getTime() - event.timestamp.toDate().getTime()) > 60000) {
                                                return `${originalTime} (${format(calcTime, 'HH:mm')})`;
                                            }
                                            return originalTime;
                                        }

                                         switch (day.status) {
                                            case 'lavorato':
                                                const { calculatedHours, calculationTimes, timbrature } = day;
                                                const entrata = formatTimbraturaTime('entrata', calculationTimes.start, timbrature);
                                                const pausa = formatTimbraturaTime('pausa', null, timbrature);
                                                const fine_pausa = formatTimbraturaTime('fine_pausa', null, timbrature);
                                                const uscita = formatTimbraturaTime('uscita', calculationTimes.end, timbrature);
                                                statusText = <span className="font-mono">{`${entrata} | ${pausa}-${fine_pausa} | ${uscita}`}</span>;
                                                
                                                const oreMancanti = (operator.workSchedule[dayIndexToName[getDay(day.date)]]?.totalHours || 0) - calculatedHours.ordinary;
                                                
                                                if (calculatedHours.overtime > 0) resultText = `Ord: ${calculatedHours.ordinary}h | Straord: ${calculatedHours.overtime}h`;
                                                else if (oreMancanti > 0) resultText = `Ord: ${calculatedHours.ordinary}h | Perm: ${oreMancanti}h`;
                                                else resultText = `Ord: ${calculatedHours.ordinary}h`;
                                                break;
                                            case 'ferie': statusText = <span className="font-semibold text-green-600">IN FERIE</span>; break;
                                            case 'malattia': statusText = <span className="font-semibold text-red-600">IN MALATTIA</span>; break;
                                            case 'permesso': statusText = <span className="font-semibold text-cyan-600">PERMESSO</span>; resultText = `${day.calculatedHours.permission} ore`; break;
                                            case 'mancata_timbratura': statusText = <span className="font-semibold text-yellow-600">MANCATA TIMBRATURA</span>; break;
                                        }

                                        return (
                                            <div key={day.date.toISOString()} className="grid grid-cols-1 md:grid-cols-3 items-center border-t py-2 gap-1">
                                                <div className="font-semibold capitalize">{format(day.date, 'eee dd/MM', { locale: it })}</div>
                                                <div className="md:text-center text-muted-foreground">{statusText}</div>
                                                <div className="md:text-right font-semibold">{resultText}</div>
                                            </div>
                                        )
                                     })}
                                     </div>
                                </div>
                            ))}
                        </div>
                     ) : (
                        <div className="text-center py-16 text-muted-foreground">Nessuna attività registrata per questo mese.</div>
                     )}
                </div>
            </CardContent>
        
        <style jsx global>{`
            @media print {
                body * {
                    visibility: hidden;
                }
                #print-area, #print-area * {
                    visibility: visible;
                }
                #print-area {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                }
                 .break-inside-avoid {
                    break-inside: avoid;
                }
            }
            @page {
                size: A4;
                margin: 20mm;
            }
        `}</style>
      </Card>
    );
}

export default function EndOfMonthPage() {
    return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <MonthlyReportContent />
        </Suspense>
    )
}
