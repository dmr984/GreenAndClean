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
import autoTable from 'jspdf-autotable';


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

    const generatePdf = async (): Promise<{ blob: Blob, fileName: string } | null> => {
        if (!operator) return null;
        setIsGenerating(true);
    
        const doc = new jsPDF();
        const img = new Image();
        img.src = "https://i.postimg.cc/GhwM2hg1/1764199658760.png";
        img.crossOrigin = "Anonymous";
        
        await new Promise(resolve => { img.onload = resolve; });
    
        // 1. Header
        doc.addImage(img, 'PNG', 15, 10, 20, 20);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${operator.firstName} ${operator.lastName}`, 195, 20, { align: 'right' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Riepilogo di ${format(currentMonth, 'MMMM yyyy', { locale: it })}`, 195, 26, { align: 'right' });
        
        // 2. Summary Table
        const ordinaryCost = (monthlySummary.ordinaryHours || 0) * (operator.hourlyRate || 0);
        const overtimeCost = (monthlySummary.overtimeHours || 0) * (operator.overtimeRate || 0);
        const totalDue = ordinaryCost + overtimeCost;
    
        const summaryBody = [
            [`GIORNI LAVORATI: ${(monthlySummary.workedDays || 0).toLocaleString('it-IT')}`, `FERIE: ${(monthlySummary.ferieDays || 0).toLocaleString('it-IT')}`],
            [`ORE ORDINARIE: ${(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')}`, `COSTO ORDINARIE (${(operator.hourlyRate || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}): ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`],
            [`ORE STRAORDINARIE: ${(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')}`, `COSTO STRAORDINARIE (${(operator.overtimeRate || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}): ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`],
            [`ORE PERMESSI: ${(monthlySummary.permessoHours || 0).toLocaleString('it-IT')}`, `GIORNI DI MALATTIA: ${(monthlySummary.malattiaDays || 0).toLocaleString('it-IT')}`]
        ];

        autoTable(doc, {
            body: summaryBody,
            startY: 40,
            theme: 'plain',
            styles: {
                fontSize: 9,
                cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
            },
            didParseCell: function (data) {
                // Set bold for labels and values
                data.cell.styles.fontStyle = 'bold';
            },
            columnStyles: {
                0: { halign: 'left' },
                1: { halign: 'right' }
            }
        });
    
        let finalY = (doc as any).lastAutoTable.finalY + 5;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`TOTALE DOVUTO: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, 195, finalY, { align: 'right' });

        // 3. Daily Details
        const dailyDetailStartY = finalY + 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("Dettaglio Giornaliero", 15, dailyDetailStartY);

        const dailyBody = dailyDetails.filter(d => d.status !== 'riposo').map(detail => {
            let line1 = '';
            let line2 = '';

            const dayOfWeek = format(detail.date, 'eeee', { locale: it });
            const restOfDate = format(detail.date, 'dd MMMM', { locale: it });
            
            if (detail.shift) {
                const timbratureStr = detail.shift.events.map(e => `${e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ')}: ${format(e.timestamp.toDate(), 'HH:mm')}`).join(' | ');
                line1 = `Lavorato | Timbrature: ${timbratureStr}`;
                line2 = `Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`;
            } else {
                 let statusText = detail.status.charAt(0).toUpperCase() + detail.status.slice(1).replace('_', ' ');
                 if(detail.status === 'festa') statusText = 'Giorno Festivo';
                 line1 = statusText;
            }

            return [
                { content: `${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} ${restOfDate}`, styles: { fontStyle: 'bold' } },
                { content: line1 },
                { content: line2 }
            ];
        });
        
         autoTable(doc, {
            startY: dailyDetailStartY + 5,
            body: dailyBody,
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 1.5, minCellHeight: 10 },
            columnStyles: { 0: { cellWidth: 35 } },
            didDrawCell: (data) => {
                 if (data.section === 'body' && data.row.index < dailyBody.length - 1) {
                    doc.setDrawColor(226, 232, 240); // tailwind gray-200
                    doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                }
            },
            willDrawCell: function (data) {
                if (data.section === 'body' && data.column.index > 0 && Array.isArray(data.row.raw)) {
                     const cellContent = (data.row.raw[data.column.index] as { content: string }).content;
                     if (cellContent) {
                         const startY = data.column.index === 1 ? data.cell.y + 4 : data.cell.y + 9;
                         doc.text(cellContent, data.cell.x + 1.5, startY);
                     }
                      return false; // Prevent default rendering for these columns
                }
            }
        });
    
        const blob = doc.output('blob');
        const fileName = `Riepilogo_${operator.username}_${format(currentMonth, 'MM-yyyy')}.pdf`;
    
        setIsGenerating(false);
        return { blob, fileName };
    };

    const handlePrint = () => {
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
        <div className="bg-white text-black min-h-screen">
             <header className="sticky top-0 z-10 flex h-16 items-center justify-center border-b bg-white px-4 no-print">
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

            <main className="flex justify-center p-4 sm:p-8">
                <div className="w-full max-w-4xl bg-white p-6 sm:p-8 print-area" style={{ width: '210mm', minHeight: '297mm' }}>
                    {/* Header */}
                     <table className="w-full mb-6">
                        <tbody>
                            <tr>
                                <td style={{ width: '25%' }}>
                                    <img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" style={{width: '60px', height: '60px'}} />
                                </td>
                                <td style={{ width: '75%', verticalAlign: 'top', textAlign: 'right' }}>
                                    <h2 className="text-lg font-bold">{`${operator.firstName} ${operator.lastName}`}</h2>
                                    <p className="text-sm text-gray-600">{`Riepilogo di ${format(currentMonth, 'MMMM yyyy', { locale: it })}`}</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Summary Table */}
                    <div className="mb-4">
                        <table className="w-full text-xs">
                            <tbody>
                                <tr>
                                    <td className="py-1.5"><span className="font-bold">GIORNI LAVORATI:</span> <span className="font-mono font-bold">{(monthlySummary.workedDays || 0).toLocaleString('it-IT')}</span></td>
                                    <td className="py-1.5 text-right"><span className="font-bold">FERIE:</span> <span className="font-mono font-bold">{(monthlySummary.ferieDays || 0).toLocaleString('it-IT')}</span></td>
                                </tr>
                                <tr>
                                    <td className="py-1.5"><span className="font-bold">ORE ORDINARIE:</span> <span className="font-mono font-bold">{(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')}</span></td>
                                    <td className="py-1.5 text-right"><span className="font-bold">COSTO ORDINARIE ({`${(operator.hourlyRate || 0).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}/h`}):</span> <span className="font-mono font-bold">{ordinaryCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                </tr>
                                <tr>
                                    <td className="py-1.5"><span className="font-bold">ORE STRAORDINARIE:</span> <span className="font-mono font-bold">{(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')}</span></td>
                                    <td className="py-1.5 text-right"><span className="font-bold">COSTO STRAORDINARIE ({`${(operator.overtimeRate || 0).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}/h`}):</span> <span className="font-mono font-bold">{overtimeCost.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></td>
                                </tr>
                                 <tr>
                                    <td className="py-1.5"><span className="font-bold">ORE PERMESSI:</span> <span className="font-mono font-bold">{(monthlySummary.permessoHours || 0).toLocaleString('it-IT')}</span></td>
                                    <td className="py-1.5 text-right"><span className="font-bold">GIORNI DI MALATTIA:</span> <span className="font-mono font-bold">{(monthlySummary.malattiaDays || 0).toLocaleString('it-IT')}</span></td>
                                </tr>
                            </tbody>
                        </table>
                         <div className="text-right font-bold text-sm mt-2 border-t border-black pt-1">
                             <span>TOTALE DOVUTO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                        </div>
                    </div>


                    {/* Daily Details */}
                    <h3 className="text-md font-bold mb-2 border-b border-black pb-1">Dettaglio Giornaliero</h3>
                    <div className="space-y-2 text-xs">
                        {dailyDetails.length > 0 ? dailyDetails.filter(d => d.status !== 'riposo').map(detail => {
                            let line1 = '';
                            let line2 = '';
                             const dayOfWeek = format(detail.date, 'eeee', { locale: it });
                             const restOfDate = format(detail.date, 'dd MMMM', { locale: it });
                             const dateStr = `${dayOfWeek} ${restOfDate}`;

                            if (detail.shift) {
                                const timbratureStr = detail.shift.events.map(e => `${e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ')}: ${format(e.timestamp.toDate(), 'HH:mm')}`).join(' | ');
                                line1 = `${dateStr} - Lavorato | Timbrature: ${timbratureStr}`;
                                line2 = `Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`;
                            } else {
                                 let statusText = detail.status.charAt(0).toUpperCase() + detail.status.slice(1).replace('_', ' ');
                                 if(detail.status === 'festa') statusText = 'Giorno Festivo';
                                 line1 = `${dateStr} - ${statusText}`;
                            }

                            return (
                                <div key={detail.date.toISOString()} className="border-b border-gray-200 pb-1.5 mb-1.5">
                                    <p className="text-[9px] capitalize">
                                        <span className="font-bold">{dayOfWeek}</span> {restOfDate} - {line1.split(' - ')[1]}
                                    </p>
                                    {line2 && <p className="text-gray-600 text-[9px]">{line2}</p>}
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
