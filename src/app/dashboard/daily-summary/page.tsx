'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import { Loader2, User, Printer, Calendar as CalendarIcon, ChevronLeft, ChevronRight, AlertTriangle, Briefcase, Stethoscope, Plane, Bed } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfDay, endOfDay, isWithinInterval, addDays, subDays, getDay, set, isSameDay } from 'date-fns';
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
};

type Request = {
    type: 'ferie' | 'permesso' | 'malattia';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
};

type OperatorDailyData = {
    operator: Operator;
    status: 'lavorato' | 'assente' | 'ferie' | 'malattia' | 'permesso_giornaliero';
    timbrature: Timbratura[];
    hours: {
        ordinary: number;
        overtime: number;
        permission: number;
    };
};

const calculateShiftHours = (timbrature: Timbratura[], operator: Operator): { ordinary: number, overtime: number, permission: number } => {
    if (!operator?.workSchedule) return { ordinary: 0, overtime: 0, permission: 0 };
    
    const clockInEvent = timbrature.find(t => t.type === 'entrata' && t.status === 'confermata');
    const clockOutEvent = timbrature.find(t => t.type === 'uscita' && t.status === 'confermata');
    
    if (!clockInEvent || !clockOutEvent) return { ordinary: 0, overtime: 0, permission: 0 };
    
    const clockInTime = clockInEvent.timestamp.toDate();
    const clockOutTime = clockOutEvent.timestamp.toDate();
    const dayName = dayIndexToName[getDay(clockInTime)];
    const schedule = operator.workSchedule[dayName];
    
    const contractualHours = schedule?.totalHours || 0;
    const contractualMinutes = contractualHours * 60;
    
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
        if (t.type === 'pausa') breakStart = t.timestamp;
        if (t.type === 'fine_pausa' && breakStart) {
            breakDurationMillis += t.timestamp.toMillis() - breakStart.toMillis();
            breakStart = null;
        }
    });
    totalMillis -= breakDurationMillis;
    
    const totalMinutesWorked = totalMillis > 0 ? Math.round(totalMillis / 60000) : 0;
    
    const roundOrdinary = (minutes: number) => Math.floor(minutes / 30) * 0.5 + (minutes % 30 >= 25 ? 0.5 : 0);
    const roundOvertime = (minutes: number) => Math.floor(minutes / 60) + (minutes % 60 >= 50 ? 1 : 0);
    
    const ordinaryMinutes = Math.min(totalMinutesWorked, contractualMinutes);
    const ordinaryHours = roundOrdinary(ordinaryMinutes);
    
    const overtimeMinutes = totalMinutesWorked > contractualMinutes ? totalMinutesWorked - contractualMinutes : 0;
    const overtimeHours = roundOvertime(overtimeMinutes);
    
    const permissionHours = contractualHours > ordinaryHours ? contractualHours - ordinaryHours : 0;
    
    return { ordinary: ordinaryHours, overtime: overtimeHours, permission: permissionHours };
};


export default function DailySummaryPage() {
    const firestore = useFirestore();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [allData, setAllData] = useState<OperatorDailyData[]>([]);
    const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
    const [isLoading, setIsLoading] = useState(true);

    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!firestore) return;
        setIsLoading(true);

        const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
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
                        .map(doc => doc.data() as Timbratura)
                        .sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                    const opRequests = requestsSnap.docs
                        .filter(doc => doc.ref.path.startsWith(`app-users/${op.id}/`))
                        .map(doc => doc.data() as Request);
                        
                    let status: OperatorDailyData['status'] = 'assente';
                    let hours = { ordinary: 0, overtime: 0, permission: 0 };
                    
                    const dayName = dayIndexToName[getDay(selectedDate)];
                    const isWorkingDay = (op.workSchedule[dayName]?.totalHours || 0) > 0;
                    
                    const leaveRequest = opRequests.find(r => (r.type === 'ferie' || r.type === 'malattia') && isWithinInterval(selectedDate, {start: r.startDate.toDate(), end: r.endDate.toDate()}));
                    const permissionRequest = opRequests.find(r => r.type === 'permesso' && isSameDay(selectedDate, r.startDate.toDate()));

                    if (leaveRequest) {
                        status = leaveRequest.type;
                    } else if (opTimbrature.length > 0) {
                        status = 'lavorato';
                        hours = calculateShiftHours(opTimbrature, op);
                        if (permissionRequest) hours.permission += permissionRequest.hours || 0;
                    } else if (permissionRequest) {
                         status = 'permesso_giornaliero';
                         hours.permission = permissionRequest.hours || op.workSchedule[dayName]?.totalHours || 0;
                    } else if (!isWorkingDay) {
                        status = 'assente'; // It's a rest day, so technically absent
                    }

                    return { operator: op, status, timbrature: opTimbrature, hours };
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
    const formatTime = (ts: Timestamp | undefined) => ts ? format(ts.toDate(), 'HH:mm') : '--';

    const renderOperatorCard = (data: OperatorDailyData) => {
        const { operator, status, timbrature, hours } = data;
        const dayName = dayIndexToName[getDay(selectedDate)];
        const contractualHours = operator.workSchedule[dayName]?.totalHours || 0;

        let content;
        switch (status) {
            case 'lavorato':
                const entrata = timbrature.find(t => t.type === 'entrata');
                const uscita = timbrature.find(t => t.type === 'uscita');
                const pause = timbrature.filter(t => t.type === 'pausa' || t.type === 'fine_pausa');
                content = (
                    <div className='space-y-3'>
                        <div className="flex items-center gap-2">
                             <Briefcase className="h-5 w-5 text-blue-500" />
                            <p className="font-semibold text-blue-600">Ha lavorato</p>
                        </div>
                        <div className="text-sm space-y-1">
                            <p><strong>Entrata:</strong> {formatTime(entrata?.timestamp)}</p>
                            {pause.map((p, i) => (
                               <p key={i}><strong>{p.type === 'pausa' ? 'Inizio Pausa' : 'Fine Pausa'}:</strong> {formatTime(p.timestamp)}</p>
                            ))}
                            <p><strong>Uscita:</strong> {formatTime(uscita?.timestamp)}</p>
                        </div>
                         <Separator />
                        <div className="grid grid-cols-3 gap-2 text-center text-sm">
                            <div><p className="font-semibold">{hours.ordinary}h</p><p className="text-xs text-muted-foreground">Ordinarie</p></div>
                            <div><p className="font-semibold">{hours.overtime}h</p><p className="text-xs text-muted-foreground">Straordinario</p></div>
                            <div><p className="font-semibold">{hours.permission}h</p><p className="text-xs text-muted-foreground">Permesso</p></div>
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
                 content = <div className="flex items-center gap-2 font-semibold text-cyan-600"><User className="h-5 w-5" /> In Permesso ({hours.permission}h)</div>;
                 break;
            case 'assente':
                if (contractualHours > 0) {
                     content = <div className="flex items-center gap-2 font-semibold text-yellow-600"><AlertTriangle className="h-5 w-5" /> Assente (Mancata Timbratura)</div>;
                } else {
                     content = <div className="flex items-center gap-2 text-muted-foreground"><Bed className="h-5 w-5" /> Giorno di Riposo</div>;
                }
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
