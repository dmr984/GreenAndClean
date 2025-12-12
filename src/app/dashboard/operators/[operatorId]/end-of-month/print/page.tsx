'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { Loader2, Printer, Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParams, useSearchParams } from 'next/navigation';
import { format, isValid, getDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, type MonthlySummary, type DailyDetail, calculateShiftDetails } from '@/lib/calculations';
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
    hourlyRate?: number;
    overtimeRate?: number;
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

const PrintPageContent = () => {
    const firestore = useFirestore();
    const params = useParams();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const operatorId = params.operatorId as string;

    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[] }>({ timbrature: [], requests: [] });
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
                const { startOfMonth, endOfMonth } = await import('date-fns');
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

                const [timbratureSnapshot, requestsSnapshot] = await Promise.all([
                    getDocs(timbratureQuery),
                    getDocs(requestsQuery)
                ]);

                const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)).filter(t => t.status === 'confermata');
                const requestsData = requestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request));

                setMonthlyData({ timbrature: timbratureData, requests: requestsData });

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
        if (typeof rate !== 'number') return '0,00';
        return rate.toLocaleString('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        });
    };

    const generatePdf = async (): Promise<{ blob: Blob, fileName: string } | null> => {
        if (!operator) return null;
        setIsGenerating(true);
    
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;
        const margin = 15;
        let y = 20;
    
        // Add custom font if needed
        doc.setFont('helvetica', 'normal');
    
        // 1. Header
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
    
        // 2. Summary Section
        const ordinaryCost = (monthlySummary.ordinaryHours || 0) * (operator.hourlyRate || 0);
        const overtimeCost = (monthlySummary.overtimeHours || 0) * (operator.overtimeRate || 0);
        const totalDue = ordinaryCost + overtimeCost;
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0,0,0);
        (doc as any).autoTable({
            startY: y,
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 0.5, textColor: [0,0,0], fontStyle: 'bold' },
            body: [
                [`GIORNI LAVORATI: ${(monthlySummary.workedDays || 0)}`, `FERIE: ${(monthlySummary.ferieDays || 0)}`],
                [`ORE ORDINARIE: ${(monthlySummary.ordinaryHours || 0)}`, `COSTO ORDINARIE (${formatFullRate(operator.hourlyRate)}€/h): ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`],
                [`ORE STRAORDINARIE: ${(monthlySummary.overtimeHours || 0)}`, `COSTO STRAORDINARIE (${formatFullRate(operator.overtimeRate || 0)}€/h): ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`],
                [`ORE PERMESSI: ${(monthlySummary.permessoHours || 0)}`, `GIORNI DI MALATTIA: ${(monthlySummary.malattiaDays || 0)}`],
            ],
            columnStyles: {
                0: { halign: 'left' },
                1: { halign: 'right' },
            }
        });
        y = (doc as any).lastAutoTable.finalY + 2;
    
        doc.setDrawColor(0,0,0);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`TOTALE DOVUTO: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, pageWidth - margin, y, { align: 'right' });
        y += 15;
    
        // 3. Daily Details Section
        doc.setFontSize(12);
        doc.setTextColor(0,0,0);
        doc.text("Dettaglio Giornaliero", margin, y);
        y += 5;
        doc.setLineWidth(0.2);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
    
        dailyDetails.filter(d => d.status !== 'riposo').forEach(detail => {
            if (y > pageHeight - 30) {
                doc.addPage();
                y = 20;
            }
    
            let line1 = '';
            let line2 = '';
            const dayOfWeek = format(detail.date, 'eeee', { locale: it });
            const restOfDate = format(detail.date, 'dd MMMM', { locale: it });
            const dateStr = `${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} ${restOfDate}`;
    
            if (detail.shift) {
                const timbratureStr = detail.shift.events.map(e => `${e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ')}: ${format(e.timestamp.toDate(), 'HH:mm')}`).join(' | ');
                line1 = `${dateStr} - Lavorato | Timbrature: ${timbratureStr}`;
                line2 = `Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`;
            } else {
                 let statusText = detail.status.charAt(0).toUpperCase() + detail.status.slice(1).replace(/_/g, ' ');
                 if(detail.status === 'festa') statusText = 'Giorno Festivo';
                 if(detail.status === 'mancata_timbratura') statusText = 'Mancata Timbratura';
                 line1 = `${dateStr} - ${statusText}`;
            }
    
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            const splitLine1 = doc.splitTextToSize(line1, pageWidth - margin * 2);
            doc.text(splitLine1, margin, y);
            y += (splitLine1.length * 4);
            
            if(line2) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(50, 50, 50);
                const splitLine2 = doc.splitTextToSize(line2, pageWidth - margin * 2 - 3); // Indent
                doc.text(splitLine2, margin + 3, y);
                y += (splitLine2.length * 4);
            }
    
            y += 2;
            doc.setLineWidth(0.1);
            doc.line(margin, y, pageWidth - margin, y);
            y += 6;
        });
    
        const blob = doc.output('blob');
        const fileName = `Riepilogo_${operator.username}_${format(currentMonth, 'MM-yyyy')}.pdf`;
    
        setIsGenerating(false);
        return { blob, fileName };
    };

    const handlePrint = async () => {
        window.print();
    };
    
    const handleDownload = async () => {
        const pdf = await generatePdf();
        if (!pdf) return;
        const url = URL.createObjectURL(pdf.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdf.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
    
    const ordinaryCost = (monthlySummary.ordinaryHours || 0) * (operator.hourlyRate || 0);
    const overtimeCost = (monthlySummary.overtimeHours || 0) * (operator.overtimeRate || 0);
    const totalDue = ordinaryCost + overtimeCost;
    
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
                                    <h2 className="text-lg font-bold text-black">{`${operator.firstName} ${operator.lastName}`}</h2>
                                    <p className="text-sm text-gray-700">{`Riepilogo di ${format(currentMonth, 'MMMM yyyy', { locale: it })}`}</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Summary Table */}
                    <div className="mb-4 text-xs">
                        <table className="w-full">
                           <tbody className="text-black font-bold">
                                <tr>
                                    <td className="py-1">GIORNI LAVORATI: <span className="font-mono">{(monthlySummary.workedDays || 0).toLocaleString('it-IT')}</span></td>
                                    <td className="py-1 text-right">FERIE: <span className="font-mono">{(monthlySummary.ferieDays || 0).toLocaleString('it-IT')}</span></td>
                                </tr>
                                <tr>
                                    <td className="py-1">ORE ORDINARIE: <span className="font-mono">{(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')}</span></td>
                                    <td className="py-1 text-right">COSTO ORDINARIE ({`${formatFullRate(operator.hourlyRate)}€/h`}): <span className="font-mono">{ordinaryCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                </tr>
                                <tr>
                                    <td className="py-1">ORE STRAORDINARIE: <span className="font-mono">{(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')}</span></td>
                                    <td className="py-1 text-right">COSTO STRAORDINARIE ({`${formatFullRate(operator.overtimeRate || 0)}€/h`}): <span className="font-mono">{overtimeCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                </tr>
                                 <tr>
                                    <td className="py-1">ORE PERMESSI: <span className="font-mono">{(monthlySummary.permessoHours || 0).toLocaleString('it-IT')}</span></td>
                                    <td className="py-1 text-right">GIORNI DI MALATTIA: <span className="font-mono">{(monthlySummary.malattiaDays || 0).toLocaleString('it-IT')}</span></td>
                                </tr>
                           </tbody>
                        </table>
                         <div className="text-right font-bold text-sm mt-2 border-t-2 border-black pt-1 text-black">
                             <span>TOTALE DOVUTO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                        </div>
                    </div>


                    {/* Daily Details */}
                    <h3 className="text-md font-bold text-black mt-8 mb-2 border-b-2 border-black pb-1">Dettaglio Giornaliero</h3>
                    <div className="space-y-2.5 text-xs">
                        {dailyDetails.length > 0 ? dailyDetails.filter(d => d.status !== 'riposo').map(detail => {
                             let line1 = '';
                             let line2 = '';
                             const dayOfWeek = format(detail.date, 'eeee', { locale: it });
                             const restOfDate = format(detail.date, 'dd MMMM', { locale: it });
                             const dateStr = `${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} ${restOfDate}`;

                            if (detail.shift) {
                                const timbratureStr = detail.shift.events.map(e => {
                                    const originalTime = format(e.timestamp.toDate(), 'HH:mm');
                                     let referenceTime = '';

                                    if (operator && (e.type === 'entrata' || e.type === 'uscita')) {
                                        const { calculationStart, calculationEnd } = calculateShiftDetails(detail.shift.events, operator.workSchedule[dayIndexToName[getDay(detail.date)]], e.ignoreContractualStart);
                                        if (e.type === 'entrata' && calculationStart && Math.abs(calculationStart.getTime() - e.timestamp.toDate().getTime()) > 1000) {
                                            referenceTime = `(${format(calculationStart, 'HH:mm')})`;
                                        } else if (e.type === 'uscita' && calculationEnd && Math.abs(calculationEnd.getTime() - e.timestamp.toDate().getTime()) > 1000) {
                                             referenceTime = `(${format(calculationEnd, 'HH:mm')})`;
                                        }
                                    }
                                    return `${e.type.replace('_', ' ')}: ${originalTime} ${referenceTime}`.trim()
                                }).join(' | ');
                                line1 = `${dateStr} - Lavorato | Timbrature: ${timbratureStr}`;
                                line2 = `Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`;
                            } else {
                                 let statusText = detail.status.charAt(0).toUpperCase() + detail.status.slice(1).replace(/_/g, ' ');
                                 if(detail.status === 'festa') statusText = 'Giorno Festivo';
                                 if(detail.status === 'mancata_timbratura') statusText = 'Mancata Timbratura';
                                 line1 = `${dateStr} - ${statusText}`;
                            }

                            return (
                                <div key={detail.date.toISOString()} className="border-b border-gray-300 pb-1.5 mb-1.5 print:break-inside-avoid">
                                    <p className="font-bold text-black text-[9px] capitalize leading-tight">
                                        {line1}
                                    </p>
                                    {line2 && <p className="text-gray-800 text-[8px] pl-1 leading-tight">{line2}</p>}
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
