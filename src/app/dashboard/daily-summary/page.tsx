'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDocs, collection, query, where, Timestamp, onSnapshot, orderBy, collectionGroup } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, AlertTriangle, Bed, Printer, Calendar as CalendarIcon, Eye } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, getDay, startOfDay, endOfDay, isWithinInterval, addDays, isSameDay, set, parse } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
    startTime?: string;
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
    }
}

const InfoBox = ({ label, value }: { label: string, value: string | number }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
    </div>
);


export default function DailyReportPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [dailyData, setDailyData] = useState<OperatorDailyData[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isPrinting, setIsPrinting] = useState(false);
    const [detailedTimbrature, setDetailedTimbrature] = useState<{operatorName: string, timbrature: Timbratura[]}|null>(null);

    useEffect(() => {
        if (!firestore) return;
        
        const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const allOperators = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            const filteredOperators = allOperators.filter(op => op.username !== 'test');
            setOperators(filteredOperators);
        });

        return () => unsubscribe();
    }, [firestore]);
    
    const calculateHours = (timbrature: Timbratura[], schedule: DailySchedule | undefined, operator: Operator | null): { workedMinutes: number, calculationStart: Date | null } => {
        if (!operator) return { workedMinutes: 0, calculationStart: null };
        const clockInEvent = timbrature.find(e => e.type === 'entrata');
        const clockOutEvent = timbrature.find(e => e.type === 'uscita');

        if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null };

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

        let totalMillis = clockOutTime.getTime() - calculationStartTime.getTime();
        
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
        
        return { workedMinutes: totalMillis > 0 ? totalMillis / (1000 * 60) : 0, calculationStart: calculationStartTime };
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
                // Fetch all requests that could possibly affect the selected day for all operators
                const requestsCollectionGroup = collectionGroup(firestore, 'requests');
                const requestsQuery = query(requestsCollectionGroup, where('status', '==', 'approvato'));
                const requestsSnapshot = await getDocs(requestsQuery);
                const allRequests = requestsSnapshot.docs.map(doc => ({ id: doc.id, userId: doc.ref.parent.parent?.id, ...doc.data() } as Request & { userId: string }));

                // Fetch all clockings for the selected day
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

                    if (operatorTimbrature.length > 0) {
                        status = 'lavorato';
                        const { workedMinutes } = calculateHours(operatorTimbrature, schedule, op);
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
                        calculatedHours
                    };
                }).filter(data => data.status !== 'riposo'); // Filter out operators who are on rest day
                
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
        // Timeout to allow state update and re-render for print-specific styles
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 100);
    };
    
    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    if (isUserLoading) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
     if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground p-8">Accesso negato.</div>;
    }

    const renderOperatorCard = (data: OperatorDailyData) => {
        const { operator, status, timbrature, request, calculatedHours } = data;
        const dayName = dayIndexToName[getDay(selectedDate)];
        const schedule = operator.workSchedule[dayName];

        let statusIcon, statusText, statusColor;
        switch (status) {
            case 'lavorato': statusIcon = <Briefcase className="h-5 w-5"/>; statusText = "Ha Lavorato"; statusColor = "text-blue-500"; break;
            case 'ferie': statusIcon = <Plane className="h-5 w-5"/>; statusText = "In Ferie"; statusColor = "text-green-500"; break;
            case 'malattia': statusIcon = <Stethoscope className="h-5 w-5"/>; statusText = "In Malattia"; statusColor = "text-red-500"; break;
            case 'permesso': statusIcon = <UserCheck className="h-5 w-5"/>; statusText = "In Permesso"; statusColor = "text-cyan-500"; break;
            case 'mancata_timbratura': statusIcon = <AlertTriangle className="h-5 w-5"/>; statusText = "Mancata Timbratura"; statusColor = "text-yellow-500"; break;
            default: statusIcon = <Bed className="h-5 w-5"/>; statusText = "Riposo"; statusColor = "text-muted-foreground";
        }
        
        const timbratureText = timbrature.map(t => `${t.type.replace('_', ' ')}: ${format(t.timestamp.toDate(), 'HH:mm')}`).join(' | ');

        return (
             <div key={operator.id} className="border rounded-lg p-4 break-inside-avoid">
                <h4 className="font-bold text-lg">{operator.firstName} {operator.lastName}</h4>
                <p className="text-sm text-muted-foreground">Codice: {operator.username}</p>
                
                <div className={cn("flex items-center gap-2 font-semibold my-3", statusColor)}>
                    {statusIcon}
                    <span>{statusText}</span>
                </div>

                <div className="border-b my-2"></div>
                
                {status === 'lavorato' && (
                    <>
                        <div className="text-sm text-muted-foreground mt-1 mb-3 flex items-center gap-2">
                             <span className="flex-grow">{timbratureText}</span>
                             <DialogTrigger asChild>
                                 <Button variant="ghost" size="icon" onClick={() => setDetailedTimbrature({operatorName: `${operator.firstName} ${operator.lastName}`, timbrature})}>
                                     <Eye className="h-4 w-4"/>
                                 </Button>
                             </DialogTrigger>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <InfoBox label="Ore Previste" value={`${schedule?.totalHours || 0}h`} />
                            <InfoBox label="Ore Lavorate" value={formatMinutes(calculatedHours.worked)} />
                            <InfoBox label="Ore Ordinarie" value={`${calculatedHours.ordinary}h`} />
                            <InfoBox label="Straordinario" value={`${calculatedHours.overtime}h`} />
                        </div>
                    </>
                )}
                {status === 'permesso' && (
                    <p className="text-muted-foreground mt-1">Permesso di {calculatedHours.permission} ore approvato.</p>
                )}
                {(status === 'ferie' || status === 'malattia') && (
                     <p className="text-muted-foreground mt-1">Giorno di assenza approvato.</p>
                )}
                {status === 'mancata_timbratura' && (
                    <p className="text-yellow-600 font-semibold mt-1">Nessuna timbratura registrata in un giorno lavorativo.</p>
                )}
             </div>
        )
    }

    return (
        <Dialog onOpenChange={(open) => !open && setDetailedTimbrature(null)}>
        <Card className="p-4 sm:p-6 print:shadow-none print:border-none">
            <CardHeader className="print:hidden">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-6 w-6" />
                            <CardTitle className="text-2xl">Report Giornaliero</CardTitle>
                        </div>
                        <CardDescription>
                           Riepilogo delle attività di tutti gli operatori per il giorno selezionato.
                        </CardDescription>
                    </div>
                     <Button onClick={handlePrint} disabled={isPrinting}>
                        <Printer className="mr-2 h-4 w-4" />
                        {isPrinting ? 'Stampa in corso...' : 'Stampa Report'}
                    </Button>
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
                        <div className="space-y-4 md:column-count-2 md:column-gap-4">
                           {dailyData.map(renderOperatorCard)}
                        </div>
                     ) : (
                        <div className="text-center py-16 text-muted-foreground">Nessuna attività registrata per questo giorno.</div>
                     )}
                </div>
            </CardContent>
        </Card>
        
         <DialogContent>
            <DialogHeader>
                <DialogTitle>Dettaglio Timbrature - {detailedTimbrature?.operatorName}</DialogTitle>
            </DialogHeader>
            <div className="overflow-x-auto mt-2 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left border-b">
                        <th className="p-2">Evento</th>
                        <th className="p-2">Orario</th>
                    </tr>
                </thead>
                <tbody>
                    {detailedTimbrature?.timbrature.map(t => (
                        <tr key={t.id} className={cn("border-b", t.isAuto && "text-red-500")}>
                            <td className="p-2 capitalize">{t.type.replace('_', ' ')}</td>
                            <td className="p-2">{format(t.timestamp.toDate(), 'HH:mm:ss')}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        </DialogContent>
        
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
      </Dialog>
    );
}
