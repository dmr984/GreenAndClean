'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import { Loader2, Printer, Calendar as CalendarIcon, Eye } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, getDay, startOfDay, endOfDay, isWithinInterval, addDays, isSameDay, set, parse, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

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
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    isAuto?: boolean;
    userId: string;
};

type OperatorDailyData = {
    operator: Operator;
    status: 'lavorato' | 'ferie' | 'malattia' | 'permesso' | 'mancata_timbratura' | 'riposo';
    timbrature: Timbratura[];
    request: Request | null;
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
}

const formatMinutes = (minutes: number) => {
    if (isNaN(minutes) || minutes < 0) return '00:00';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export default function DailyReportPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const router = useRouter();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [dailyData, setDailyData] = useState<OperatorDailyData[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isPrinting, setIsPrinting] = useState(false);

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
        const dayStart = startOfDay(selectedDate);
        const dayEnd = endOfDay(selectedDate);

        const fetchData = async () => {
            try {
                const requestsCollectionGroup = collectionGroup(firestore, 'requests');
                const requestsQuery = query(requestsCollectionGroup, where('status', '==', 'approvato'));
                const requestsSnapshot = await getDocs(requestsQuery);
                const allRequests = requestsSnapshot.docs.map(doc => ({ id: doc.id, userId: doc.ref.parent.parent?.id, ...doc.data() } as Request & { userId: string }));

                const timbratureCollectionGroup = collectionGroup(firestore, 'timbrature');
                const timbratureQuery = query(timbratureCollectionGroup, 
                    where('timestamp', '>=', dayStart), 
                    where('timestamp', '<=', dayEnd),
                    where('status', '==', 'confermata')
                );
                const timbratureSnapshot = await getDocs(timbratureQuery);
                const allTimbrature = timbratureSnapshot.docs.map(doc => ({ id: doc.id, userId: doc.ref.parent.parent?.id, ...doc.data() } as Timbratura));
                
                const processedData: OperatorDailyData[] = operators.map(op => {
                    const dayName = dayIndexToName[getDay(selectedDate)];
                    const schedule = op.workSchedule?.[dayName];
                    const contractualHours = schedule?.totalHours || 0;
                    
                    const operatorTimbrature = allTimbrature.filter(t => t.userId === op.id).sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                    const operatorRequests = allRequests.filter(r => r.userId === op.id);

                    const leaveRequest = operatorRequests.find(r => 
                        (r.type === 'ferie' || r.type === 'malattia') && 
                        isWithinInterval(selectedDate, { start: r.startDate.toDate(), end: r.endDate.toDate() })
                    );

                    const permissionRequest = operatorRequests.find(r => 
                        r.type === 'permesso' && isSameDay(selectedDate, r.startDate.toDate())
                    );
                    
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
                    
                    let status: OperatorDailyData['status'] = 'riposo';
                    let calculatedHours = { ordinary: 0, overtime: 0, permission: permissionRequest?.hours || 0, worked: 0 };
                    let calculationTimes = { start: null, end: null };

                    if (operatorTimbrature.length > 0) {
                        status = 'lavorato';
                        const { workedMinutes, calculationStart, calculationEnd } = calculateHours(operatorTimbrature, schedule, op);
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

                    return {
                        operator: op,
                        status: status,
                        timbrature: operatorTimbrature,
                        request: leaveRequest || permissionRequest || null,
                        calculatedHours,
                        calculationTimes
                    };
                });
                
                setDailyData(processedData);
            } catch (error) {
                console.error("Error fetching daily report data:", error);
                toast({
                    title: "Errore di Caricamento",
                    description: "Impossibile caricare i dati per il report. Controlla la console per dettagli.",
                    variant: "destructive"
                });
            } finally {
                setIsLoadingData(false);
            }
        };

        fetchData();

    }, [firestore, selectedDate, operators, toast]);

    const handleDateChange = (offset: number) => {
        setSelectedDate(prev => addDays(prev, offset));
    };
    
    const handlePrint = () => {
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 100);
    };

    const handlePrintMonth = () => {
        const month = format(selectedDate, 'yyyy-MM');
        router.push(`/dashboard/end-of-month?month=${month}`);
    };
    
    if (isUserLoading) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
     if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground p-8">Accesso negato.</div>;
    }

    const renderOperatorRow = (data: OperatorDailyData) => {
        const { operator, status, timbrature, calculatedHours, calculationTimes } = data;

        const formatTimbraturaTime = (type: Timbratura['type'], calcTime: Date | null) => {
            const event = timbrature.find(t => t.type === type);
            if (!event) return '-';
            const originalTime = format(event.timestamp.toDate(), 'HH:mm');
            if (calcTime && Math.abs(calcTime.getTime() - event.timestamp.toDate().getTime()) > 60000) {
                return `${originalTime} (${format(calcTime, 'HH:mm')})`;
            }
            return originalTime;
        }

        let statusText;
        let resultText = '';

        switch (status) {
            case 'lavorato':
                const entrata = formatTimbraturaTime('entrata', calculationTimes.start);
                const pausa = formatTimbraturaTime('pausa', null);
                const fine_pausa = formatTimbraturaTime('fine_pausa', null);
                const uscita = formatTimbraturaTime('uscita', calculationTimes.end);
                statusText = `${entrata} | ${pausa} - ${fine_pausa} | ${uscita}`;
                
                if (calculatedHours.overtime > 0) {
                    resultText = `Ordinarie: ${calculatedHours.ordinary}h | Straordinario: ${calculatedHours.overtime}h`;
                } else if (calculatedHours.permission > 0) {
                     resultText = `Ordinarie: ${calculatedHours.ordinary}h | Permesso: ${calculatedHours.permission}h`;
                } else {
                     const oreMancanti = (operator.workSchedule[dayIndexToName[getDay(selectedDate)]]?.totalHours || 0) - calculatedHours.ordinary;
                     if (oreMancanti > 0) {
                         resultText = `Ordinarie: ${calculatedHours.ordinary}h | Permesso: ${oreMancanti}h`;
                     } else {
                        resultText = `Ordinarie: ${calculatedHours.ordinary}h`;
                     }
                }
                break;
            case 'ferie':
                statusText = <span className="font-semibold text-green-600">IN FERIE</span>;
                break;
            case 'malattia':
                statusText = <span className="font-semibold text-red-600">IN MALATTIA</span>;
                break;
            case 'permesso':
                statusText = <span className="font-semibold text-cyan-600">PERMESSO</span>;
                resultText = `${calculatedHours.permission} ore`;
                break;
            case 'mancata_timbratura':
                statusText = <span className="font-semibold text-yellow-600">MANCATA TIMBRATURA</span>;
                break;
            case 'riposo':
                return null; // Don't render anything for rest days
        }

        return (
             <div key={operator.id} className="grid grid-cols-1 md:grid-cols-3 items-center border-b p-3 gap-2 break-inside-avoid">
                <div className="font-bold text-base">{operator.firstName} {operator.lastName}</div>
                <div className="text-sm md:text-center text-muted-foreground font-mono">{statusText}</div>
                <div className="text-sm md:text-right font-semibold">{resultText}</div>
             </div>
        )
    }

    return (
        <Card className="p-4 sm:p-6 print:shadow-none print:border-none">
            <CardHeader className="print:hidden">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-6 w-6" />
                            <CardTitle className="text-2xl">Report del Giorno</CardTitle>
                        </div>
                        <CardDescription>
                           Riepilogo delle attività giornaliere di tutti gli operatori.
                        </CardDescription>
                    </div>
                     <div className="flex gap-2">
                        <Button onClick={handlePrint} variant="outline" disabled={isPrinting}>
                            <Printer className="mr-2 h-4 w-4" />
                            Stampa Giorno
                        </Button>
                        <Button onClick={handlePrintMonth} disabled={isPrinting}>
                            <Printer className="mr-2 h-4 w-4" />
                            Stampa Mese
                        </Button>
                     </div>
                </div>
            </CardHeader>
             <CardContent>
                <div className="flex items-center justify-between gap-2 p-2 border rounded-md print:hidden">
                    <Button variant="outline" size="sm" onClick={() => handleDateChange(-1)}>Prec.</Button>
                    <h3 className="text-lg font-semibold text-center capitalize">{format(selectedDate, 'eeee dd MMMM yyyy', { locale: it })}</h3>
                    <Button variant="outline" size="sm" onClick={() => handleDateChange(1)}>Succ.</Button>
                </div>
                
                <div className="mt-6 print:mt-0" id="print-area">
                    {isPrinting && (
                        <div className="text-center mb-4">
                            <h2 className="text-2xl font-bold">Report del {format(selectedDate, 'dd/MM/yyyy')}</h2>
                            <p className="text-muted-foreground">SERVECO SRL</p>
                        </div>
                    )}
                     {isLoadingData ? (
                        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                     ) : dailyData.length > 0 ? (
                        <div className="border rounded-lg">
                           {dailyData.map(renderOperatorRow)}
                        </div>
                     ) : (
                        <div className="text-center py-16 text-muted-foreground">Nessuna attività registrata per questo giorno.</div>
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
                size: auto;
                margin: 20mm;
            }
        `}</style>
      </Card>
    );
}
