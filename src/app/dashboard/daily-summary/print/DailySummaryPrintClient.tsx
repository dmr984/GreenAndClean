'use client';

import React, { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Loader2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';
import { format, startOfDay, isValid, isSameDay, subMonths, addMonths } from 'date-fns';
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

export default function DailySummaryPrintClient() {
    const firestore = useFirestore();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [operators, setOperators] = useState<Operator[]>([]);
    const [dailyData, setDailyData] = useState<Map<string, DailyDetail>>(new Map());
    const [monthlyCumulative, setMonthlyCumulative] = useState<Map<string, { ordinary: number, overtime: number }>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const date = searchParams.get('date');
        if (date) {
            const [year, month, day] = date.split('-').map(Number);
            const parsedDate = new Date(Date.UTC(year, month - 1, day));
            if (isValid(parsedDate)) {
                setSelectedDate(parsedDate);
            }
        } else {
            const now = new Date();
            setSelectedDate(now);
        }
    }, [searchParams]);

    useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ops = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Operator));
            ops.sort((a,b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
            setOperators(ops);
            if (ops.length === 0) setIsLoading(false);
        }, (err) => {
            console.error("Error fetching operators:", err);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [firestore]);

    useEffect(() => {
        const fetchData = async (date: Date) => {
            if (!firestore || operators.length === 0) return;
            setIsLoading(true);

            const dayStart = startOfDay(date);
            const queryStart = subMonths(dayStart, 1);
            const queryEnd = addMonths(dayStart, 1);

            try {
                const newDailyData = new Map<string, DailyDetail>();
                const newMonthlyCumulative = new Map<string, { ordinary: number, overtime: number }>();

                for (const op of operators) {
                    const [timbratureSnap, requestsSnap, straordinariSnap] = await Promise.all([
                        getDocs(query(collection(firestore, `app-users/${op.id}/timbrature`), where('timestamp', '>=', queryStart), where('timestamp', '<=', queryEnd))),
                        getDocs(query(collection(firestore, `app-users/${op.id}/requests`), where('status', '==', 'approvato'))),
                        getDocs(query(collection(firestore, `app-users/${op.id}/straordinari`), where('date', '>=', queryStart), where('date', '<=', queryEnd)))
                    ]);

                    const timbratureData = timbratureSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                    const requestsData = requestsSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                    const straordinariData = straordinariSnap.docs.map(d => ({...d.data(), id: d.id} as any));

                    const { dailyDetails: monthDetails } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData, straordinari: straordinariData });
                    
                    const cumulative = monthDetails
                        .filter(d => d.date <= dayStart)
                        .reduce((acc, d) => {
                            acc.ordinary += d.shift?.ordinaryHours || 0;
                            acc.overtime += d.shift?.overtimeHours || 0;
                            return acc;
                        }, { ordinary: 0, overtime: 0 });

                    const dayDetail = monthDetails.find(d => isSameDay(d.date, dayStart));
                    
                    if (dayDetail) newDailyData.set(op.id, dayDetail);
                    newMonthlyCumulative.set(op.id, cumulative);
                }

                setDailyData(newDailyData);
                setMonthlyCumulative(newMonthlyCumulative);
            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ title: 'Errore', description: 'Impossibile caricare i dati.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        if (selectedDate && operators.length > 0) {
            fetchData(selectedDate);
        }
    }, [selectedDate, operators, firestore, toast]);

    if (isLoading || !selectedDate) {
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
                <div className="w-full max-w-4xl bg-white p-6 sm:p-10 shadow-lg print:shadow-none" style={{ width: '210mm', minHeight: '297mm' }}>
                    <div className="w-full mb-10 border-b-2 border-black pb-4">
                        <table className="w-full">
                            <tbody>
                                <tr>
                                    <td><img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Logo" style={{width: '60px'}} /></td>
                                    <td className="text-right">
                                        <h2 className="text-2xl font-bold text-black uppercase">Report Giornaliero Presenze</h2>
                                        <p className="text-black font-bold uppercase">{format(selectedDate, 'eeee dd MMMM yyyy', { locale: it })}</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-12">
                        {operators.map(op => {
                            const detail = dailyData.get(op.id);
                            const cumulative = monthlyCumulative.get(op.id);
                            if (!detail) return null;

                            const isWorkDay = detail.status === 'lavorato' || detail.status === 'in_corso';

                            return (
                                <div key={op.id} className="print:break-inside-avoid border-b border-gray-200 pb-6">
                                    <div className="flex justify-between items-baseline mb-4">
                                        <h3 className="text-xl font-bold text-black uppercase">{op.firstName} {op.lastName}</h3>
                                        <p className="text-black font-bold uppercase">{format(selectedDate, 'dd/MM/yyyy')}</p>
                                    </div>

                                    <div className="text-left mb-4">
                                        <p className="text-black font-bold text-lg uppercase mb-2">
                                            {isWorkDay ? 'Presente' : detail.status.replace('_', ' ').toUpperCase()}
                                        </p>
                                        
                                        {detail.shift?.allShifts && (
                                            <div className="text-black text-sm space-y-1">
                                                {detail.shift.allShifts.map((s, idx) => (
                                                    <p key={idx}>
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
                                    </div>

                                    <div className="flex justify-between items-center text-black text-sm font-bold mt-6 pt-2">
                                        <div>
                                            ORD: {detail.shift?.ordinaryHours || 0}h | STR: {detail.shift?.overtimeHours || 0}h
                                        </div>
                                        <div className="uppercase">
                                            CUMULATIVO: ORD: {cumulative?.ordinary || 0}h | STR: {cumulative?.overtime || 0}h
                                        </div>
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
