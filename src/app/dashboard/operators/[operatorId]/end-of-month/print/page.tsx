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
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
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
        const img = new Image();
        img.src = "https://i.postimg.cc/GhwM2hg1/1764199658760.png";
        
        // Wait for image to load to prevent jsPDF errors
        await new Promise(resolve => { img.onload = resolve; });

        // --- HEADER ---
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.addImage(img, 'PNG', 15, 10, 30, 30);
        doc.setFont(font, 'bold');
        doc.setFontSize(16);
        doc.text("SERVECO SRL", pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont(font, 'normal');
        doc.text("Sede Legale: Via Francesco Cilea, 21 - 84043 Agropoli (SA)", pageWidth / 2, 26, { align: 'center' });
        doc.text("P.IVA: 05244990658", pageWidth / 2, 31, { align: 'center' });

        doc.setLineWidth(0.5);
        doc.line(15, 45, pageWidth - 15, 45);

        // --- OPERATOR INFO ---
        doc.setFont(font, 'bold');
        doc.setFontSize(12);
        doc.text("RIEPILOGO MENSILE", pageWidth / 2, 55, { align: 'center' });

        doc.setFont(font, 'bold');
        doc.setFontSize(10);
        doc.text("OPERATORE:", 15, 65);
        doc.setFont(font, 'normal');
        doc.text(`${operator.firstName.toUpperCase()} ${operator.lastName.toUpperCase()} (COD: ${operator.username})`, 50, 65);

        doc.setFont(font, 'bold');
        doc.text("MESE:", 15, 72);
        doc.setFont(font, 'normal');
        doc.text(format(currentMonth, 'MMMM yyyy', { locale: it }).toUpperCase(), 50, 72);
        
        // --- SUMMARY TABLE ---
        const summaryData = [
            ["GIORNI LAVORATI", monthlySummary.workedDays || 0],
            ["ORE ORDINARIE", (monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')],
            ["ORE STRAORD.", (monthlySummary.overtimeHours || 0).toLocaleString('it-IT')],
            ["FERIE (giorni)", monthlySummary.ferieDays || 0],
            ["PERMESSI (ore)", (monthlySummary.permessoHours || 0).toLocaleString('it-IT')],
            ["MALATTIA (giorni)", monthlySummary.malattiaDays || 0]
        ];

        (doc as any).autoTable({
            startY: 80,
            head: [['RIEPILOGO', '']],
            headStyles: { fillColor: [22, 160, 133], halign: 'center' },
            body: summaryData,
            theme: 'grid',
            styles: { font: font, fontSize: 8 },
            columnStyles: { 0: { fontStyle: 'bold' } }
        });

        // --- DAILY DETAILS TABLE ---
        let finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFont(font, 'bold');
        doc.setFontSize(12);
        doc.text("DETTAGLIO GIORNALIERO", 15, finalY);
        finalY += 5;

        const dailyBody = dailyDetails
            .filter(d => d.status !== 'riposo')
            .map(detail => {
                let statusText = '';
                let hoursDetails = '';

                switch(detail.status) {
                    case 'lavorato':
                        statusText = "Lavorato";
                        if (detail.shift) {
                            hoursDetails = `Ord: ${detail.shift.ordinaryHours}h | Straord: ${detail.shift.overtimeHours}h | Perm: ${detail.shift.permissionHours}h`;
                        }
                        break;
                    case 'ferie':
                        statusText = "Ferie";
                        break;
                    case 'malattia':
                        statusText = "Malattia";
                        break;
                    case 'festa':
                        statusText = "Festivo";
                        break;
                    case 'mancata_timbratura':
                        statusText = "Mancata Timbratura";
                        break;
                }
                const dateStr = format(detail.date, 'eee dd/MM/yyyy', { locale: it });
                return [dateStr, statusText, hoursDetails];
            });

        (doc as any).autoTable({
            startY: finalY,
            head: [['Data', 'Stato', 'Dettaglio Ore']],
            body: dailyBody,
            theme: 'grid',
            styles: { font: font, fontSize: 8 },
            headStyles: { fillColor: [44, 62, 80] },
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
            // Don't show toast for abort error
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
                     <table className="w-full mb-6">
                        <tbody>
                            <tr>
                                <td>
                                    <img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" style={{width: '80px', height: '80px'}} />
                                </td>
                                <td className="text-center align-middle">
                                    <h1 className="text-2xl font-bold">SERVECO SRL</h1>
                                    <p className="text-sm text-muted-foreground">Sede Legale: Via Francesco Cilea, 21 - 84043 Agropoli (SA)</p>
                                    <p className="text-sm text-muted-foreground">P.IVA: 05244990658</p>
                                </td>
                                <td style={{width: '80px'}}></td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="border-t my-4"></div>

                    {/* Operator Info */}
                    <table className="w-full mb-6 text-sm">
                        <tbody>
                            <tr>
                                <td className="font-bold pr-2">OPERATORE:</td>
                                <td>{`${operator.firstName} ${operator.lastName} (COD: ${operator.username})`}</td>
                                <td className="font-bold pr-2 text-right">MESE:</td>
                                <td className="text-right">{format(currentMonth, 'MMMM yyyy', { locale: it })}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div className="border-t my-4"></div>

                    {/* Summary */}
                    <h2 className="text-lg font-semibold mb-2 text-center">RIEPILOGO GENERALE</h2>
                     <table className="w-full text-sm mb-8">
                        <thead>
                            <tr className="border-b">
                                <th className="text-center py-2 font-semibold">GIORNI LAVORATI</th>
                                <th className="text-center py-2 font-semibold">ORE ORDINARIE</th>
                                <th className="text-center py-2 font-semibold">ORE STRAORD.</th>
                                <th className="text-center py-2 font-semibold">FERIE (gg)</th>
                                <th className="text-center py-2 font-semibold">PERMESSI (h)</th>
                                <th className="text-center py-2 font-semibold">MALATTIA (gg)</th>
                            </tr>
                        </thead>
                         <tbody>
                            <tr>
                                <td className="py-2 text-center">{monthlySummary.workedDays || 0}</td>
                                <td className="py-2 text-center">{(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')}</td>
                                <td className="py-2 text-center">{(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')}</td>
                                <td className="py-2 text-center">{monthlySummary.ferieDays || 0}</td>
                                <td className="py-2 text-center">{(monthlySummary.permessoHours || 0).toLocaleString('it-IT')}</td>
                                <td className="py-2 text-center">{monthlySummary.malattiaDays || 0}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                     <div className="border-t my-4"></div>

                    {/* Daily Details */}
                    <h2 className="text-lg font-semibold mb-2 text-center">DETTAGLIO GIORNALIERO</h2>
                    <div className="space-y-4">
                        {dailyDetails.length > 0 ? dailyDetails.filter(d => d.status !== 'riposo').map(detail => {
                             const isSunday = getDay(detail.date) === 0;
                             let statusIcon = null;
                             let statusText = '';
                             switch(detail.status) {
                                 case 'lavorato': statusIcon = <Briefcase className="h-4 w-4 text-blue-500" />; statusText = 'Lavorato'; break;
                                 case 'ferie': statusIcon = <Plane className="h-4 w-4 text-green-500" />; statusText = 'Ferie'; break;
                                 case 'malattia': statusIcon = <Stethoscope className="h-4 w-4 text-red-500" />; statusText = 'Malattia'; break;
                                 case 'festa': statusIcon = <Briefcase className="h-4 w-4 text-purple-500" />; statusText = 'Festivo'; break;
                                 case 'mancata_timbratura': statusIcon = <AlertTriangle className="h-4 w-4 text-yellow-500" />; statusText = 'Mancata Timbratura'; break;
                             }

                            return (
                                <div key={detail.date.toISOString()} className={cn("text-xs", isSunday && "text-red-600")}>
                                     <div className="grid grid-cols-2 gap-4">
                                        <div className="font-bold capitalize flex items-center gap-2">{statusIcon} {format(detail.date, 'eeee dd MMMM', { locale: it })}</div>
                                        <div className="text-right text-muted-foreground">
                                             {detail.shift?.events.map(e => {
                                                  const time = format(e.timestamp.toDate(), 'HH:mm');
                                                  return `${e.type.charAt(0).toUpperCase()}: ${time}`;
                                             }).join(' | ')}
                                        </div>
                                    </div>
                                    {detail.shift && (
                                        <div className="grid grid-cols-4 gap-4 mt-1 pl-6 text-center">
                                            <div><span className="font-semibold">Previste:</span> {detail.shift.contractualHours}h</div>
                                            <div><span className="font-semibold">Ordinarie:</span> {detail.shift.ordinaryHours}h</div>
                                            <div><span className="font-semibold">Straord:</span> {detail.shift.overtimeHours}h</div>
                                            <div><span className="font-semibold">Permesso:</span> {detail.shift.permissionHours}h</div>
                                        </div>
                                    )}
                                    <div className="border-t my-2"></div>
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
