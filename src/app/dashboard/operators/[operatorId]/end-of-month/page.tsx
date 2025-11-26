'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, AlertTriangle, Bed, Printer, Share2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useParams, useRouter } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';


type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
};

type Operator = {
    id: string;
    username: string;
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
};

type Shift = {
    date: Date;
    events: Timbratura[];
    contractualHours: number;
    workedMinutes: number;
    ordinaryHours: number;
    overtimeHours: number;
    permissionHours: number;
};

type DailyDetail = {
    date: Date;
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo';
    shift: Shift | null;
    request: Request | null;
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

// Standalone component for the printable summary
const PrintableSummary = React.forwardRef<HTMLDivElement, { operator: Operator, currentMonth: Date, monthlySummary: any, dailyDetails: DailyDetail[], formatMinutes: (minutes: number) => string }>(({ operator, currentMonth, monthlySummary, dailyDetails, formatMinutes }, ref) => (
     <div ref={ref} className="bg-white text-black p-4 printable-summary" style={{ width: '210mm', minHeight: '297mm', margin: 'auto' }}>
        <header className="flex justify-between items-center border-b pb-2 mb-2">
             <Image src="https://i.postimg.cc/d3QKx62Q/IMG-20251006-WA0024.jpg" alt="Serveco Logo" width={80} height={80} crossOrigin="anonymous" />
             <div className="text-right">
                 <h1 className="text-2xl font-bold">{operator.username}</h1>
                 <p className="text-lg capitalize text-gray-600">{format(currentMonth, 'MMMM yyyy', { locale: it })}</p>
             </div>
        </header>

        <section className="grid grid-cols-3 gap-2 mb-4">
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Giorni Lavorati</div>
                <div className="text-xl font-bold">{monthlySummary.workedDays}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Ore Ordinarie</div>
                <div className="text-xl font-bold">{monthlySummary.ordinaryHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Ore Straordinarie</div>
                <div className="text-xl font-bold">{monthlySummary.overtimeHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Ferie (giorni)</div>
                <div className="text-xl font-bold">{monthlySummary.ferieDays}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Permessi (ore)</div>
                <div className="text-xl font-bold">{monthlySummary.permessoHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Malattia (giorni)</div>
                <div className="text-xl font-bold">{monthlySummary.malattiaDays}</div>
            </div>
        </section>

        <section>
            <h3 className="text-xl font-bold mb-2 border-b pb-1">Dettaglio Giornaliero</h3>
            <div className="flex flex-col gap-0">
                {dailyDetails.filter(d => d.status !== 'riposo').map(detail => (
                    <div key={detail.date.toISOString()} className="border-b py-1 day-entry" style={{ padding: '2px 0', display: 'flex', flexDirection: 'column', borderBottom: '1px solid #e5e7eb' }}>
                        <div className="flex items-center gap-4">
                            <span className="font-bold text-sm capitalize w-48">{format(detail.date, 'eeee dd/MM/yyyy', { locale: it })}</span>
                             <div className="text-sm text-gray-700 flex items-center">
                                {detail.status === 'lavorato' && detail.shift && (
                                    <span className="whitespace-nowrap">
                                        Entrata: {detail.shift.events.find(e => e.type === 'entrata') ? format(detail.shift.events.find(e => e.type === 'entrata')!.timestamp.toDate(), 'HH:mm') : '--:--'} | Uscita: {detail.shift.events.find(e => e.type === 'uscita') ? format(detail.shift.events.find(e => e.type === 'uscita')!.timestamp.toDate(), 'HH:mm') : '--:--'}
                                    </span>
                                )}
                                 {detail.status === 'ferie' && <span className="text-green-600 font-medium">Giorno di ferie</span>}
                                 {detail.status === 'malattia' && <span className="text-red-600 font-medium">Giorno di malattia</span>}
                                 {detail.status === 'mancata_timbratura' && <span className="text-yellow-600 font-medium">Nessuna timbratura registrata</span>}
                             </div>
                        </div>
                        {detail.status === 'lavorato' && detail.shift && (
                             <div className="pl-52 text-xs text-gray-500">
                                <span>Previste: {detail.shift.contractualHours}h</span> | 
                                <span>Lavorate: {formatMinutes(detail.shift.workedMinutes)}</span> | 
                                <span>Ordinarie: {detail.shift.ordinaryHours}h</span> | 
                                <span>Straordinario: {detail.shift.overtimeHours}h</span> | 
                                <span>Permesso: {detail.shift.permissionHours}h</span>
                             </div>
                        )}
                       
                    </div>
                ))}
            </div>
        </section>
    </div>
));
PrintableSummary.displayName = 'PrintableSummary';


export default function EndOfMonthPage() {
    const firestore = useFirestore();
    const params = useParams();
    const operatorId = params.operatorId as string;
    
    const [isProcessing, setIsProcessing] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[] }>({ timbrature: [], requests: [] });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore || !operatorId) return;

        const fetchOperator = async () => {
            const opDoc = await getDoc(doc(firestore, 'app-users', operatorId));
            if (opDoc.exists()) {
                setOperator(opDoc.data() as Operator);
            }
        };
        fetchOperator();
    }, [firestore, operatorId]);

    useEffect(() => {
        if (!firestore || !operatorId) {
            setIsLoading(false);
            return;
        };
        setIsLoading(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        const timbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', monthStart),
            where('timestamp', '<=', monthEnd)
        );
        const requestsQuery = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            where('status', '==', 'approvato')
        );

        const unsubTimbrature = onSnapshot(timbratureQuery, snapshot => {
            const timbratureData = snapshot.docs.map(d => d.data() as Timbratura).filter(t => t.status === 'confermata');
            setMonthlyData(prev => ({ ...prev, timbrature: timbratureData }));
             if(!unsubRequests) setIsLoading(false);
        }, () => setIsLoading(false));

        const unsubRequests = onSnapshot(requestsQuery, snapshot => {
            const requestsData = snapshot.docs.map(d => d.data() as Request);
            setMonthlyData(prev => ({ ...prev, requests: requestsData }));
            if(!unsubTimbrature) setIsLoading(false);
        }, () => setIsLoading(false));
        
        Promise.all([getDocs(timbratureQuery), getDocs(requestsQuery)]).then(() => {
            setIsLoading(false)
        })


        return () => {
            unsubTimbrature();
            unsubRequests();
        };
    }, [firestore, operatorId, currentMonth]);
    
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

    const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator) return { monthlySummary: {} as any, dailyDetails: [] };

        const monthInterval = { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) };

        const dailyTimbrature = monthlyData.timbrature.reduce((acc, t) => {
            const dayString = t.timestamp.toDate().toDateString();
            if (!acc[dayString]) acc[dayString] = [];
            acc[dayString].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);

        const allDaysOfMonth = eachDayOfInterval(monthInterval);
        const details: DailyDetail[] = [];

        for (const day of allDaysOfMonth) {
            const dayName = dayIndexToName[getDay(day)];
            const contractualHours = operator.workSchedule[dayName] || 0;
            const dayString = day.toDateString();

            const leaveRequest = monthlyData.requests.find(r =>
                (r.type === 'ferie' || r.type === 'malattia') &&
                isWithinInterval(day, { start: r.startDate.toDate(), end: r.endDate.toDate() })
            );

            const workedEvents = dailyTimbrature[dayString];

            if (workedEvents) {
                const events = workedEvents;
                let workedMinutes = 0;
                const startTime = events.find(e => e.type === 'entrata')?.timestamp;
                const endTime = events.find(e => e.type === 'uscita')?.timestamp;
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
                    workedMinutes = totalMillis / (1000 * 60);
                }
                const isOvertimeShift = events.find(e => e.type === 'entrata')?.isOvertime ?? false;
                let ordinaryHours = 0, overtimeHours = 0;
                if (isOvertimeShift) {
                    overtimeHours = roundOvertimeHours(workedMinutes);
                } else {
                    const contractualMinutes = contractualHours * 60;
                    if (workedMinutes > contractualMinutes) {
                        ordinaryHours = roundOrdinaryHours(contractualMinutes);
                        overtimeHours = roundOvertimeHours(workedMinutes - contractualMinutes);
                    } else {
                        ordinaryHours = roundOrdinaryHours(workedMinutes);
                    }
                }
                 const permissionHours = monthlyData.requests
                    .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
                    .reduce((sum, r) => sum + (r.hours || 0), 0);

                details.push({
                    date: day,
                    status: 'lavorato',
                    request: null,
                    shift: {
                        date: day, events, contractualHours, workedMinutes, ordinaryHours, overtimeHours, permissionHours
                    },
                });
            } else if (leaveRequest && contractualHours > 0) {
                details.push({
                    date: day,
                    status: leaveRequest.type,
                    request: leaveRequest,
                    shift: null,
                });
            } else if (contractualHours > 0) {
                 details.push({
                    date: day,
                    status: 'mancata_timbratura',
                    request: null,
                    shift: null,
                });
            } else {
                 details.push({
                    date: day,
                    status: 'riposo',
                    request: null,
                    shift: null,
                });
            }
        }
        
        const shifts = details.filter(d => d.status === 'lavorato').map(d => d.shift!);
        
        let ferieDays = 0;
        let malattiaDays = 0;

        const processedLeaveDays = new Set<string>();

        monthlyData.requests.forEach(req => {
            if (req.type === 'ferie' || req.type === 'malattia') {
                for (let day = req.startDate.toDate(); day <= req.endDate.toDate(); day.setDate(day.getDate() + 1)) {
                    const dayString = day.toDateString();
                    if (isWithinInterval(day, monthInterval) && !processedLeaveDays.has(dayString)) {
                        const dayName = dayIndexToName[getDay(day)];
                        if ((operator.workSchedule[dayName] || 0) > 0) {
                            if (req.type === 'ferie') ferieDays++;
                            if (req.type === 'malattia') malattiaDays++;
                            processedLeaveDays.add(dayString);
                        }
                    }
                }
            }
        });


        const totalOrdinary = shifts.reduce((sum, s) => sum + s.ordinaryHours, 0);
        const totalOvertimeFromShifts = shifts.reduce((sum, s) => sum + s.overtimeHours, 0);
        const totalOvertimeFromRequests = monthlyData.requests
             .filter(r => r.type === 'straordinario' && isWithinInterval(r.startDate.toDate(), monthInterval))
             .reduce((sum, r) => sum + (r.hours || 0), 0);

        const totalPermesso = monthlyData.requests
            .filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval))
            .reduce((sum, r) => sum + (r.hours || 0), 0);


        return {
            monthlySummary: {
                workedDays: shifts.length,
                ordinaryHours: totalOrdinary,
                overtimeHours: totalOvertimeFromShifts + totalOvertimeFromRequests,
                ferieDays,
                permessoHours: totalPermesso,
                malattiaDays,
            },
            dailyDetails: details,
        };

    }, [operator, currentMonth, monthlyData]);

    const handleMonthChange = (offset: number) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const handlePrint = () => {
        const printContent = printRef.current?.innerHTML;
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Riepilogo Mensile - ${operator?.username}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap');
                        body { 
                            font-family: 'PT Sans', sans-serif;
                            margin: 0;
                            -webkit-print-color-adjust: exact;
                            color-adjust: exact;
                        }
                        .print-controls { padding: 1rem; text-align: center; }
                        .print-button { padding: 10px 20px; font-size: 16px; cursor: pointer; border: 1px solid #ccc; border-radius: 5px; margin: 5px; background-color: #f0f0f0; }
                        @media print { .print-controls { display: none; } }
                        header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; margin-bottom: 0.5rem; }
                        header img { width: 80px; height: 80px; }
                        header h1 { font-size: 1.5rem; font-weight: bold; }
                        header p { font-size: 1.125rem; text-transform: capitalize; color: #4b5563; }
                        section { margin-bottom: 1rem; }
                        .grid { display: grid; gap: 0.5rem; }
                        .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
                        .border { border: 1px solid #e5e7eb; }
                        .rounded-lg { border-radius: 0.5rem; }
                        .p-2 { padding: 0.5rem; }
                        .text-center { text-align: center; }
                        .text-xs { font-size: 0.75rem; }
                        .text-gray-600 { color: #4b5563; }
                        .text-xl { font-size: 1.25rem; }
                        .font-bold { font-weight: 700; }
                        h3 { font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; }
                        .flex { display: flex; }
                        .flex-col { flex-direction: column; }
                        .gap-0 { gap: 0; }
                        .day-entry { border-bottom: 1px solid #e5e7eb; padding: 2px 0; display: flex; flex-direction: column; }
                        .items-center { align-items: center; }
                        .gap-4 { gap: 1rem; }
                        .w-48 { width: 12rem; }
                        .text-sm { font-size: 0.875rem; }
                        .text-gray-700 { color: #374151; }
                        .whitespace-nowrap { white-space: nowrap; }
                        .text-green-600 { color: #059669; }
                        .text-red-600 { color: #dc2626; }
                        .text-yellow-600 { color: #d97706; }
                        .font-medium { font-weight: 500; }
                        .pl-52 { padding-left: 13rem; }
                    </style>
                     <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
                </head>
                <body>
                    <div class="print-controls">
                        <button class="print-button" onclick="window.print()">Stampa</button>
                        <button class="print-button" id="share-btn">Condividi</button>
                    </div>
                    <div id="print-area">
                        ${printContent}
                    </div>
                    <script>
                        document.getElementById('share-btn').addEventListener('click', async () => {
                            const printArea = document.getElementById('print-area');
                            if (!printArea) return;
                            
                            try {
                                const canvas = await html2canvas(printArea, { useCORS: true, scale: 2 });
                                canvas.toBlob(async (blob) => {
                                    if (!blob) {
                                        alert("Errore nella creazione dell'immagine.");
                                        return;
                                    }
                                    const file = new File([blob], 'Riepilogo.png', { type: 'image/png' });
                                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                        await navigator.share({
                                            files: [file],
                                            title: 'Riepilogo Mensile',
                                        });
                                    } else {
                                        alert("La condivisione non è supportata su questo browser.");
                                    }
                                }, 'image/png');
                            } catch(e) {
                                console.error(e);
                                alert("Errore durante la condivisione.");
                            }
                        });
                    <\/script>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
    };

    if (isLoading || !operator) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <>
             <div style={{ position: 'absolute', left: '-9999px', opacity: 1 }}>
                <PrintableSummary 
                    ref={printRef}
                    operator={operator} 
                    currentMonth={currentMonth} 
                    monthlySummary={monthlySummary} 
                    dailyDetails={dailyDetails} 
                    formatMinutes={formatMinutes} 
                />
            </div>

            <Card className="p-4 sm:p-6">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                            <CardTitle className="text-2xl">Calcolo Fine Mese per {operator.username}</CardTitle>
                            <CardDescription>
                               Riepilogo delle ore, assenze e mancate timbrature per il mese selezionato.
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handlePrint} disabled={isProcessing}>
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                                Stampa Riepilogo
                            </Button>
                         </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                        <Button variant="outline" size="sm" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                        <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                        <Button variant="outline" size="sm" onClick={() => handleMonthChange(1)}>Succ.</Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <SummaryCard title="Giorni Lavorati" value={monthlySummary.workedDays} icon={Briefcase} />
                        <SummaryCard title="Ore Ordinarie" value={monthlySummary.ordinaryHours.toLocaleString('it-IT')} icon={Clock} />
                        <SummaryCard title="Ore Straordinarie" value={monthlySummary.overtimeHours.toLocaleString('it-IT')} icon={Plus} />
                        <SummaryCard title="Ferie (giorni)" value={monthlySummary.ferieDays} icon={Plane} />
                        <SummaryCard title="Permessi (ore)" value={monthlySummary.permessoHours.toLocaleString('it-IT')} icon={UserCheck} />
                        <SummaryCard title="Malattia (giorni)" value={monthlySummary.malattiaDays} icon={Stethoscope} />
                    </div>

                    <Separator />

                    <div>
                        <h3 className="text-xl font-semibold mb-4">Dettaglio Giornaliero</h3>
                        {dailyDetails.length > 0 ? (
                            <div className="space-y-2">
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

                                            {format(detail.date, 'eeee dd MMMM', { locale: it })}
                                        </h4>

                                        {detail.status === 'lavorato' && detail.shift && (
                                            <>
                                                <div className="text-sm text-muted-foreground mt-1 mb-3">
                                                    {detail.shift.events.map(e => `${e.type.replace('_', ' ')}: ${format(e.timestamp.toDate(), 'HH:mm')}`).join('  |  ')}
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                    <InfoBox label="Ore Previste" value={`${detail.shift.contractualHours}h`} />
                                                    <InfoBox label="Ore Lavorate" value={formatMinutes(detail.shift.workedMinutes)} />
                                                    <InfoBox label="Ore Ordinarie" value={`${detail.shift.ordinaryHours}h`} />
                                                    <InfoBox label="Straordinario" value={`${detail.shift.overtimeHours}h`} />
                                                    <InfoBox label="Permesso" value={`${detail.shift.permissionHours}h`} />
                                                </div>
                                            </>
                                        )}
                                        {detail.status === 'ferie' && <p className="text-muted-foreground mt-1">Giorno di ferie approvato.</p>}
                                        {detail.status === 'malattia' && <p className="text-muted-foreground mt-1">Giorno di malattia approvato.</p>}
                                        {detail.status === 'mancata_timbratura' && <p className="text-yellow-600 font-semibold mt-1">Nessuna timbratura registrata in un giorno lavorativo.</p>}
                                    </div>
                                )})}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">Nessun dato da mostrare per questo mese.</p>
                        )}
                    </div>
                </CardContent>
            </Card>

        </>
    );
}
