'use client';

import React, { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Loader2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';
import { format, isValid, isSameDay, subMonths, addMonths, startOfWeek, eachDayOfInterval, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, DailyDetail } from '@/lib/calculations';
import { Toaster } from '@/components/ui/toaster';

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    workSchedule: any;
    overtimeHalfHourTrigger?: number;
    overtimeHourTrigger?: number;
};

export default function WeeklyReportPrintClient() {
    const firestore = useFirestore();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [startDate, setStartDate] = useState<Date | null>(null);
    const [operators, setOperators] = useState<Operator[]>([]);
    const [weeklyData, setWeeklyData] = useState<Map<string, DailyDetail[]>>(new Map());
    const [monthlyCumulative, setMonthlyCumulative] = useState<Map<string, Map<string, { ordinary: number, overtime: number }>>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const start = searchParams.get('startDate');
        if (start) {
            const parsed = new Date(start);
            if (isValid(parsed)) {
                const startOfW = startOfWeek(parsed, { weekStartsOn: 1 });
                setStartDate(startOfW);
            }
        }
    }, [searchParams]);

    useEffect(() => {
        if (!firestore) return;
        const opIds = searchParams.get('operators')?.split(',') || [];
        if (opIds.length === 0) {
            setIsLoading(false);
            return;
        }

        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOps = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Operator));
            const filtered = allOps.filter(op => opIds.includes(op.id));
            filtered.sort((a,b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
            setOperators(filtered);
            if (filtered.length === 0) setIsLoading(false);
        });
        return () => unsubscribe();
    }, [firestore, searchParams]);

    useEffect(() => {
        const fetchData = async () => {
            if (!firestore || operators.length === 0 || !startDate) return;
            setIsLoading(true);

            const weekDays = eachDayOfInterval({ 
                start: startDate, 
                end: addDays(startDate, 6) 
            });

            try {
                const newWeeklyData = new Map<string, DailyDetail[]>();
                const newMonthlyCumulative = new Map<string, Map<string, { ordinary: number, overtime: number }>>();

                for (const op of operators) {
                    const queryStart = subMonths(startDate, 1);
                    const queryEnd = addMonths(startDate, 1);

                    const [timbratureSnap, requestsSnap, straordinariSnap] = await Promise.all([
                        getDocs(query(collection(firestore, `app-users/${op.id}/timbrature`), where('timestamp', '>=', queryStart), where('timestamp', '<=', queryEnd))),
                        getDocs(query(collection(firestore, `app-users/${op.id}/requests`), where('status', '==', 'approvato'))),
                        getDocs(query(collection(firestore, `app-users/${op.id}/straordinari`), where('date', '>=', queryStart), where('date', '<=', queryEnd)))
                    ]);

                    const timbratureData = timbratureSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                    const requestsData = requestsSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                    const straordinariData = straordinariSnap.docs.map(d => ({...d.data(), id: d.id} as any));

                    const opWeeklyDetails: DailyDetail[] = [];
                    const opCumulativeMap = new Map<string, { ordinary: number, overtime: number }>();

                    for (const day of weekDays) {
                        const { dailyDetails: monthDetails } = processMonthlyData(day, op, { timbrature: timbratureData, requests: requestsData, straordinari: straordinariData });
                        
                        const dayDetail = monthDetails.find(d => isSameDay(d.date, day));
                        if (dayDetail) opWeeklyDetails.push(dayDetail);

                        const cumulative = monthDetails
                            .filter(d => d.date <= day)
                            .reduce((acc, d) => {
                                acc.ordinary += d.shift?.ordinaryHours || 0;
                                acc.overtime += d.shift?.overtimeHours || 0;
                                return acc;
                            }, { ordinary: 0, overtime: 0 });
                        
                        opCumulativeMap.set(day.toISOString(), cumulative);
                    }

                    newWeeklyData.set(op.id, opWeeklyDetails);
                    newMonthlyCumulative.set(op.id, opCumulativeMap);
                }

                setWeeklyData(newWeeklyData);
                setMonthlyCumulative(newMonthlyCumulative);
            } catch (error) {
                console.error("Error fetching weekly data:", error);
                toast({ title: 'Errore', description: 'Impossibile caricare i dati.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        if (operators.length > 0 && startDate) {
            fetchData();
        }
    }, [firestore, operators, startDate, toast]);

    if (isLoading || !startDate) {
        return <div className="flex h-screen w-full items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    return (
        <div className="bg-background text-black min-h-screen">
            <header className="sticky top-0 z-10 flex h-16 items-center justify-center border-b bg-background px-4 no-print">
                <div className="flex-1"></div>
                <div className="flex flex-1 items-center justify-center gap-2">
                    <Button variant="default" size="icon" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-1 items-center justify-end">
                    <Button variant="ghost" size="icon" onClick={() => window.close()}><X className="h-5 w-5" /></Button>
                </div>
            </header>

            <main className="flex justify-center p-4 sm:p-8 bg-gray-100 print:bg-white print:p-0">
                <div id="print-content" className="w-full max-w-4xl bg-white p-6 sm:p-10 shadow-lg print:shadow-none" style={{ width: '210mm', minHeight: '297mm' }}>
                    <div className="w-full mb-10 border-b-2 border-black pb-4">
                        <table className="w-full">
                            <tbody>
                                <tr>
                                    <td><img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Logo" style={{width: '60px'}} /></td>
                                    <td className="text-right">
                                        <h2 className="text-2xl font-bold text-black uppercase">Report Settimanale Presenze</h2>
                                        <p className="text-black font-bold">Dal {format(startDate, 'dd/MM/yyyy')} al {format(addDays(startDate, 6), 'dd/MM/yyyy')}</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-12">
                        {operators.map(op => {
                            const details = weeklyData.get(op.id) || [];
                            const opCumulative = monthlyCumulative.get(op.id);

                            return (
                                <div key={op.id} className="print:break-inside-avoid">
                                    <div className="border-b-2 border-black mb-6 pb-1">
                                        <h3 className="text-xl font-bold text-black uppercase">{op.firstName} {op.lastName}</h3>
                                    </div>

                                    <div className="space-y-8">
                                        {details.map((detail, idx) => {
                                            const cum = opCumulative?.get(detail.date.toISOString());
                                            const isWorkDay = detail.status === 'lavorato' || detail.status === 'in_corso';

                                            return (
                                                <div key={idx} className="border-b border-gray-200 pb-4">
                                                    <div className="flex justify-between items-baseline mb-2">
                                                        <p className="text-black font-bold text-lg uppercase">
                                                            {isWorkDay ? 'Presente' : detail.status.replace('_', ' ').toUpperCase()}
                                                        </p>
                                                        <p className="text-black font-bold uppercase">{format(detail.date, 'eeee dd MMMM', { locale: it })}</p>
                                                    </div>

                                                    {detail.shift?.allShifts && (
                                                        <div className="text-black text-sm mb-3 space-y-1 text-left">
                                                            {detail.shift.allShifts.map((s, sIdx) => (
                                                                <p key={sIdx}>
                                                                    {s.events.map(e => {
                                                                        const time = format(e.timestamp.toDate(), 'HH:mm');
                                                                        let ref = '';
                                                                        if (e.type === 'entrata' && s.calculationStart) ref = ` (${format(s.calculationStart, 'HH:mm')})`;
                                                                        if (e.type === 'uscita' && s.calculationEnd) ref = ` (${format(s.calculationEnd, 'HH:mm')})`;
                                                                        return `${e.type.toUpperCase()}: ${time}${ref}`;
                                                                    }).join(' | ')}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="flex justify-between items-center text-black text-sm font-bold mt-4 pt-1">
                                                        <div>
                                                            ORD: {detail.shift?.ordinaryHours || 0}h | STR: {detail.shift?.overtimeHours || 0}h
                                                        </div>
                                                        <div className="uppercase">
                                                            CUMULATIVO: ORD: {cum?.ordinary || 0}h | STR: {cum?.overtime || 0}h
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>
            <Toaster />
        </div>
    );
}
