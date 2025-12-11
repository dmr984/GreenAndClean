'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs, writeBatch } from 'firebase/firestore';
import { Loader2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, set } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, calculateShiftDetails, type DailyDetail, type MonthlySummary } from '@/lib/calculations';
import 'jspdf-autotable';


// Type definitions are now in calculations.ts
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
    contractType?: 'weekly' | 'monthly';
    totalMonthlyHours?: number;
    overtimeCalculation?: 'hourly' | 'half_hourly';
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

const SummaryItem = ({ title, value }: { title: string, value: string | number }) => (
    <div className="flex flex-col items-center justify-center p-2 border border-gray-300 rounded-md text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">{title}</p>
        <p className="text-base font-bold">{value}</p>
    </div>
);


export default function PrintPage() {
    const firestore = useFirestore();
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const operatorId = params.operatorId as string;
    
    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[] }>({ timbrature: [], requests: [] });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      const monthTimestamp = searchParams.get('month');
      if (monthTimestamp) {
        setCurrentMonth(new Date(parseInt(monthTimestamp, 10)));
      }
    }, [searchParams]);

    useEffect(() => {
        if (!firestore || !operatorId) return;

        const fetchOperator = async () => {
            const opDoc = await getDoc(doc(firestore, 'app-users', operatorId));
            if (opDoc.exists()) {
                setOperator({ id: opDoc.id, ...opDoc.data() } as Operator);
            }
        };
        fetchOperator();
    }, [firestore, operatorId]);

    const fetchDataForMonth = useCallback(async () => {
        if (!firestore || !operatorId) {
            setIsLoading(false);
            return;
        };
        setIsLoading(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        try {
            const timbratureQuery = query(
                collection(firestore, `app-users/${operatorId}/timbrature`),
                where('timestamp', '>=', monthStart),
                where('timestamp', '<=', monthEnd)
            );
            const requestsQuery = query(
                collection(firestore, `app-users/${operatorId}/requests`),
                where('status', '==', 'approvato')
            );
    
            const [timbratureSnapshot, requestsSnapshot] = await Promise.all([
                getDocs(timbratureQuery),
                getDocs(requestsQuery)
            ]);

            const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)).filter(t => t.status === 'confermata');
            const requestsData = requestsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Request));

            setMonthlyData({ timbrature: timbratureData, requests: requestsData });
        } catch (error) {
            console.error("Error fetching monthly data:", error);
            toast({ title: 'Errore', description: 'Impossibile caricare i dati del mese.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, operatorId, currentMonth, toast]);

    useEffect(() => {
        fetchDataForMonth();
    }, [fetchDataForMonth]);

    const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator || isLoading) {
            return { monthlySummary: {} as MonthlySummary, dailyDetails: [] as DailyDetail[] };
        }
        return processMonthlyData(currentMonth, operator, monthlyData);
    }, [operator, currentMonth, monthlyData, isLoading]);

    if (isLoading || !operator) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-gray-100">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    

    return (
    <div className="bg-gray-500 min-h-screen py-8 px-4">
        <div className="max-w-4xl mx-auto bg-white text-black p-8 font-sans shadow-2xl rounded-lg">
            <header className="mb-6 border-b pb-4">
                 <table className="w-full">
                    <tbody>
                        <tr>
                            <td style={{ width: '20%' }}>
                                <img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" className="h-16 w-16" />
                            </td>
                            <td className="text-right align-top" style={{ width: '80%' }}>
                                <h1 className="text-xl font-bold">{operator.firstName} {operator.lastName}</h1>
                                <p className="text-sm text-gray-700">Riepilogo di {format(currentMonth, 'MMMM yyyy', { locale: it })}</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </header>
            
            <section className="mb-6">
                <table className="w-full border-collapse">
                    <tbody>
                        <tr>
                            <td className="p-1"><SummaryItem title="Giorni Lavorati" value={monthlySummary.workedDays || 0} /></td>
                            <td className="p-1"><SummaryItem title="Ore Ordinarie" value={(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')} /></td>
                            <td className="p-1"><SummaryItem title="Ore Straordinarie" value={(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')} /></td>
                            <td className="p-1"><SummaryItem title="Ferie" value={monthlySummary.ferieDays || 0} /></td>
                            <td className="p-1"><SummaryItem title="Permessi" value={(monthlySummary.permessoHours || 0).toLocaleString('it-IT')} /></td>
                            <td className="p-1"><SummaryItem title="Malattia" value={monthlySummary.malattiaDays || 0} /></td>
                        </tr>
                    </tbody>
                </table>
            </section>
            
             <section>
                <h2 className="text-lg font-bold border-b pb-1 mb-2">Dettaglio Giornaliero</h2>
                <div className="text-xs">
                    {dailyDetails.map((detail, index) => {
                        if (detail.status === 'riposo') return null;

                        const isLast = index === dailyDetails.length - 1;

                        let timbratureText = '';
                        if (detail.shift) {
                            timbratureText = detail.shift.events
                                .map(e => `${e.type.charAt(0).toUpperCase()}${e.type.slice(1)}: ${format(e.timestamp.toDate(), 'HH:mm')}`)
                                .join(' | ');
                        }
                        
                        let detailsText = '';
                        if (detail.shift) {
                            detailsText = `Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`;
                        } else if(detail.status === 'ferie') {
                            detailsText = "Giorno di ferie approvato";
                        } else if(detail.status === 'malattia') {
                            detailsText = "Giorno di malattia approvato";
                        } else if(detail.status === 'festa') {
                            detailsText = "Giorno festivo";
                        } else if(detail.status === 'mancata_timbratura') {
                            detailsText = "Nessuna timbratura registrata";
                        }


                        return (
                             <div key={detail.date.toISOString()} className={cn(!isLast && "border-b border-gray-200 pb-2 mb-2")}>
                                <div className="flex justify-between">
                                     <p className="font-bold capitalize">{format(detail.date, 'eeee dd MMMM', { locale: it })} - {detail.status.replace(/_/g, ' ')}</p>
                                     <p className="text-gray-600 text-right">{timbratureText}</p>
                                </div>
                                <p className="text-gray-800 font-medium mt-0.5">{detailsText}</p>
                            </div>
                        )
                    })}
                    {dailyDetails.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Nessun dato da mostrare per questo mese.</p>}
                </div>
            </section>
        </div>
        <div className="no-print fixed top-4 right-4 flex flex-col gap-2">
            <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Stampa
            </Button>
            <Button variant="outline" onClick={() => window.close()}>
                <X className="mr-2 h-4 w-4" /> Chiudi
            </Button>
        </div>
    </div>
    );
}
