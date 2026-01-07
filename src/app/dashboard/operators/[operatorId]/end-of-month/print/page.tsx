'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { Loader2, Printer, Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParams, useSearchParams } from 'next/navigation';
import { format, isValid, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, type MonthlySummary, type DailyDetail, calculateShiftDetails, calculateHours } from '@/lib/calculations';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


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
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
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
}

const PrintPageContent = () => {
    const firestore = useFirestore();
    const params = useParams();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const operatorId = params.operatorId as string;

    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[], dailyNotes: DailyNote[] }>({ timbrature: [], requests: [], dailyNotes: [] });
    const [manualTotals, setManualTotals] = useState({ ferie: -1, permessi: -1, malattia: -1 });
    const [includeHolidayPay, setIncludeHolidayPay] = useState(true);

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
        const holidayPay = searchParams.get('holidayPay');

        setManualTotals({
            ferie: ferie ? parseFloat(ferie) : -1,
            permessi: permessi ? parseFloat(permessi) : -1,
            malattia: malattia ? parseFloat(malattia) : -1,
        });

        if (holidayPay !== null) {
            setIncludeHolidayPay(holidayPay === 'true');
        }


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
                const monthId = format(currentMonth, 'yyyy-MM');


                const timbratureQuery = query(
                    collection(firestore, `app-users/${operatorId}/timbrature`),
                    where('timestamp', '>=', monthStart),
                    where('timestamp', '<=', monthEnd)
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

                const [timbratureSnapshot, requestsSnapshot, notesSnapshot] = await Promise.all([
                    getDocs(timbratureQuery),
                    getDocs(requestsQuery),
                    getDocs(notesSnapshot),
                ]);

                const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)).filter(t => t.status === 'confermata');
                const requestsData = requestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request));
                const notesData = notesSnapshot.docs.map(d => ({ date: d.id, ...d.data() } as DailyNote));
                
                setMonthlyData({ timbrature: timbratureData, requests: requestsData, dailyNotes: notesData });

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

    const formatFullRate = (rate?: number) => {
        if (typeof rate !== 'number') return '0,0000';
        return rate.toLocaleString('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        });
    };
    
    const finalOrdinaryHours = monthlySummary.ordinaryHours ?? 0;
    const finalOvertimeHours = monthlySummary.overtimeHours ?? 0;
    const finalFerieDays = manualTotals.ferie !== -1 ? manualTotals.ferie : (monthlySummary.ferieDays ?? 0);
    const finalPermessoHours = manualTotals.permessi !== -1 ? manualTotals.permessi : (monthlySummary.permessoHours ?? 0);
    const finalMalattiaDays = manualTotals.malattia !== -1 ? manualTotals.malattia : (monthlySummary.malattiaDays ?? 0);
    
    const overtimeCost = finalOvertimeHours * (operator?.overtimeRate || 0);
    const holidayCost = (monthlySummary.holidayHoursPayable || 0) * (operator?.hourlyRate || 0);
    let totalDue: number;
    let ordinaryCost: number;

    if (operator?.salaryType === 'fixed') {
        ordinaryCost = operator.fixedSalary || 0;
        totalDue = ordinaryCost + overtimeCost;
    } else {
        ordinaryCost = finalOrdinaryHours * (operator?.hourlyRate || 0);
        totalDue = ordinaryCost + overtimeCost;
         if (includeHolidayPay) {
            totalDue += holidayCost;
        }
    }


    const generatePdf = async (): Promise<{ blob: Blob, fileName: string } | null> => {
        if (!operator) return null;
        setIsGenerating(true);
    
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;
        const margin = 15;
        let y = 20;
    
        doc.setFont('helvetica', 'normal');
    
        const addHeader = async () => {
            try {
                const img = new Image();
                img.src = "https://i.postimg.cc/GhwM2hg1/1764199658760.png";
                img.crossOrigin = "Anonymous";
                await new Promise((resolve, reject) => { 
                    img.onload = resolve;
                    img.onerror = reject;
                });
                doc.addImage(img, 'PNG', margin, y - 5, 20, 20);
            } catch (e) {
                console.error("Could not load image for PDF header", e);
            }
    
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`${operator.firstName} ${operator.lastName}`, pageWidth - margin, y, { align: 'right' });
            y += 7;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(`Riepilogo di ${format(currentMonth, 'MMMM yyyy', { locale: it })}`, pageWidth - margin, y, { align: 'right' });
        };
    
        await addHeader();
        y += 15;
    
        let summaryBody: (string | { content: string, styles: { halign: 'right' } })[][] = [
            [`GIORNI LAVORATI: ${(monthlySummary.workedDays || 0)}`, { content: `FERIE: ${finalFerieDays}`, styles: { halign: 'right' }} ],
            [`ORE ORDINARIE: ${finalOrdinaryHours}`, { content: `ORE PERMESSI: ${finalPermessoHours}`, styles: { halign: 'right' }}],
            [`ORE STRAORDINARIE: ${finalOvertimeHours}`, { content: `GIORNI MALATTIA: ${finalMalattiaDays}`, styles: { halign: 'right' }}],
        ];

        let financialSummary: (string | { content: string, styles: { halign: 'right' } })[][] = [];
        
        let costLabel = "COSTO ORDINARIE";
        let costValue = ordinaryCost;

        if (operator.salaryType === 'fixed') {
            costLabel = "FISSO MENSILE";
            costValue = operator.fixedSalary || 0;
        }

        financialSummary.push([`${costLabel}: ${costValue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, { content: `COSTO STRAORDINARI: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, styles: { halign: 'right' }}]);
        
        if (includeHolidayPay && holidayCost > 0) {
            financialSummary.push([`COSTO FERIE: ${holidayCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, { content: ``, styles: { halign: 'right' } }]);
        }


        (doc as any).autoTable({
            startY: y,
            theme: 'plain',
            body: summaryBody,
            styles: { fontSize: 11, textColor: [0, 0, 0] },
        });
        y = (doc as any).lastAutoTable.finalY;

        y += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, y, pageWidth - margin, y);
        y += 2;

        (doc as any).autoTable({
            startY: y,
            theme: 'plain',
            body: financialSummary,
            styles: { fontSize: 11, textColor: [0, 0, 0] },
        });

        y = (doc as any).lastAutoTable.finalY;

        y += 2;
        doc.setDrawColor(0,0,0);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`TOTALE DOVUTO: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, pageWidth - margin, y, { align: 'right' });
        y += 15;
    
        doc.setFontSize(16);
        doc.setTextColor(0,0,0);
        doc.text("Dettaglio Giornaliero", margin, y);
        y += 5;
        doc.setLineWidth(0.2);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
    
        dailyDetails.forEach(detail => {
            if (y > pageHeight - 30) {
                doc.addPage();
                y = 20;
            }
    
            const dayOfWeek = format(detail.date, 'eeee', { locale: it });
            const restOfDate = format(detail.date, 'dd MMMM', { locale: it });
            const dateStr = `${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} ${restOfDate}`;
            
    
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(dateStr, margin, y);
            y += 5;
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0,0,0);

            if (detail.note) {
                doc.setFont('helvetica', 'italic');
                const splitNote = doc.splitTextToSize(`"${detail.note}"`, pageWidth - margin * 2);
                doc.text(splitNote, margin, y);
                y += (splitNote.length * 5);
            }

            if (detail.shift && detail.shift.allShifts) {
                detail.shift.allShifts.forEach((shiftBlock, idx) => {
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

                    doc.text(`Turno ${idx + 1}: ${timbratureString}`, margin, y);
                    y+= 5;
                });
                
                const line2 = `Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`;
                const splitLine2 = doc.splitTextToSize(line2, pageWidth - margin * 2 - 3);
                doc.text(splitLine2, margin, y);
                y += (splitLine2.length * 5);

            } else if (!detail.note) {
                 let statusText = '';
                 switch (detail.status) {
                    case 'mancata_timbratura': statusText = 'Assente'; break;
                    case 'ferie': statusText = 'Giorno di Ferie'; break;
                    case 'malattia': statusText = 'Giorno di Malattia'; break;
                    case 'festa': statusText = 'Giorno Festivo'; break;
                    case 'riposo': statusText = 'Giorno di Riposo'; break;
                 }
                 
                 doc.text(statusText, margin, y);
                 y += 5;
            }
    
            y += 2;
            doc.setLineWidth(0.1);
            doc.line(margin, y, pageWidth - margin, y);
            y += 6;
        });
    
        const blob = doc.output('blob');
        const fileName = `${operator.lastName}_${operator.firstName}_${format(currentMonth, 'MMMM_yyyy', { locale: it })}.pdf`;
    
        setIsGenerating(false);
        return { blob, fileName };
    };

    const handlePrint = () => {
        window.print();
    };
    
    const handleDownload = async () => {
        const pdf = await generatePdf();
        if (!pdf) return;

        // Create an anchor element and trigger the download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(pdf.blob);
        a.download = pdf.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    };

    const handleShare = async () => {
        const pdf = await generatePdf();
        if (!pdf || !navigator.share) {
            toast({ title: 'Condivisione non supportata', description: 'Il tuo browser non supporta la condivisione di file.', variant: 'destructive' });
            return;
        }

        const file = new File([pdf.blob], pdf.fileName, { type: 'application/pdf' });
        try {
            await navigator.share({
                title: `Riepilogo ${operator?.firstName} ${operator?.lastName}`,
                text: `Ecco il riepilogo per ${format(currentMonth, 'MMMM yyyy')}.`,
                files: [file],
            });
        } catch (error) {
            if ((error as DOMException).name !== 'AbortError') {
                 toast({ title: 'Errore Condivisione', description: 'Impossibile condividere il file.', variant: 'destructive' });
            }
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
                    {/* Header */}
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

                    {/* Summary Table */}
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
                                {includeHolidayPay && holidayCost > 0 && (
                                     <tr>
                                        <td className="py-1 font-semibold" colSpan={2}>COSTO FERIE: <span className="font-normal">{holidayCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                    </tr>
                                )}
                           </tbody>
                        </table>
                         <div className="text-right font-bold text-xl mt-2 border-t-2 border-black pt-1 text-black">
                             <span>TOTALE DOVUTO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                        </div>
                    </div>


                    {/* Daily Details */}
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
                                    {detail.note && <p className="text-black text-sm pl-1 leading-tight italic">"{detail.note}"</p>}

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
                                                    <p key={idx} className="text-black text-sm pl-1 leading-tight">{`Turno ${idx + 1}: ${timbratureString}`}</p>
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

export default function PrintPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        }>
            <PrintPageContent />
        </Suspense>
    );
}
