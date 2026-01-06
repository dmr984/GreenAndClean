// src/app/dashboard/daily-summary/print/page.tsx
'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, Timestamp, getDocs, onSnapshot } from 'firebase/firestore';
import { Loader2, Printer, Download, Share2, X, User, Briefcase, Plane, Stethoscope, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';
import { format, startOfDay, endOfDay, isValid, startOfMonth, isWithinInterval } from 'date-fns';
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
    overtimeCalculation?: 'hourly' | 'half_hourly';
};

const PrintPageContent = () => {
    const firestore = useFirestore();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [operators, setOperators] = useState<Operator[]>([]);
    const [dailyData, setDailyData] = useState<Map<string, DailyDetail>>(new Map());
    const [monthlyCumulative, setMonthlyCumulative] = useState<Map<string, { ordinary: number, overtime: number, leave: number }>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        const date = searchParams.get('date'); // YYYY-MM-DD
        if (date) {
            const [year, month, day] = date.split('-').map(Number);
            const parsedDate = new Date(Date.UTC(year, month - 1, day));
            if (isValid(parsedDate)) {
                setSelectedDate(parsedDate);
            }
        } else {
            setSelectedDate(new Date());
        }
    }, [searchParams]);

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


    useEffect(() => {
        const fetchDataForDay = async (date: Date) => {
            if (!firestore || operators.length === 0) {
                 if (operators.length > 0) setIsLoading(false);
                 return;
            };
            setIsLoading(true);

            const dayStart = startOfDay(date);
            const dayEnd = endOfDay(date);
            const monthStart = startOfMonth(date);

            try {
                const promises = operators.map(async (op) => {
                    const timbratureQuery = query(
                        collection(firestore, `app-users/${op.id}/timbrature`),
                        where('timestamp', '>=', monthStart),
                        where('timestamp', '<=', dayEnd)
                    );
                    const requestsQuery = query(
                        collection(firestore, `app-users/${op.id}/requests`),
                        where('status', '==', 'approvato')
                    );
                    const [timbratureSnap, requestsSnap] = await Promise.all([
                        getDocs(timbratureQuery),
                        getDocs(requestsQuery),
                    ]);
                    const timbratureData = timbratureSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                    const requestsData = requestsSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                    const { dailyDetails: monthDetails } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData });
                    const cumulative = monthDetails
                        .filter(d => d.date <= dayStart)
                        .reduce((acc, d) => {
                            acc.ordinary += d.shift?.ordinaryHours || 0;
                            acc.overtime += d.shift?.overtimeHours || 0;
                            acc.leave += d.shift?.permissionHours || 0;
                            return acc;
                        }, { ordinary: 0, overtime: 0, leave: 0 });
                    const dayDetail = monthDetails.find(d => isWithinInterval(dayStart, { start: startOfDay(d.date), end: endOfDay(d.date) }));
                    return { opId: op.id, dayDetail, cumulative };
                });

                const results = await Promise.all(promises);
                const newDailyData = new Map<string, DailyDetail>();
                const newMonthlyCumulative = new Map<string, { ordinary: number, overtime: number, leave: number }>();
                results.forEach(({ opId, dayDetail, cumulative }) => {
                    if (dayDetail) newDailyData.set(opId, dayDetail);
                    if (cumulative) newMonthlyCumulative.set(opId, cumulative);
                });
                setDailyData(newDailyData);
                setMonthlyCumulative(newMonthlyCumulative);
            } catch (error) {
                console.error("Error fetching daily summary data for print:", error);
                toast({ title: 'Errore', description: 'Impossibile caricare i dati per il report.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        if (selectedDate && operators.length > 0) {
            fetchDataForDay(selectedDate);
        } else if (!selectedDate) {
            setIsLoading(false);
        }
    }, [selectedDate, operators, firestore, toast]);

    
    const generatePdf = useCallback(async (): Promise<{ blob: Blob; fileName: string } | null> => {
        setIsGenerating(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            if (!selectedDate || !document) return null;

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageHeight = doc.internal.pageSize.height;
            const pageWidth = doc.internal.pageSize.width;
            const margin = 15;
            let y = 20;

            const addHeader = (isFirstPage: boolean) => {
                 if (isFirstPage) {
                    try {
                        const img = new Image();
                        img.src = "https://i.postimg.cc/GhwM2hg1/1764199658760.png";
                        img.crossOrigin = "Anonymous";
                        doc.addImage(img, 'PNG', margin, y - 5, 20, 20);
                    } catch (e) {
                        console.error("Could not add image to PDF", e);
                    }

                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.text("Report Giornaliero", pageWidth - margin, y, { align: 'right' });
                    y += 7;
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100);
                    const dateStr = format(selectedDate, 'eeee, dd MMMM yyyy', { locale: it });
                    doc.text(dateStr.charAt(0).toUpperCase() + dateStr.slice(1), pageWidth - margin, y, { align: 'right' });
                    y += 15;
                }
            };

            addHeader(true);
            
            operators.forEach((op, index) => {
                const detail = dailyData.get(op.id);
                const cumulative = monthlyCumulative.get(op.id);

                if (!detail) return;
                
                const blockHeight = 30; // Estimated height for one operator block
                if (y > pageHeight - blockHeight) {
                    doc.addPage();
                    y = 20;
                    addHeader(false); 
                }

                // Operator Name
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`${op.firstName} ${op.lastName}`, margin, y);
                y += 6;

                // Shift Details or Status
                doc.setFontSize(11);
                doc.setFont('helvetica', 'normal');

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
                        y += 6;
                    });


                    const detailGiorno = `Dettaglio Giorno: Ore Ordinarie: ${detail.shift.ordinaryHours || 0}h, Straordinari: ${detail.shift.overtimeHours || 0}h, Permessi: ${detail.shift.permissionHours || 0}h`;
                     doc.text(detailGiorno, margin, y);
                     y += 6;
                } else if(detail) {
                     let statusText = '';
                    switch (detail.status) {
                        case 'mancata_timbratura': statusText = 'Assente'; break;
                        case 'ferie': statusText = 'Giorno di Ferie'; break;
                        case 'malattia': statusText = 'Giorno di Malattia'; break;
                        case 'riposo': statusText = 'Giorno non lavorativo'; break;
                        case 'festa': statusText = 'Giorno Festivo'; break;
                    }
                    if (statusText) {
                        doc.text(statusText, margin, y);
                        y += 6;
                    }
                }
                
                // Monthly Cumulative
                const statoMensile = `Stato Mensile: Cum. Ordinarie: ${cumulative?.ordinary || 0}h, Cum. Straordinari: ${cumulative?.overtime || 0}h, Cum. Permessi: ${cumulative?.leave || 0}h`;
                doc.text(statoMensile, margin, y);
                y += 10;
            });


            const blob = doc.output('blob');
            const fileName = `Report_Giornaliero_${format(selectedDate, 'yyyy-MM-dd')}.pdf`;

            return { blob, fileName };
        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({ title: 'Errore PDF', description: 'Impossibile generare il PDF.', variant: 'destructive'});
            return null;
        } finally {
            setIsGenerating(false);
        }
    }, [selectedDate, operators, dailyData, monthlyCumulative, toast]);

    const handlePrint = () => {
        window.print();
    };

    const handleDownload = async () => {
        const pdf = await generatePdf();
        if (!pdf) return;

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
                title: `Report Giornaliero - ${selectedDate ? format(selectedDate, 'PPP', { locale: it }) : ''}`,
                text: `Report giornaliero per il ${selectedDate ? format(selectedDate, 'PPP', { locale: it }) : ''}`,
                files: [file],
            });
        } catch (error) {
            if ((error as DOMException).name !== 'AbortError') {
                 toast({ title: 'Errore Condivisione', description: 'Impossibile condividere il file.', variant: 'destructive' });
            }
        }
    };


    if (isLoading || !selectedDate) {
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
                     <Button variant="default" size="icon" onClick={handlePrint} disabled={isGenerating}>{isGenerating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Printer className="h-4 w-4" />}</Button>
                     <Button variant="default" size="icon" onClick={handleShare} disabled={isGenerating || !navigator.share}>{isGenerating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Share2 className="h-4 w-4" />}</Button>
                     <Button variant="default" size="icon" onClick={handleDownload} disabled={isGenerating}>{isGenerating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4" />}</Button>
                </div>
                 <div className="flex flex-1 items-center justify-end">
                     <Button variant="ghost" size="icon" onClick={() => window.close()}><X className="h-5 w-5" /></Button>
                </div>
            </header>

            <main className="flex justify-center p-4 sm:p-8 bg-gray-300 print:bg-white print:p-0">
                <div id="print-content" className="w-full max-w-4xl bg-white p-6 sm:p-8 shadow-lg print:shadow-none" style={{ width: '210mm', minHeight: '297mm' }}>
                     <div id="pdf-header" className="w-full mb-6 print:break-after-avoid">
                        <table className="w-full">
                            <tbody>
                                <tr>
                                    <td style={{ width: '25%', verticalAlign: 'top' }}>
                                        <img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" style={{width: '60px', height: '60px'}} />
                                    </td>
                                    <td style={{ width: '75%', verticalAlign: 'top', textAlign: 'right' }}>
                                        <h2 className="text-xl font-bold text-black">Report Giornaliero</h2>
                                        <p className="text-base text-black capitalize">{format(selectedDate, 'eeee, dd MMMM yyyy', { locale: it })}</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-6">
                         {operators.map(op => {
                            const detail = dailyData.get(op.id);
                            const cumulative = monthlyCumulative.get(op.id);
                            
                            if (!detail) return null;

                            return (
                                <div key={op.id} className="pt-2 pb-2 text-sm text-black print:break-inside-avoid border-b border-gray-300 last:border-b-0">
                                    <p className="font-bold text-base text-black">{op.firstName} {op.lastName}</p>
                                    <div className="text-sm space-y-1 pl-1 mt-1 text-black">
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
                                                        <p key={idx}>{`Turno ${idx + 1}: ${timbratureString}`}</p>
                                                    )
                                                })}
                                                <p>Dettaglio Giorno: Ore Ordinarie: {detail.shift.ordinaryHours || 0}h, Straordinari: {detail.shift.overtimeHours || 0}h, Permessi: {detail.shift.permissionHours || 0}h</p>
                                            </>
                                        ) : (
                                            <p>
                                                {detail.status === 'mancata_timbratura' && 'Assente'}
                                                {detail.status === 'ferie' && 'Giorno di Ferie'}
                                                {detail.status === 'malattia' && 'Giorno di Malattia'}
                                                {detail.status === 'riposo' && 'Giorno non lavorativo'}
                                                {detail.status === 'festa' && 'Giorno Festivo'}
                                            </p>
                                        )}
                                        <p>Stato Mensile: Cum. Ordinarie: {cumulative?.ordinary || 0}h, Cum. Straordinari: {cumulative?.overtime || 0}h, Cum. Permessi: {cumulative?.leave || 0}h</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </main>
             <Toaster />
        </div>
    );
};

const PrintPageWrapper = () => (
    <Suspense fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    }>
        <PrintPageContent />
    </Suspense>
);

export default function PrintPage() {
    const [isClient, setIsClient] = useState(false);
    useEffect(() => {
        setIsClient(true);
    }, []);

    return isClient ? <PrintPageWrapper /> : (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
}
