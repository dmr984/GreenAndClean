'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { Loader2, Printer, Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParams, useSearchParams } from 'next/navigation';
import { format, isValid, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, type MonthlySummary, type DailyDetail } from '@/lib/calculations';
import { generateDetailedOperatorPdf } from '@/lib/pdf-utility';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

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
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
    sickLeaveRate?: number;
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    associatedShiftId?: string;
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

type DailyNote = {
    note: string;
    date: string;
};

export default function PrintClient() {
    const firestore = useFirestore();
    const params = useParams();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const operatorId = params.operatorId as string;

    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[], dailyNotes: DailyNote[], straordinari: any[] }>({ timbrature: [], requests: [], dailyNotes: [], straordinari: [] });
    const [manualTotals, setManualTotals] = useState({ ferie: -1, permessi: -1, malattia: -1 });

    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        const month = searchParams.get('month'); // YYYY-MM
        if (month) {
            const [year, monthIndex] = month.split('-').map(Number);
            const date = new Date(year, monthIndex - 1, 15); // Use 15th to avoid timezone issues
            if (isValid(date)) {
                setCurrentMonth(date);
            }
        }
        
        const ferie = searchParams.get('ferie');
        const permessi = searchParams.get('permessi');
        const malattia = searchParams.get('malattia');

        setManualTotals({
            ferie: ferie ? parseFloat(ferie) : -1,
            permessi: permessi ? parseFloat(permessi) : -1,
            malattia: malattia ? parseFloat(malattia) : -1,
        });

    }, [searchParams]);

    useEffect(() => {
        if (!firestore || !operatorId) return;

        const loadAllData = async () => {
            setIsLoading(true);
            try {
                // Fetch Operator Data
                const opDoc = await getDoc(doc(firestore, 'app-users', operatorId));
                if (opDoc.exists()) {
                    setOperator({ id: opDoc.id, ...opDoc.data() } as Operator);
                } else {
                    toast({ title: 'Errore', description: 'Operatore non trovato.', variant: 'destructive' });
                    setIsLoading(false);
                    return;
                }

                // Fetch Timbrature and Requests
                const monthStart = startOfMonth(currentMonth);
                const monthEnd = endOfMonth(currentMonth);
                const queryStart = subMonths(monthStart, 1);
                const queryEnd = addMonths(monthEnd, 1);

                const timbratureQuery = query(
                    collection(firestore, `app-users/${operatorId}/timbrature`),
                    where('timestamp', '>=', queryStart),
                    where('timestamp', '<=', queryEnd)
                );
                const requestsQuery = query(
                    collection(firestore, `app-users/${operatorId}/requests`),
                    where('status', '==', 'approvato')
                );
                
                const notesQuery = query(
                    collection(firestore, `app-users/${operatorId}/daily-notes`),
                     where('__name__', '>=', format(monthStart, 'yyyy-MM-dd')),
                     where('__name__', '<=', format(monthEnd, 'yyyy-MM-dd'))
                );
                const straordinariQuery = query(
                    collection(firestore, `app-users/${operatorId}/straordinari`),
                    where('date', '>=', queryStart),
                    where('date', '<=', queryEnd)
                );

                const [timbratureSnapshot, requestsSnapshot, notesSnapshot, straordinariSnap] = await Promise.all([
                    getDocs(timbratureQuery),
                    getDocs(requestsQuery),
                    getDocs(notesQuery),
                    getDocs(straordinariQuery)
                ]);

                const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)).filter(t => t.status === 'confermata');
                const requestsData = requestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request));
                const notesData = notesSnapshot.docs.map(d => ({ date: d.id, ...d.data() } as DailyNote));
                const straordinariData = straordinariSnap.docs.map(d => ({id: d.id, ...d.data()} as any));
                
                setMonthlyData({ timbrature: timbratureData, requests: requestsData, dailyNotes: notesData, straordinari: straordinariData });

            } catch (error) {
                 console.error("Error fetching data for print:", error);
                 toast({ title: 'Errore Caricamento Dati', description: 'Impossibile caricare i dati per il report.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        }

        loadAllData();
    }, [firestore, operatorId, currentMonth, toast]);

    const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator || isLoading) {
            return { monthlySummary: {} as MonthlySummary, dailyDetails: [] as DailyDetail[] };
        }
        return processMonthlyData(currentMonth, operator, monthlyData);
    }, [operator, currentMonth, monthlyData, isLoading]);

    const finalOrdinaryHours = monthlySummary.ordinaryHours ?? 0;
    const finalOvertimeHours = monthlySummary.overtimeHours ?? 0;
    const finalFerieDays = manualTotals.ferie !== -1 ? manualTotals.ferie : (monthlySummary.ferieDays ?? 0);
    const finalPermessoHours = manualTotals.permessi !== -1 ? manualTotals.permessi : (monthlySummary.permessoHours ?? 0);
    const finalMalattiaDays = manualTotals.malattia !== -1 ? manualTotals.malattia : (monthlySummary.malattiaDays ?? 0);
    
    const overtimeCost = finalOvertimeHours * (operator?.overtimeRate || 0);
    const ferieCost = monthlySummary.ferieCost || 0;
    const permessoCost = monthlySummary.permessoCost || 0;
    const malattiaCost = monthlySummary.malattiaCost || 0;
    let totalDue: number;
    let ordinaryCost: number;

    if (operator?.salaryType === 'fixed') {
        ordinaryCost = operator.fixedSalary || 0;
        totalDue = ordinaryCost + overtimeCost + malattiaCost + ferieCost + permessoCost;
    } else {
        ordinaryCost = finalOrdinaryHours * (operator?.hourlyRate || 0);
        totalDue = ordinaryCost + overtimeCost + malattiaCost + ferieCost + permessoCost;
    }

    const handleDownload = async () => {
        if (!operator) return;
        setIsGenerating(true);
        try {
            const result = await generateDetailedOperatorPdf(
                currentMonth,
                operator,
                monthlySummary,
                dailyDetails,
                {}, // Default visibility
                {
                    ferieDays: manualTotals.ferie !== -1 ? manualTotals.ferie : undefined,
                    permessoHours: manualTotals.permessi !== -1 ? manualTotals.permessi : undefined,
                    malattiaDays: manualTotals.malattia !== -1 ? manualTotals.malattia : undefined,
                }
            );
            if (result) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(result.blob);
                a.download = result.fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            }
        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({ title: 'Errore', description: 'Impossibile generare il PDF.', variant: 'destructive' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };
    
    const handleShare = async () => {
        if (!operator || !navigator.share) {
            toast({ title: 'Condivisione non supportata', description: 'Il tuo browser non supporta la condivisione di file.', variant: 'destructive' });
            return;
        }

        setIsGenerating(true);
        try {
            const result = await generateDetailedOperatorPdf(
                currentMonth,
                operator,
                monthlySummary,
                dailyDetails,
                {},
                {
                    ferieDays: manualTotals.ferie !== -1 ? manualTotals.ferie : undefined,
                    permessoHours: manualTotals.permessi !== -1 ? manualTotals.permessi : undefined,
                    malattiaDays: manualTotals.malattia !== -1 ? manualTotals.malattia : undefined,
                }
            );

            if (!result) return;

            const file = new File([result.blob], result.fileName, { type: 'application/pdf' });
            await navigator.share({
                title: `Riepilogo ${operator.firstName} ${operator.lastName}`,
                text: `Ecco il riepilogo per ${format(currentMonth, 'MMMM yyyy', { locale: it })}.`,
                files: [file],
            });
        } catch (error) {
            if ((error as DOMException).name !== 'AbortError') {
                 console.error("Error sharing PDF:", error);
                 toast({ title: 'Errore Condivisione', description: 'Impossibile condividere il file.', variant: 'destructive' });
            }
        } finally {
            setIsGenerating(false);
        }
    };
    
    if (isLoading || !operator) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="bg-background text-foreground min-h-screen">
             <header className="sticky top-0 z-10 flex h-16 items-center justify-center border-b bg-background px-4 no-print">
                 <div className="flex-1"></div>
                 <div className="flex flex-1 items-center justify-center gap-2">
                     <Button variant="default" size="icon" onClick={handlePrint} disabled={isGenerating}>
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Printer className="h-4 w-4" />}
                    </Button>
                     <Button variant="default" size="icon" onClick={handleShare} disabled={isGenerating || !navigator.share}>
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Share2 className="h-4 w-4" />}
                    </Button>
                     <Button variant="default" size="icon" onClick={handleDownload} disabled={isGenerating}>
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4" />}
                    </Button>
                </div>
                 <div className="flex flex-1 items-center justify-end">
                     <Button variant="ghost" size="icon" onClick={() => window.close()}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            <main className="flex justify-center p-4 sm:p-8 bg-gray-300 print:bg-white print:p-0">
                <div id="print-content" className="w-full max-w-4xl bg-white p-6 sm:p-8 shadow-lg print:shadow-none" style={{ width: '210mm', minHeight: '297mm' }}>
                     <table className="w-full mb-6">
                        <tbody>
                            <tr>
                                <td style={{ width: '25%', verticalAlign: 'top' }}>
                                    <img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" style={{width: '60px', height: '60px'}} />
                                </td>
                                <td style={{ width: '75%', verticalAlign: 'top', textAlign: 'right' }}>
                                    <h2 className="text-xl font-bold text-black">{`${operator.firstName} ${operator.lastName}`}</h2>
                                    <p className="text-base text-gray-700">{`Riepilogo di ${format(currentMonth, 'MMMM yyyy', { locale: it })}`}</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="mb-4 text-sm">
                        <table className="w-full">
                           <tbody className="text-black">
                                <tr>
                                    <td className="py-1 font-semibold">GIORNI LAVORATI: <span className="font-normal">{monthlySummary.workedDays || 0}</span></td>
                                    <td className="py-1 text-right font-semibold">FERIE: <span className="font-normal">{finalFerieDays}</span></td>
                                </tr>
                                 <tr>
                                    <td className="py-1 font-semibold">ORE ORDINARIE: <span className="font-normal">{finalOrdinaryHours}</span></td>
                                    <td className="py-1 text-right font-semibold">ORE PERMESSI: <span className="font-normal">{finalPermessoHours}</span></td>
                                </tr>
                                <tr>
                                    <td className="py-1 font-semibold">ORE STRAORDINARIE: <span className="font-normal">{finalOvertimeHours}</span></td>
                                    <td className="py-1 text-right font-semibold">GIORNI MALATTIA: <span className="font-normal">{finalMalattiaDays}</span></td>
                                </tr>
                           </tbody>
                        </table>
                         <div className="border-t border-gray-300 mt-2 mb-2"></div>
                         <table className="w-full">
                           <tbody className="text-black">
                                <tr>
                                    <td className="py-1 font-semibold">
                                        {operator.salaryType === 'fixed' ? 'FISSO MENSILE' : 'COSTO ORDINARIE'}: <span className="font-normal">{ordinaryCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                                    </td>
                                    <td className="py-1 text-right font-semibold">COSTO STRAORDINARI: <span className="font-normal">{overtimeCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                </tr>
                                {ferieCost > 0 && (
                                     <tr>
                                        <td className="py-1 font-semibold" colSpan={2}>COSTO FERIE: <span className="font-normal">{ferieCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                    </tr>
                                )}
                                 {permessoCost > 0 && (
                                     <tr>
                                        <td className="py-1 font-semibold" colSpan={2}>COSTO PERMESSI: <span className="font-normal">{permessoCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                    </tr>
                                )}
                                {malattiaCost > 0 && (
                                     <tr>
                                        <td className="py-1 font-semibold" colSpan={2}>COSTO MALATTIA: <span className="font-normal">{malattiaCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                    </tr>
                                )}
                           </tbody>
                        </table>
                         <div className="text-right font-bold text-xl mt-2 border-t-2 border-black pt-1 text-black">
                             <span>TOTALE DOVUTO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-black mt-8 mb-2 border-b-2 border-black pb-1">Dettaglio Giornaliero</h3>
                    <div className="space-y-3">
                        {dailyDetails.length > 0 ? dailyDetails.map(detail => {
                             const dayOfWeek = format(detail.date, 'eeee', { locale: it });
                             const restOfDate = format(detail.date, 'dd MMMM', { locale: it });
                             const dateStr = `${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} ${restOfDate}`;

                            return (
                                <div key={detail.date.toISOString()} className="border-b border-gray-300 pb-2 mb-2 print:break-inside-avoid">
                                    <p className="text-black text-sm capitalize leading-tight">
                                        <span className="font-bold">{dateStr}</span>
                                    </p>
                                    {detail.note && <p className="text-black text-sm pl-1 leading-tight italic">"{detail.note.note}"</p>}
                                    
                                    {detail.makeupActivityFor && detail.makeupActivityFor.length > 0 && (
                                        <div className="my-1">
                                            <p className="text-purple-600 text-sm pl-1 leading-tight font-semibold">Recupero per: {detail.makeupActivityFor.join(', ')}</p>
                                            <p className="text-gray-600 text-xs pl-1 leading-tight italic">(Le ore di questo turno sono attribuite al giorno di recupero e non vengono conteggiate per questa data.)</p>
                                        </div>
                                    )}

                                    {detail.shift && detail.shift.allShifts ? (
                                        <>
                                            {detail.shift.allShifts.map((shiftBlock, idx) => {
                                                const timbratureString = shiftBlock.events.map(e => {
                                                    const originalTime = format(e.timestamp.toDate(), 'HH:mm');
                                                    let referenceTime = '';
                                                    if (e.type === 'entrata' && shiftBlock.calculationStart) {
                                                        referenceTime = `(${format(shiftBlock.calculationStart, 'HH:mm')})`;
                                                    } else if (e.type === 'uscita' && shiftBlock.calculationEnd) {
                                                        referenceTime = `(${format(shiftBlock.calculationEnd, 'HH:mm')})`;
                                                    }
                                                    const typeFormatted = e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ');
                                                    return `${typeFormatted}: ${originalTime} ${referenceTime}`.trim();
                                                }).join(' | ');

                                                return (
                                                    <div key={idx}>
                                                        <p className="text-black text-sm pl-1 leading-tight">{`Turno ${idx + 1}: ${timbratureString}`}</p>
                                                    </div>
                                                )
                                            })}
                                            <p className="text-black text-sm pl-1 leading-tight">{`Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`}</p>
                                        </>
                                    ) : (
                                       !detail.note && (
                                            <p className="text-black text-sm pl-1 leading-tight">
                                                {detail.status === 'mancata_timbratura' && 'Assente'}
                                                {detail.status === 'ferie' && 'Giorno di Ferie'}
                                                {detail.status === 'malattia' && 'Giorno di Malattia'}
                                                {detail.status === 'festa' && 'Giorno Festivo'}
                                                {detail.status === 'riposo' && 'Giorno di Riposo'}
                                            </p>
                                        )
                                    )}
                                </div>
                            )
                        }) : <p className="text-center text-gray-500 py-4">Nessun dato da mostrare.</p>}
                    </div>
                </div>
            </main>
        </div>
    );
}
