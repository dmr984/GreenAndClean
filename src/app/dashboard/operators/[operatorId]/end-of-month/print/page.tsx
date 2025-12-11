'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, Printer, Download, Share2, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, set, parse, isValid } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, calculateShiftDetails, type DailyDetail, type MonthlySummary } from '@/lib/calculations';
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
    const router = useRouter();
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

        const fetchOperatorData = async () => {
            const opDoc = await getDoc(doc(firestore, 'app-users', operatorId));
            if (opDoc.exists()) {
                setOperator({ id: opDoc.id, ...opDoc.data() } as Operator);
            }
        };

        const fetchDataForMonth = async () => {
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
                const requestsData = requestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request));

                setMonthlyData({ timbrature: timbratureData, requests: requestsData });
            } catch (error) {
                console.error("Error fetching monthly data for print:", error);
                toast({ title: 'Errore Caricamento Dati', description: 'Impossibile caricare i dati per il report.', variant: 'destructive' });
            }
        };

        const loadAllData = async () => {
            setIsLoading(true);
            await fetchOperatorData();
            await fetchDataForMonth();
            setIsLoading(false);
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
        const font = 'Helvetica'; // Standard font
        const img = new (window as any).Image();
        img.src = "https://i.postimg.cc/GhwM2hg1/1764199658760.png";
        
        await new Promise(resolve => { img.onload = resolve; });
    
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
    
        // --- HEADER ---
        doc.addImage(img, 'PNG', margin, 10, 20, 20);
        
        doc.setFont(font, 'normal');
        doc.setFontSize(12);
        doc.text(`${operator.firstName} ${operator.lastName}`, pageWidth - margin, 15, { align: 'right' });
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Riepilogo di ${format(currentMonth, 'MMMM yyyy', { locale: it })}`, pageWidth - margin, 22, { align: 'right' });
    
        let startY = 40;
    
        // --- SUMMARY TABLE ---
        const summaryBody = [[
            { content: 'Giorni Lavorati\n' + (monthlySummary.workedDays || 0), styles: { halign: 'center', cellPadding: 2 } },
            { content: 'Ore Ordinarie\n' + (monthlySummary.ordinaryHours || 0).toLocaleString('it-IT'), styles: { halign: 'center', cellPadding: 2 } },
            { content: 'Ore Straordinarie\n' + (monthlySummary.overtimeHours || 0).toLocaleString('it-IT'), styles: { halign: 'center', cellPadding: 2 } },
            { content: 'Ferie (giorni)\n' + (monthlySummary.ferieDays || 0), styles: { halign: 'center', cellPadding: 2 } },
            { content: 'Permessi (ore)\n' + (monthlySummary.permessoHours || 0).toLocaleString('it-IT'), styles: { halign: 'center', cellPadding: 2 } },
            { content: 'Malattia (giorni)\n' + (monthlySummary.malattiaDays || 0), styles: { halign: 'center', cellPadding: 2 } },
        ]];
    
        (doc as any).autoTable({
            startY: startY,
            body: summaryBody,
            theme: 'grid',
            styles: { font: font, fontSize: 8, lineWidth: 0.1, lineColor: [200, 200, 200] },
        });
    
        startY = (doc as any).lastAutoTable.finalY + 10;
    
        // --- DAILY DETAILS ---
        doc.setFontSize(11);
        doc.setFont(font, 'bold');
        doc.text("Dettaglio Giornaliero", margin, startY);
        startY += 8;
    
        dailyDetails.filter(d => d.status !== 'riposo').forEach(detail => {
            if (startY > pageHeight - 20) { // Add new page if content overflows
                doc.addPage();
                startY = margin;
            }
    
            let line1 = `${format(detail.date, 'eeee dd MMMM', { locale: it })} - ${detail.status.charAt(0).toUpperCase() + detail.status.slice(1)}`;
            let line2 = '';
    
            if (detail.shift) {
                const timbratureStr = detail.shift.events.map(e => `${e.type.charAt(0).toUpperCase() + e.type.slice(1)}: ${format(e.timestamp.toDate(), 'HH:mm')}`).join(' | ');
                line1 += ` | Timbrature: ${timbratureStr}`;
                line2 = `Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`;
            }
    
            doc.setFontSize(9);
            doc.setFont(font, 'normal');
            doc.text(line1, margin, startY);
            startY += 5;
    
            if (line2) {
                doc.setFontSize(8);
                doc.setTextColor(80);
                doc.text(line2, margin, startY);
                startY += 5;
            }
            
            doc.setDrawColor(230, 230, 230);
            doc.line(margin, startY, pageWidth - margin, startY);
            startY += 5;
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
            console.error('Error sharing:', error);
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
        <div className="bg-muted/40 min-h-screen">
             <header className="sticky top-0 z-10 flex h-16 items-center justify-center border-b bg-background px-4 shadow-sm no-print">
                 <div className="flex-1"></div>
                 <div className="flex flex-1 items-center justify-center gap-2">
                     <Button variant="default" size="sm" onClick={handlePrint} disabled={isGenerating}>
                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Printer className="mr-2 h-4 w-4" />}
                        Stampa
                    </Button>
                     <Button variant="outline" size="sm" onClick={handleShare} disabled={isGenerating || !navigator.share}>
                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Share2 className="mr-2 h-4 w-4" />}
                        Condividi
                    </Button>
                     <Button variant="outline" size="sm" onClick={handleDownload} disabled={isGenerating}>
                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}
                        Scarica
                    </Button>
                </div>
                 <div className="flex flex-1 items-center justify-end">
                     <Button variant="ghost" size="icon" onClick={() => window.close()}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            <main className="flex justify-center p-4 sm:p-8">
                <div className="w-full max-w-4xl bg-background p-8 shadow-lg print-area">
                    {/* Header */}
                    <table className="w-full mb-6">
                        <tbody>
                            <tr>
                                <td style={{ width: '25%' }}>
                                    <img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" style={{width: '60px', height: '60px'}} />
                                </td>
                                <td style={{ width: '75%' }} className="text-right align-top">
                                    <h2 className="text-lg font-bold">{`${operator.firstName} ${operator.lastName}`}</h2>
                                    <p className="text-sm text-muted-foreground">{`Riepilogo di ${format(currentMonth, 'MMMM yyyy', { locale: it })}`}</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Summary Table */}
                    <table className="w-full text-xs border border-collapse mb-8">
                        <thead>
                            <tr className="border-b">
                                <th className="border p-1 font-semibold text-center">Giorni Lavorati</th>
                                <th className="border p-1 font-semibold text-center">Ore Ordinarie</th>
                                <th className="border p-1 font-semibold text-center">Ore Straordinarie</th>
                                <th className="border p-1 font-semibold text-center">Ferie (giorni)</th>
                                <th className="border p-1 font-semibold text-center">Permessi (ore)</th>
                                <th className="border p-1 font-semibold text-center">Malattia (giorni)</th>
                            </tr>
                        </thead>
                         <tbody>
                            <tr>
                                <td className="border p-2 text-center">{monthlySummary.workedDays || 0}</td>
                                <td className="border p-2 text-center">{(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')}</td>
                                <td className="border p-2 text-center">{(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')}</td>
                                <td className="border p-2 text-center">{monthlySummary.ferieDays || 0}</td>
                                <td className="border p-2 text-center">{(monthlySummary.permessoHours || 0).toLocaleString('it-IT')}</td>
                                <td className="border p-2 text-center">{monthlySummary.malattiaDays || 0}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Daily Details */}
                    <h3 className="text-md font-bold mb-4">Dettaglio Giornaliero</h3>
                    <div className="space-y-3 text-xs">
                        {dailyDetails.length > 0 ? dailyDetails.filter(d => d.status !== 'riposo').map(detail => {
                            let line1 = `${format(detail.date, 'eeee dd MMMM', { locale: it })} - ${detail.status.charAt(0).toUpperCase() + detail.status.slice(1)}`;
                            let line2 = '';
                             if (detail.shift) {
                                const timbratureStr = detail.shift.events.map(e => `${e.type.charAt(0).toUpperCase() + e.type.slice(1)}: ${format(e.timestamp.toDate(), 'HH:mm')}`).join(' | ');
                                line1 += ` | Timbrature: ${timbratureStr}`;
                                line2 = `Ore Previste: ${detail.shift.contractualHours}h | Ore Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h | Permesso: ${detail.shift.permissionHours}h`;
                            }
                            return (
                                <div key={detail.date.toISOString()} className="border-b pb-2">
                                    <p className="font-semibold">{line1}</p>
                                    {line2 && <p className="text-muted-foreground">{line2}</p>}
                                </div>
                            )
                        }) : <p className="text-center text-muted-foreground py-4">Nessun dato da mostrare.</p>}
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
