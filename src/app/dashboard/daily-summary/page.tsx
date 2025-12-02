'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where, Timestamp, getDocs, collectionGroup, orderBy } from 'firebase/firestore';
import { Loader2, Printer, ChevronLeft, ChevronRight, Briefcase, Plane, Stethoscope, AlertTriangle, Bed, UserCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfDay, endOfDay, addDays, getDay, isWithinInterval, eachDayOfInterval, isSameDay, set, parse } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';

// --- Types ---
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
    role: 'operator';
    workSchedule: WorkSchedule;
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
};

type Shift = {
    date: Date;
    events: Timbratura[];
    contractualHours: number;
    workedMinutes: number;
    ordinaryHours: number;
    overtimeHours: number;
    permissionHours: number;
    isPureOvertime: boolean;
};

type DailyDetail = {
    date: Date;
    operator: Operator;
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo' | 'permesso';
    shift: Shift | null;
    request: Request | null;
};

// --- Helper Components ---
const InfoBox = ({ label, value }: { label: string, value: string }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
    </div>
);

// --- Core Logic Functions (from end-of-month) ---

const calculateShiftDetails = (events: Timbratura[], schedule: DailySchedule | undefined): { workedMinutes: number, calculationStart: Date | null } => {
    const clockInEvent = events.find(e => e.type === 'entrata');
    const clockOutEvent = events.find(e => e.type === 'uscita');

    if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null };

    const clockInTime = clockInEvent.timestamp.toDate();
    const clockOutTime = clockOutEvent.timestamp.toDate();

    let calculationStartTime = clockInTime;
    
    if (schedule?.startTime && !clockInEvent.ignoreContractualStart) {
        const [contractualH, contractualM] = schedule.startTime.split(':').map(Number);
        const contractualStartDateTime = set(clockInTime, { hours: contractualH, minutes: contractualM, seconds: 0, milliseconds: 0 });
         if (calculationStartTime < contractualStartDateTime) {
            calculationStartTime = contractualStartDateTime;
        }
    }

    let totalMillis = clockOutTime.getTime() - calculationStartTime.getTime();
    
    let breakDurationMillis = 0;
    let breakStartTs: Timestamp | null = null;
    for (const e of events) {
        if (e.type === 'pausa') breakStartTs = e.timestamp;
        if (e.type === 'fine_pausa' && breakStartTs) {
            breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
            breakStartTs = null;
        }
    }
    totalMillis -= breakDurationMillis;
    
    return { workedMinutes: totalMillis > 0 ? totalMillis / (1000 * 60) : 0, calculationStart: calculationStartTime };
};

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


export default function DailyClockingReportPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [dailyData, setDailyData] = useState<DailyDetail[]>([]);
    const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
    const [isLoading, setIsLoading] = useState(true);

    // 1. Fetch all operators (excluding 'test')
    useEffect(() => {
        if (!firestore) return;
        const operatorsQuery = query(
            collection(firestore, 'app-users'),
            where('role', '==', 'operator'),
            where('username', '!=', 'test')
        );
        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const ops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            ops.sort((a, b) => a.firstName.localeCompare(b.firstName));
            setOperators(ops);
        }, error => {
            console.error("Error fetching operators: ", error);
        });
        return () => unsubscribe();
    }, [firestore]);
    
    // 2. Process data for the selected day when operators or date changes
    useEffect(() => {
        if (!firestore || operators.length === 0) {
            if (operators.length > 0) setIsLoading(false);
            setDailyData([]);
            return;
        }
        setIsLoading(true);

        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        const timbratureQuery = query(
            collectionGroup(firestore, 'timbrature'),
            where('timestamp', '>=', start),
            where('timestamp', '<=', end),
            where('status', '==', 'confermata'),
            orderBy('timestamp', 'asc')
        );

        const requestsQuery = query(
            collectionGroup(firestore, 'requests'),
            where('status', '==', 'approvato')
        );

        const fetchData = async () => {
            try {
                const [timbratureSnapshot, requestsSnapshot] = await Promise.all([
                    getDocs(timbratureQuery),
                    getDocs(requestsQuery)
                ]);

                const timbratureByOperator: Record<string, Timbratura[]> = {};
                timbratureSnapshot.docs.forEach(doc => {
                    const operatorId = doc.ref.parent.parent?.id;
                    if (operatorId) {
                        if (!timbratureByOperator[operatorId]) timbratureByOperator[operatorId] = [];
                        timbratureByOperator[operatorId].push({ id: doc.id, ...doc.data() } as Timbratura);
                    }
                });

                const requestsByOperator: Record<string, Request[]> = {};
                 requestsSnapshot.docs.forEach(doc => {
                    const req = doc.data() as Request;
                    const operatorId = doc.ref.parent.parent?.id;
                     if (operatorId && isWithinInterval(selectedDate, { start: startOfDay(req.startDate.toDate()), end: endOfDay(req.endDate.toDate()) })) {
                        if (!requestsByOperator[operatorId]) requestsByOperator[operatorId] = [];
                        requestsByOperator[operatorId].push({ id: doc.id, ...req });
                    }
                });


                const details: DailyDetail[] = operators.map(op => {
                    const dayName = dayIndexToName[getDay(selectedDate)];
                    const dailySchedule = op.workSchedule[dayName];
                    const contractualHours = dailySchedule?.totalHours || 0;
                    
                    const workedEvents = timbratureByOperator[op.id];
                    const leaveRequest = requestsByOperator[op.id]?.find(r => r.type === 'ferie' || r.type === 'malattia');
                    const permissionRequest = requestsByOperator[op.id]?.find(r => r.type === 'permesso');

                    if (workedEvents && workedEvents.length > 0) {
                        let events = [...workedEvents].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                        const { workedMinutes, calculationStart } = calculateShiftDetails(events, dailySchedule);
                        
                        if (calculationStart) {
                           const entrataIndex = events.findIndex(e => e.type === 'entrata');
                            if (entrataIndex !== -1) {
                                events[entrataIndex] = { ...events[entrataIndex], timestamp: Timestamp.fromDate(calculationStart), id: `virtual-${events[entrataIndex].id}` };
                            }
                        }

                        const isOvertimeShift = events.some(e => e.isOvertime);
                        const contractualMinutes = contractualHours * 60;
                        let ordinaryHours = 0;
                        let overtimeHours = 0;

                        if (isOvertimeShift) {
                            overtimeHours = roundOvertimeHours(workedMinutes);
                        } else {
                            ordinaryHours = roundOrdinaryHours(Math.min(workedMinutes, contractualMinutes));
                            overtimeHours = roundOvertimeHours(workedMinutes > contractualMinutes ? workedMinutes - contractualMinutes : 0);
                        }
                        
                        const permissionHours = permissionRequest?.hours || 0;

                        return {
                            date: selectedDate, operator: op, status: 'lavorato', request: null,
                            shift: { date: selectedDate, events, contractualHours, workedMinutes, ordinaryHours, overtimeHours, permissionHours, isPureOvertime: isOvertimeShift },
                        };
                    } else if (leaveRequest) {
                        return { date: selectedDate, operator: op, status: leaveRequest.type, request: leaveRequest, shift: null };
                    } else if (permissionRequest) {
                         return { date: selectedDate, operator: op, status: 'permesso', request: permissionRequest, shift: null };
                    } else if (contractualHours > 0) {
                        return { date: selectedDate, operator: op, status: 'mancata_timbratura', request: null, shift: null };
                    } else {
                        return { date: selectedDate, operator: op, status: 'riposo', request: null, shift: null };
                    }
                }).filter(detail => detail.status !== 'riposo'); // Filter out operators who are on their day off

                 setDailyData(details);

            } catch (error) {
                console.error("Error processing daily data:", error);
                 toast({ variant: 'destructive', title: 'Errore Dati', description: 'Impossibile elaborare i dati giornalieri.'});
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();

    }, [firestore, selectedDate, operators, toast]);

    const handleDateChange = (offset: number) => {
        setSelectedDate(prev => addDays(prev, offset));
    };

    const handlePrint = () => {
        window.print();
    };

    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };
    
    const getStatusIcon = (status: DailyDetail['status']) => {
        switch(status) {
            case 'lavorato': return <Briefcase className="h-5 w-5 text-blue-500" />;
            case 'ferie': return <Plane className="h-5 w-5 text-green-500" />;
            case 'malattia': return <Stethoscope className="h-5 w-5 text-red-500" />;
            case 'permesso': return <UserCheck className="h-5 w-5 text-cyan-500" />;
            case 'mancata_timbratura': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
            default: return <Bed className="h-5 w-5 text-gray-400"/>;
        }
    }


    return (
        <div className="space-y-6 print-container" id="printable-area">
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-container, .print-container * {
                        visibility: visible;
                    }
                    .print-container {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .no-print {
                        display: none !important;
                    }
                    main {
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                }
            `}</style>
            <CardHeader className="px-0 pt-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-3xl font-bold tracking-tight">Report del Giorno</CardTitle>
                        <CardDescription>Riepilogo giornaliero delle attività di tutti gli operatori.</CardDescription>
                    </div>
                    <Button onClick={handlePrint} className="no-print">
                        <Printer className="mr-2 h-4 w-4" /> Stampa Report
                    </Button>
                </div>
            </CardHeader>

            <div className="flex items-center justify-between gap-2 p-2 border rounded-md no-print">
                <Button variant="outline" size="sm" onClick={() => handleDateChange(-1)}><ChevronLeft className='h-4 w-4 mr-1' /> Prec.</Button>
                <h3 className="text-lg font-semibold text-center capitalize">{format(selectedDate, 'eeee, dd MMMM yyyy', { locale: it })}</h3>
                <Button variant="outline" size="sm" onClick={() => handleDateChange(1)}>Succ. <ChevronRight className='h-4 w-4 ml-1' /></Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : dailyData.length > 0 ? (
                <div className="space-y-4">
                    {dailyData.map((detail) => (
                        <Card key={detail.operator.id}>
                             <CardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <Avatar>
                                        <AvatarFallback>{`${detail.operator.firstName[0] || ''}${detail.operator.lastName[0] || ''}`.toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <CardTitle className="text-lg">{detail.operator.firstName} {detail.operator.lastName}</CardTitle>
                                        <CardDescription>Codice: {detail.operator.username}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                               <div className={cn("border rounded-lg p-3")}>
                                    <h4 className={cn("font-bold text-lg capitalize flex items-center gap-3")}>
                                        {getStatusIcon(detail.status)}
                                        {detail.status === 'lavorato' ? `Turno del ${format(detail.date, 'dd MMMM', { locale: it })}` : format(detail.date, 'eeee dd MMMM', { locale: it })}
                                    </h4>
                                    
                                    <div className="border-b my-2"></div>
                                    
                                    {detail.status === 'lavorato' && detail.shift ? (
                                        <>
                                            <div className="text-sm text-muted-foreground mt-1 mb-3">
                                                 {detail.shift.events.map(e => (
                                                    <span key={e.id} className={cn('mr-2', e.isAuto && "text-red-500")}>
                                                        {`${e.type.replace('_', ' ')}: ${format(e.timestamp.toDate(), 'HH:mm')}`}
                                                        {` | `}
                                                    </span>
                                                 ))}
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                <InfoBox label="Ore Previste" value={`${detail.shift.contractualHours}h`} />
                                                <InfoBox label="Ore Lavorate" value={formatMinutes(detail.shift.workedMinutes)} />
                                                <InfoBox label="Ore Ordinarie" value={`${detail.shift.ordinaryHours}h`} />
                                                <InfoBox label="Straordinario" value={`${detail.shift.overtimeHours}h`} />
                                                <InfoBox label="Permesso" value={`${detail.shift.permissionHours}h`} />
                                            </div>
                                        </>
                                    ) : detail.status === 'ferie' ? (
                                        <p className="text-muted-foreground mt-1">Giorno di ferie approvato.</p>
                                    ) : detail.status === 'malattia' ? (
                                        <p className="text-muted-foreground mt-1">Giorno di malattia approvato.</p>
                                    ) : detail.status === 'permesso' ? (
                                         <p className="text-muted-foreground mt-1">Permesso di {detail.request?.hours || 'N/D'} ore approvato.</p>
                                    ): detail.status === 'mancata_timbratura' ? (
                                        <p className="text-yellow-600 font-semibold mt-1">Nessuna timbratura registrata in un giorno lavorativo.</p>
                                    ) : null}

                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <p>Nessuna attività registrata per questo giorno.</p>
                </div>
            )}
        </div>
    );
}