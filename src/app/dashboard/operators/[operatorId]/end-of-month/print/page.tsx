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
import Image from 'next/image';


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
    <div className="flex flex-col items-center justify-center p-2 border border-gray-300 rounded-md text-center h-full">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">{title}</p>
        <p className="text-xl font-bold">{value}</p>
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
    <div className="bg-gray-500 min-h-screen py-8 px-4 font-sans">
        <div className="max-w-4xl mx-auto bg-white text-black p-8 shadow-2xl rounded-lg">
            
             <header className="mb-4 text-center">
                 <div className="flex justify-center items-center gap-3">
                    <Image src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" width={32} height={32} className="h-8 w-8"/>
                    <h1 className="text-xl font-bold uppercase tracking-wider">Serveco SRL</h1>
                 </div>
                <h2 className="text-2xl font-bold mt-4">{operator.firstName} {operator.lastName}</h2>
                <p className="text-md text-gray-700">Riepilogo di {format(currentMonth, 'MMMM yyyy', { locale: it })}</p>
            </header>
             <div className="border-b border-gray-300 my-4"></div>
            
            <div className="py-4 my-4">
                <table className="w-full">
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
            </div>
            <div className="border-b border-gray-300 my-4"></div>
            
             <section>
                <h2 className="text-xl font-bold mb-3">Dettaglio Giornaliero</h2>
                <div className="text-sm space-y-3">
                    {dailyDetails.map((detail) => {
                        if (detail.status === 'riposo') return null;

                        let timbratureText = '';
                        if (detail.shift) {
                             const entrata = detail.shift.events.find(e => e.type === 'entrata');
                             const uscita = detail.shift.events.find(e => e.type === 'uscita');
                             const pausa = detail.shift.events.find(e => e.type === 'pausa');
                             const fine_pausa = detail.shift.events.find(e => e.type === 'fine_pausa');
                             
                             let parts: string[] = [];
                             if(entrata) parts.push(`Entrata: ${format(entrata.timestamp.toDate(), 'HH:mm')}`);
                             if(pausa) parts.push(`Pausa: ${format(pausa.timestamp.toDate(), 'HH:mm')}`);
                             if(fine_pausa) parts.push(`Fine Pausa: ${format(fine_pausa.timestamp.toDate(), 'HH:mm')}`);
                             if(uscita) parts.push(`Uscita: ${format(uscita.timestamp.toDate(), 'HH:mm')}`);

                             timbratureText = parts.join(' | ');
                        }
                        
                        let detailsText = '';
                         if (detail.status === 'lavorato' && detail.shift) {
                             let parts: string[] = [];
                             if(detail.shift.contractualHours > 0) parts.push(`Ore Previste: ${detail.shift.contractualHours}h`);
                             if(detail.shift.ordinaryHours > 0) parts.push(`Ore Ordinarie: ${detail.shift.ordinaryHours}h`);
                             if(detail.shift.overtimeHours > 0) parts.push(`Straordinario: ${detail.shift.overtimeHours}h`);
                             if(detail.shift.permissionHours > 0) parts.push(`Permesso: ${detail.shift.permissionHours}h`);
                             detailsText = parts.join(' | ');
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
                             <div key={detail.date.toISOString()} className="border-b border-gray-200 pb-2">
                                <div className="flex justify-between items-baseline">
                                     <p className="font-bold capitalize">{format(detail.date, 'eeee dd MMMM', { locale: it })} - {detail.status.replace(/_/g, ' ')}</p>
                                     <p className="text-gray-600 text-right text-xs">{timbratureText}</p>
                                </div>
                                <p className="text-gray-800 font-medium mt-1">{detailsText}</p>
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
