'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import { Loader2, User, Printer, ChevronLeft, ChevronRight, AlertTriangle, Briefcase, Stethoscope, Plane, Bed, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfDay, endOfDay, isWithinInterval, addDays, getDay, set, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];


type DailySchedule = {
    totalHours?: number;
    startTime?: string;
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
    role: 'operator';
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    isOvertime?: boolean;
};

type Request = {
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
};

const InfoBox = ({ label, value }: { label: string, value: string }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
    </div>
);

const formatMinutes = (minutes: number) => {
    if (isNaN(minutes) || minutes < 0) return '00:00';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

type OperatorDailyData = {
    operator: Operator;
    status: 'lavorato' | 'assente' | 'ferie' | 'malattia' | 'permesso_giornaliero' | 'riposo' | 'straordinario';
    timbrature: Timbratura[];
    shiftDetails: {
        contractualHours: number;
        workedMinutes: number;
        ordinaryHours: number;
        overtimeHours: number;
        permissionHours: number;
        isPureOvertime: boolean;
    };
};

const calculateShiftDetails = (
    timbrature: Timbratura[], 
    operator: Operator, 
    day: Date,
    requests: Request[]
): OperatorDailyData['shiftDetails'] => {
    
    const clockInEvent = timbrature.find(t => t.type === 'entrata' && t.status === 'confermata');
    const clockOutEvent = timbrature.find(t => t.type === 'uscita' && t.status === 'confermata');
    
    const dayName = dayIndexToName[getDay(day)];
    const schedule = operator.workSchedule[dayName];
    const contractualHours = schedule?.totalHours || 0;

    let workedMinutes = 0;
    
    if (clockInEvent && clockOutEvent) {
        const clockInTime = clockInEvent.timestamp.toDate();
        const clockOutTime = clockOutEvent.timestamp.toDate();
        
        let calculationStartTime = clockInTime;
        if (schedule?.startTime) {
            const [h, m] = schedule.startTime.split(':').map(Number);
            const contractualStart = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
            if (calculationStartTime < contractualStart) {
                calculationStartTime = contractualStart;
            }
        }
        
        let totalMillis = clockOutTime.getTime() - calculationStartTime.getTime();
        
        let breakDurationMillis = 0;
        let breakStart: Timestamp | null = null;
        timbrature.forEach(t => {
            if (t.type === 'pausa' && t.status === 'confermata') breakStart = t.timestamp;
            if (t.type === 'fine_pausa' && t.status === 'confermata' && breakStart) {
                breakDurationMillis += t.timestamp.toMillis() - breakStart.toMillis();
                breakStart = null;
            }
        });
        totalMillis -= breakDurationMillis;
        
        workedMinutes = totalMillis > 0 ? Math.round(totalMillis / 60000) : 0;
    }
    
    const isOvertimeShift = clockInEvent?.isOvertime ?? false;

    const roundOrdinary = (minutes: number) => Math.floor(minutes / 30) * 0.5 + (minutes % 30 >= 25 ? 0.5 : 0);
    const roundOvertime = (minutes: number) => Math.floor(minutes / 60) + (minutes % 60 >= 50 ? 1 : 0);

    let ordinaryHours = 0;
    let overtimeHours = 0;

    if (isOvertimeShift) {
        overtimeHours = roundOvertime(workedMinutes);
    } else {
        const contractualMinutes = contractualHours * 60;
        const ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
        ordinaryHours = roundOrdinary(ordinaryMinutes);

        const overtimeMinutes = workedMinutes > contractualMinutes ? workedMinutes - contractualMinutes : 0;
        overtimeHours = roundOvertime(overtimeMinutes);
    }
    
    const permissionHoursFromLeave = contractualHours > ordinaryHours ? contractualHours - ordinaryHours : 0;

    const permissionRequestHours = requests
        .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
        .reduce((sum, r) => sum + (r.hours || 0), 0);

    return { 
        contractualHours,
        workedMinutes,
        ordinaryHours, 
        overtimeHours, 
        permissionHours: permissionHoursFromLeave + permissionRequestHours, 
        isPureOvertime: isOvertimeShift 
    };
};


export default function DailySummaryPage() {
    const firestore = useFirestore();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [allData, setAllData] = useState<OperatorDailyData[]>([]);
    const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore) return;
        setIsLoading(true);

        const operatorsQuery = query(
            collection(firestore, 'app-users'), 
            where('role', '==', 'operator'), 
            where('username', '!=', 'test')
        );
        const unsubscribe = onSnapshot(operatorsQuery, async (snapshot) => {
            const ops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            ops.sort((a,b) => a.firstName.localeCompare(b.firstName));
            setOperators(ops);
        }, error => {
            console.error("Error fetching operators: ", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [firestore]);
    
    useEffect(() => {
        if (!firestore || operators.length === 0) {
            if (operators.length > 0) setIsLoading(false);
            return;
        }
        setIsLoading(true);

        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        const timbratureQuery = query(collectionGroup(firestore, 'timbrature'), where('timestamp', '>=', start), where('timestamp', '<=', end));
        const requestsQuery = query(collectionGroup(firestore, 'requests'), where('status', '==', 'approvato'));

        Promise.all([getDocs(timbratureQuery), getDocs(requestsQuery)])
            .then(([timbratureSnap, requestsSnap]) => {
                const dailyData: OperatorDailyData[] = operators.map(op => {
                    
                    const opTimbrature = timbratureSnap.docs
                        .filter(doc => doc.ref.path.startsWith(`app-users/${op.id}/`))
                        .map(doc => ({id: doc.id, ...doc.data()} as Timbratura))
                        .sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                    const opRequests = requestsSnap.docs
                        .filter(doc => doc.ref.path.startsWith(`app-users/${op.id}/`))
                        .map(doc => doc.data() as Request);
                        
                    let status: OperatorDailyData['status'] = 'assente';
                    
                    const dayName = dayIndexToName[getDay(selectedDate)];
                    const isWorkingDay = (op.workSchedule[dayName]?.totalHours || 0) > 0;
                    
                    const leaveRequest = opRequests.find(r => (r.type === 'ferie' || r.type === 'malattia') && isWithinInterval(selectedDate, {start: r.startDate.toDate(), end: r.endDate.toDate()}));
                    const permissionRequest = opRequests.find(r => r.type === 'permesso' && isSameDay(selectedDate, r.startDate.toDate()));

                    const confirmedTimbrature = opTimbrature.filter(t => t.status === 'confermata');
                    const shiftDetails = calculateShiftDetails(confirmedTimbrature, op, selectedDate, opRequests);

                    if (confirmedTimbrature.length > 0) {
                        const isOvertimeShift = confirmedTimbrature[0].isOvertime;
                        status = isOvertimeShift ? 'straordinario' : 'lavorato';
                    } else if (leaveRequest) {
                        status = leaveRequest.type;
                    } else if (permissionRequest) {
                         status = 'permesso_giornaliero';
                    } else if (isWorkingDay) {
                        status = 'assente';
                    } else {
                        status = 'riposo'; 
                    }

                    return { operator: op, status, timbrature: confirmedTimbrature, shiftDetails };
                });

                setAllData(dailyData);
                setIsLoading(false);
            }).catch(error => {
                console.error("Error fetching daily data:", error);
                setIsLoading(false);
            })

    }, [firestore, selectedDate, operators]);

    const handleDateChange = (offset: number) => {
        setSelectedDate(prev => addDays(prev, offset));
    };

    const handlePrint = () => {
        window.print();
    };
    
    const getAvatarFallback = (op: Operator) => `${op.firstName[0] || ''}${op.lastName[0] || ''}`.toUpperCase();

    const renderOperatorCard = (data: OperatorDailyData) => {
        const { operator, status, timbrature, shiftDetails } = data;

        let content;
        switch (status) {
            case 'lavorato':
            case 'straordinario':
                const entrata = timbrature.find(t => t.type === 'entrata');
                const uscita = timbrature.find(t => t.type === 'uscita');
                content = (
                     <div className='space-y-3'>
                         <div className="flex items-center gap-2">
                             {status === 'lavorato' ? <Briefcase className="h-5 w-5 text-blue-500" /> : <Plus className="h-5 w-5 text-amber-500" />}
                            <p className={cn("font-semibold", status === 'lavorato' ? "text-blue-600" : "text-amber-600")}>
                                {status === 'lavorato' ? 'Ha lavorato' : 'Straordinario'}
                            </p>
                        </div>
                        <div className="text-sm space-y-1">
                             {timbrature.map((p, i) => (
                               <p key={p.id || i}><strong>{p.type.replace('_', ' ')}:</strong> {format(p.timestamp.toDate(), 'HH:mm')}</p>
                            ))}
                        </div>
                         <Separator />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <InfoBox label="Ore Previste" value={`${shiftDetails.contractualHours}h`} />
                            <InfoBox label="Ore Lavorate" value={formatMinutes(shiftDetails.workedMinutes)} />
                            <InfoBox label="Ore Ordinarie" value={`${shiftDetails.ordinaryHours}h`} />
                            <InfoBox label="Straordinario" value={`${shiftDetails.overtimeHours}h`} />
                        </div>
                    </div>
                );
                break;
            case 'ferie':
                 content = <div className="flex items-center gap-2 font-semibold text-green-600"><Plane className="h-5 w-5" /> In Ferie</div>;
                 break;
            case 'malattia':
                 content = <div className="flex items-center gap-2 font-semibold text-red-600"><Stethoscope className="h-5 w-5" /> In Malattia</div>;
                 break;
            case 'permesso_giornaliero':
                 content = <div className="flex items-center gap-2 font-semibold text-cyan-600"><User className="h-5 w-5" /> In Permesso ({shiftDetails.permissionHours}h)</div>;
                 break;
            case 'assente':
                 content = <div className="flex items-center gap-2 font-semibold text-yellow-600"><AlertTriangle className="h-5 w-5" /> Assente (Mancata Timbratura)</div>;
                 break;
            case 'riposo':
                 content = <div className="flex items-center gap-2 text-muted-foreground"><Bed className="h-5 w-5" /> Giorno di Riposo</div>;
                 break;
        }

        return (
            <Card key={operator.id}>
                <CardHeader className='pb-3'>
                    <div className="flex items-center gap-3">
                         <Avatar>
                            <AvatarFallback>{getAvatarFallback(operator)}</AvatarFallback>
                        </Avatar>
                        <div>
                             <CardTitle className="text-lg">{operator.firstName} {operator.lastName}</CardTitle>
                             <CardDescription>Codice: {operator.username}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {content}
                </CardContent>
            </Card>
        )
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
                        <CardTitle className="text-3xl font-bold tracking-tight">Riepilogo Giornaliero Operatori</CardTitle>
                        <CardDescription>Visualizza e stampa le attività di tutti gli operatori per il giorno selezionato.</CardDescription>
                    </div>
                    <Button onClick={handlePrint} className="no-print">
                        <Printer className="mr-2 h-4 w-4" /> Stampa Riepilogo
                    </Button>
                </div>
            </CardHeader>

            <div className="flex items-center justify-between gap-2 p-2 border rounded-md no-print">
                <Button variant="outline" size="sm" onClick={() => handleDateChange(-1)}><ChevronLeft className='h-4 w-4 mr-1' /> Prec.</Button>
                <h3 className="text-lg font-semibold text-center capitalize">{format(selectedDate, 'eeee, dd MMMM yyyy', { locale: it })}</h3>
                <Button variant="outline" size="sm" onClick={() => handleDateChange(1)}>Succ. <ChevronRight className='h-4 w-4 ml-1'/></Button>
            </div>
            
             {isLoading ? (
                <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
             ) : allData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {allData.map(renderOperatorCard)}
                </div>
             ) : (
                <div className="text-center py-16 text-muted-foreground">Nessun operatore trovato.</div>
             )}

        </div>
    )
}
