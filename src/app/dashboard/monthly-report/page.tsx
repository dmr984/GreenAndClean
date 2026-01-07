// src/app/dashboard/monthly-report/page.tsx
'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, Timestamp, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { Loader2, Calendar as CalendarIcon, Printer, User, Briefcase, Plane, Stethoscope, Coffee, ChevronLeft, ChevronRight, Euro } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfDay, endOfDay, isWithinInterval, startOfMonth, subMonths, addMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, DailyDetail, MonthlySummary } from '@/lib/calculations';
import { Separator } from '@/components/ui/separator';

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    workSchedule: any;
    overtimeCalculation?: 'hourly' | 'half_hourly';
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
};
type Request = { type: string; startDate: Timestamp; endDate: Timestamp; hours?: number; };
type Timbratura = { type: string; timestamp: Timestamp; status: string; };

const MonthlyReportPage = () => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [operators, setOperators] = useState<Operator[]>([]);
    const [summaries, setSummaries] = useState<Map<string, MonthlySummary>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

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

    const fetchDataForMonth = useCallback(async (date: Date) => {
        if (!firestore || operators.length === 0) {
            if (operators.length > 0) setIsLoading(false);
            return;
        }
        setIsLoading(true);

        const monthStart = startOfMonth(date);
        const monthEnd = endOfDay(date);

        try {
            const promises = operators.map(async (op) => {
                const timbratureQuery = query(
                    collection(firestore, `app-users/${op.id}/timbrature`),
                    where('timestamp', '>=', monthStart),
                    where('timestamp', '<=', monthEnd)
                );
                const requestsQuery = query(
                    collection(firestore, `app-users/${op.id}/requests`),
                    where('status', '==', 'approvato')
                );

                const [timbratureSnap, requestsSnap] = await Promise.all([
                    getDocs(timbratureQuery),
                    getDocs(requestsQuery),
                ]);

                const timbratureData = timbratureSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                const requestsData = requestsSnap.docs.map(d => ({...d.data(), id: d.id} as any));

                const { monthlySummary } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData });
                return { opId: op.id, summary: monthlySummary };
            });

            const results = await Promise.all(promises);
            const newSummaries = new Map<string, MonthlySummary>();
            results.forEach(({ opId, summary }) => {
                if (summary) newSummaries.set(opId, summary);
            });
            setSummaries(newSummaries);

        } catch (error) {
            console.error("Error fetching monthly report data:", error);
            toast({ title: 'Errore', description: 'Impossibile caricare il report mensile.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, operators, toast]);

    useEffect(() => {
        if (operators.length > 0) {
            fetchDataForMonth(currentMonth);
        } else if (operators.length === 0) {
             setIsLoading(false);
        }
    }, [currentMonth, operators, fetchDataForMonth]);

    const handleMonthChange = (offset: number) => {
        setCurrentMonth(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };
    
    const handleOpenPrintPreview = () => {
        const monthString = format(currentMonth, 'yyyy-MM');
        window.open(`/dashboard/monthly-report/print?month=${monthString}`, '_blank');
    };

    const calculateTotalDue = (op: Operator, summary: MonthlySummary | undefined) => {
        if (!summary) return 0;
        const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);
        if (op.salaryType === 'fixed') {
            return (op.fixedSalary || 0) + overtimeCost;
        } else {
            const ordinaryCost = (summary.ordinaryHours || 0) * (op.hourlyRate || 0);
            return ordinaryCost + overtimeCost;
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className='flex-row items-center justify-between'>
                    <div>
                        <CardTitle className="text-2xl">Report Mensile Aggregato</CardTitle>
                        <CardDescription>Visualizza i totali di tutti gli operatori per il mese selezionato.</CardDescription>
                    </div>
                     <Button onClick={handleOpenPrintPreview} disabled={isLoading}>
                        <Printer className="mr-2 h-4 w-4" /> Crea Report Stampabile
                    </Button>
                </CardHeader>
                <CardContent>
                     <div className="flex items-center justify-between gap-2 p-2 border rounded-md mb-6 w-full md:w-auto">
                        <Button variant="outline" size="icon" onClick={() => handleMonthChange(-1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                        <Button variant="outline" size="icon" onClick={() => handleMonthChange(1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    
                    {isLoading ? (
                         <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : operators.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">Nessun operatore trovato. Aggiungine uno dalla sezione "Gestione Operatori".</p>
                    ) : (
                        <div className="space-y-4">
                            {operators.map(op => {
                                const summary = summaries.get(op.id);
                                const totalDue = calculateTotalDue(op, summary);

                                return (
                                    <Card key={op.id}>
                                        <CardHeader>
                                            <div className='flex justify-between items-start'>
                                                <div>
                                                    <CardTitle>{op.firstName} {op.lastName}</CardTitle>
                                                    <CardDescription>Codice: {op.username}</CardDescription>
                                                </div>
                                                <div className='font-semibold text-lg flex items-center gap-2'><Euro className="h-5 w-5" />{totalDue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                            </div>
                                        </CardHeader>
                                        {summary && (
                                            <CardContent className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-2 text-sm">
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Giorni Lavorati</span><span className='font-bold'>{summary.workedDays}</span></div>
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Ore Ordinarie</span><span className='font-bold'>{summary.ordinaryHours}h</span></div>
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Straordinari</span><span className='font-bold'>{summary.overtimeHours}h</span></div>
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Ferie (g)</span><span className='font-bold'>{summary.ferieDays}</span></div>
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Permessi (h)</span><span className='font-bold'>{summary.permessoHours}</span></div>
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Malattia (g)</span><span className='font-bold'>{summary.malattiaDays}</span></div>
                                            </CardContent>
                                        )}
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

export default MonthlyReportPage;
