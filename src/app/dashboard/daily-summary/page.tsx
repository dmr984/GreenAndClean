// src/app/dashboard/daily-summary/page.tsx
'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, Timestamp, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { Loader2, Calendar as CalendarIcon, Printer, User, Briefcase, Plane, Stethoscope, Coffee } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfDay, endOfDay, isWithinInterval, startOfMonth, subMonths, addMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, DailyDetail } from '@/lib/calculations';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';

// Simplified types for this page
type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    workSchedule: any; // Using 'any' for simplicity, defined in calculations
    overtimeCalculation?: 'hourly' | 'half_hourly';
};
type Request = { type: string; startDate: Timestamp; endDate: Timestamp; hours?: number; };
type Timbratura = { type: string; timestamp: Timestamp; status: string; };

const DailySummaryPage = () => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [operators, setOperators] = useState<Operator[]>([]);
    const [dailyData, setDailyData] = useState<Map<string, DailyDetail>>(new Map());
    const [monthlyCumulative, setMonthlyCumulative] = useState<Map<string, { ordinary: number, overtime: number, leave: number }>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ops = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Operator));
            ops.sort((a,b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
            setOperators(ops);
        });
        return () => unsubscribe();
    }, [firestore]);

    const fetchDataForDay = useCallback(async (date: Date) => {
        if (!firestore || operators.length === 0) {
            if (operators.length > 0) setIsLoading(false);
            return;
        }
        setIsLoading(true);

        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        
        // Widen query range for makeup shifts
        const queryStart = subMonths(dayStart, 1);
        const queryEnd = addMonths(dayEnd, 1);

        try {
            const promises = operators.map(async (op) => {
                const timbratureQuery = query(
                    collection(firestore, `app-users/${op.id}/timbrature`),
                    where('timestamp', '>=', queryStart),
                    where('timestamp', '<=', queryEnd)
                );
                const requestsQuery = query(
                    collection(firestore, `app-users/${op.id}/requests`),
                    where('status', '==', 'approvato')
                );
                const straordinariQuery = query(
                    collection(firestore, `app-users/${op.id}/straordinari`),
                    where('date', '>=', queryStart),
                    where('date', '<=', queryEnd)
                );

                const [timbratureSnap, requestsSnap, straordinariSnap] = await Promise.all([
                    getDocs(timbratureQuery),
                    getDocs(requestsSnap),
                    getDocs(straordinariQuery)
                ]);

                const timbratureData = timbratureSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                const requestsData = requestsSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                const straordinariData = straordinariSnap.docs.map(d => ({...d.data(), id: d.id} as any));

                // Cumulative data for the month up to the selected day
                const { dailyDetails: monthDetails } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData, straordinari: straordinariData });
                
                const cumulative = monthDetails
                    .filter(d => d.date <= dayStart)
                    .reduce((acc, d) => {
                        acc.ordinary += d.shift?.ordinaryHours || 0;
                        acc.overtime += d.shift?.overtimeHours || 0;
                        acc.leave += d.shift?.permissionHours || 0;
                        return acc;
                    }, { ordinary: 0, overtime: 0, leave: 0 });

                // Specific data for the selected day
                const dayDetail = monthDetails.find(d => isWithinInterval(dayStart, { start: startOfDay(d.date), end: endOfDay(d.date) }));
                
                return { opId: op.id, dayDetail, cumulative };
            });

            const results = await Promise.all(promises);
            
            const newDailyData = new Map<string, DailyDetail>();
            const newMonthlyCumulative = new Map<string, { ordinary: number, overtime: number, leave: number }>();

            results.forEach(({ opId, dayDetail, cumulative }) => {
                if (dayDetail) newDailyData.set(opId, dayDetail);
                if (cumulative) newMonthlyCumulative.set(opId, cumulative);
            });

            setDailyData(newDailyData);
            setMonthlyCumulative(newMonthlyCumulative);

        } catch (error) {
            console.error("Error fetching daily summary data:", error);
            toast({ title: 'Errore', description: 'Impossibile caricare il report giornaliero.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, operators, toast]);

    useEffect(() => {
        if (selectedDate && operators.length > 0) {
            fetchDataForDay(selectedDate);
        } else if (operators.length === 0) {
             // Maybe no operators yet, stop loading
             setIsLoading(false);
        }
    }, [selectedDate, operators, fetchDataForDay]);

    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            setSelectedDate(date);
        }
        setIsCalendarOpen(false);
    };
    
    const handleOpenPrintPreview = () => {
        if (!selectedDate) return;
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        window.open(`/dashboard/daily-summary/print?date=${dateString}`, '_blank');
    };

    const renderStatus = (detail: DailyDetail | undefined) => {
        if (!detail || detail.status === 'riposo') return <div className="flex items-center gap-2 text-muted-foreground"><Coffee className="h-4 w-4"/>Riposo Contrattuale</div>;
        
        switch (detail.status) {
            case 'lavorato': return <div className="flex items-center gap-2 text-green-600"><Briefcase className="h-4 w-4"/>Presente</div>;
            case 'festa': return <div className="flex items-center gap-2 text-purple-600"><Briefcase className="h-4 w-4"/>Festivo</div>;
            case 'ferie': return <div className="flex items-center gap-2 text-blue-600"><Plane className="h-4 w-4"/>In Ferie</div>;
            case 'malattia': return <div className="flex items-center gap-2 text-orange-600"><Stethoscope className="h-4 w-4"/>In Malattia</div>;
            case 'mancata_timbratura': return <div className="flex items-center gap-2 text-red-600"><User className="h-4 w-4"/>Assente</div>;
            default: return <span className="text-muted-foreground">N/D</span>;
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className='flex-row items-center justify-between'>
                    <div>
                        <CardTitle className="text-2xl">Report Giornaliero</CardTitle>
                        <CardDescription>Visualizza lo stato di tutti gli operatori per un giorno specifico.</CardDescription>
                    </div>
                     <Button onClick={handleOpenPrintPreview} disabled={isLoading}>
                        <Printer className="mr-2 h-4 w-4" /> Crea Report
                    </Button>
                </CardHeader>
                <CardContent>
                     <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="w-full md:w-auto mb-6">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {selectedDate ? format(selectedDate, "PPP", { locale: it }) : <span>Seleziona una data</span>}
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="w-auto p-0">
                             <DialogHeader className="p-4 pb-0">
                               <DialogTitle>Seleziona una data</DialogTitle>
                               <DialogDescription>
                                   Scegli il giorno per cui visualizzare il report.
                               </DialogDescription>
                             </DialogHeader>
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={handleDateSelect}
                                initialFocus
                                locale={it}
                            />
                        </DialogContent>
                    </Dialog>
                    
                    {isLoading ? (
                         <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : operators.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">Nessun operatore trovato. Aggiungine uno dalla sezione "Gestione Operatori".</p>
                    ) : (
                        <div className="space-y-4">
                            {operators.map(op => {
                                const detail = dailyData.get(op.id);
                                const cumulative = monthlyCumulative.get(op.id);
                                const clockInEvent = detail?.shift?.events.find(e => e.type === 'entrata');
                                const makeupDay = clockInEvent?.makeupOfDay;

                                return (
                                    <Card key={op.id} className={cn(detail?.status === 'mancata_timbratura' && 'bg-red-500/5 border-red-500/20')}>
                                        <CardHeader>
                                            <div className='flex justify-between items-start'>
                                                <div>
                                                    <CardTitle>{op.firstName} {op.lastName}</CardTitle>
                                                    <CardDescription>Codice: {op.username}</CardDescription>
                                                </div>
                                                <div className='font-semibold'>{renderStatus(detail)}</div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            {detail?.shift && detail.shift.allShifts ? (
                                                <div className='text-sm'>
                                                    {makeupDay && detail.shift && <p className="text-sm font-semibold text-primary mb-1">Recupero del {format(detail.shift.events[0].timestamp.toDate(), 'PPP', {locale: it})}</p>}
                                                    <p className='font-semibold'>Timbrature del giorno:</p>
                                                    <div className='text-muted-foreground'>
                                                        {detail.shift.allShifts.map((shiftBlock, idx) => (
                                                            <div key={idx} className="mb-1">
                                                                <span className="font-medium mr-2">{`Turno ${idx + 1}:`}</span>
                                                                <span>
                                                                    {shiftBlock.events.map(e => {
                                                                        const originalTime = format(e.timestamp.toDate(), 'HH:mm');
                                                                        let referenceTime = '';

                                                                        if (e.type === 'entrata' && shiftBlock.calculationStart) {
                                                                            referenceTime = `(${format(shiftBlock.calculationStart, 'HH:mm')})`;
                                                                        } else if (e.type === 'uscita' && shiftBlock.calculationEnd) {
                                                                            referenceTime = `(${format(shiftBlock.calculationEnd, 'HH:mm')})`;
                                                                        }
                                                                        const formattedType = e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ');
                                                                        return `${formattedType}: ${originalTime} ${referenceTime}`.trim();
                                                                    }).join(' | ')}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                             <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2'>
                                                <div className="p-3 border rounded-md">
                                                    <p className="text-sm font-semibold">Dettaglio Giorno</p>
                                                    <Separator className="my-1"/>
                                                    <p className='text-xs'>Ore Ordinarie: <span className='font-bold'>{detail?.shift?.ordinaryHours || 0}h</span></p>
                                                    <p className='text-xs'>Straordinari: <span className='font-bold'>{detail?.shift?.overtimeHours || 0}h</span></p>
                                                    <p className='text-xs'>Permessi: <span className='font-bold'>{detail?.shift?.permissionHours || 0}h</span></p>
                                                </div>
                                                <div className="p-3 border rounded-md sm:col-span-2">
                                                    <p className="text-sm font-semibold">Cumulativo mese (fino ad oggi)</p>
                                                     <Separator className="my-1"/>
                                                    <div className='grid grid-cols-1 sm:grid-cols-3 gap-x-4'>
                                                        <p className='text-xs'>Ore Ordinarie: <span className='font-bold'>{cumulative?.ordinary || 0}h</span></p>
                                                        <p className='text-xs'>Straordinari: <span className='font-bold'>{cumulative?.overtime || 0}h</span></p>
                                                        <p className='text-xs'>Permessi: <span className='font-bold'>{cumulative?.leave || 0}h</span></p>
                                                    </div>
                                                </div>
                                             </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default DailySummaryPage;
