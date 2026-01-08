// src/app/dashboard/monthly-report/print/page.tsx
'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, Timestamp, getDocs, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { Loader2, Printer, Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';
import { format, startOfMonth, endOfDay, isValid, endOfMonth as dfnsEndOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, MonthlySummary } from '@/lib/calculations';
import { Toaster } from '@/components/ui/toaster';

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

type ManualTotals = {
    ferieDays?: number;
    permessoHours?: number;
    malattiaDays?: number;
};

type VisibilitySettings = {
    workedDays: boolean;
    ordinaryHours: boolean;
    overtimeHours: boolean;
    ferieDays: boolean;
    permessoHours: boolean;
    malattiaDays: boolean;
    absenceDays: boolean;
    ordinaryCost: boolean;
    overtimeCost: boolean;
    holidayCost: boolean;
};

const PrintPageContent = () => {
    const firestore = useFirestore();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
    const [allOperators, setAllOperators] = useState<Operator[]>([]);
    const [filteredOperators, setFilteredOperators] = useState<Operator[]>([]);
    const [summaries, setSummaries] = useState<Map<string, MonthlySummary>>(new Map());
    const [manualOverrides, setManualOverrides] = useState<Record<string, ManualTotals>>({});
    const [visibility, setVisibility] = useState<Record<string, Partial<VisibilitySettings>>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        const month = searchParams.get('month'); // YYYY-MM
        if (month) {
            const [year, monthIndex] = month.split('-').map(Number);
            const parsedDate = new Date(Date.UTC(year, monthIndex - 1, 15)); // Use 15th to be safe
            if (isValid(parsedDate)) {
                setCurrentMonth(parsedDate);
            }
        } else {
            setCurrentMonth(new Date());
        }

        const visibilitySettings: Record<string, Partial<VisibilitySettings>> = {};
        for (const [key, value] of searchParams.entries()) {
            if(key.includes('_')) {
                const parts = key.split('_');
                const opId = parts[parts.length - 1];
                const settingKey = parts.slice(0, -1).join('_') as keyof VisibilitySettings;

                if (!visibilitySettings[opId]) visibilitySettings[opId] = {};
                visibilitySettings[opId][settingKey] = value === 'true';
            }
        }
        setVisibility(visibilitySettings);
    }, [searchParams]);

    useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ops = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Operator));
            ops.sort((a,b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
            setAllOperators(ops);
        });
        return () => unsubscribe();
    }, [firestore]);
    
    useEffect(() => {
        const operatorIds = searchParams.get('operators');
        if (operatorIds) {
            const idSet = new Set(operatorIds.split(','));
            setFilteredOperators(allOperators.filter(op => idSet.has(op.id)));
        } else {
            setFilteredOperators(allOperators);
        }
    }, [searchParams, allOperators]);


    useEffect(() => {
        const fetchDataForMonth = async (date: Date) => {
            if (!firestore || filteredOperators.length === 0) {
                 if (filteredOperators.length > 0) setIsLoading(false);
                 return;
            };
            setIsLoading(true);

            const monthStart = startOfMonth(date);
            const monthEnd = dfnsEndOfMonth(date);
            const monthId = format(date, 'yyyy-MM');
            const newOverrides: Record<string, ManualTotals> = {};

            try {
                const promises = filteredOperators.map(async (op) => {
                    // Fetch overrides for each operator
                    const overrideDocRef = doc(firestore, `app-users/${op.id}/monthly-overrides`, monthId);
                    const overrideSnap = await getDoc(overrideDocRef);
                    if (overrideSnap.exists()) {
                        newOverrides[op.id] = overrideSnap.data() as ManualTotals;
                    }

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
                    const timbratureData = timbratureSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                    const requestsData = requestsSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                    
                    const { monthlySummary } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData });
                    return { opId: op.id, summary: monthlySummary };
                });

                const results = await Promise.all(promises);
                const newSummaries = new Map<string, MonthlySummary>();
                results.forEach(({ opId, summary }) => {
                    if (summary) newSummaries.set(opId, summary);
                });
                setSummaries(newSummaries);
                setManualOverrides(newOverrides);

            } catch (error) {
                console.error("Error fetching data for print:", error);
                toast({ title: 'Errore', description: 'Impossibile caricare i dati per il report.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        if (currentMonth && filteredOperators.length > 0) {
            fetchDataForMonth(currentMonth);
        } else if (!currentMonth || filteredOperators.length === 0) {
            setIsLoading(false);
        }
    }, [currentMonth, filteredOperators, firestore, toast]);

    const calculateTotalDue = useCallback((op: Operator, summary: MonthlySummary | undefined, visibilitySettings: Partial<VisibilitySettings> | undefined) => {
        if (!summary) return 0;
        
        const finalVisibility = visibilitySettings || {};

        const ordinaryCost = (op.salaryType === 'fixed' 
            ? (op.fixedSalary || 0) 
            : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));
        
        const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);
        const holidayCost = (summary.holidayHoursPayable || 0) * (op.hourlyRate || 0);

        let total = 0;
        if (finalVisibility.ordinaryCost) total += ordinaryCost;
        if (finalVisibility.overtimeCost) total += overtimeCost;
        if (finalVisibility.holidayCost) total += holidayCost;
        
        return total;
    }, []);
    
    const generatePdf = useCallback(async (): Promise<{ blob: Blob; fileName: string } | null> => {
        setIsGenerating(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            if (!currentMonth || !document) return null;

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageHeight = doc.internal.pageSize.height;
            const pageWidth = doc.internal.pageSize.width;
            const margin = 15;
            let y = 20;

            const addHeader = (isFirstPage: boolean) => {
                 if (isFirstPage) {
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.text("Report Mensile Operatori", pageWidth / 2, y, { align: 'center' });
                    y += 7;
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100);
                    const dateStr = format(currentMonth, 'MMMM yyyy', { locale: it });
                    doc.text(dateStr.charAt(0).toUpperCase() + dateStr.slice(1), pageWidth / 2, y, { align: 'center' });
                    y += 15;
                }
            };

            addHeader(true);
            
            filteredOperators.forEach((op) => {
                const summary = summaries.get(op.id);
                if (!summary) return;
                const override = manualOverrides[op.id] || {};
                const opVisibility = visibility[op.id] || {};
                
                const finalFerieDays = override.ferieDays ?? summary.ferieDays;
                const finalPermessoHours = override.permessoHours ?? summary.permessoHours;
                const finalMalattiaDays = override.malattiaDays ?? summary.malattiaDays;

                const totalDue = calculateTotalDue(op, summary, opVisibility);

                const blockHeight = 65; // Estimated height
                if (y > pageHeight - blockHeight) {
                    doc.addPage();
                    y = 20;
                    addHeader(false); 
                }

                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`${op.firstName} ${op.lastName}`, margin, y);
                y += 6;

                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100);
                doc.text(`MESE: ${format(currentMonth, 'MMMM yyyy', { locale: it }).toUpperCase()}`, margin, y);
                y += 8;

                const body = [];
                if (opVisibility.workedDays) body.push([`GIORNI LAVORATI: ${summary.workedDays}`, '']);
                if (opVisibility.ordinaryHours) body.push([`ORE ORDINARIE: ${summary.ordinaryHours}`, '']);
                if (opVisibility.overtimeHours) body.push([`ORE STRAORDINARIE: ${summary.overtimeHours}`, '']);
                if (opVisibility.ferieDays) body.push([`FERIE: ${finalFerieDays}`, '']);
                if (opVisibility.permessoHours) body.push([`ORE PERMESSI: ${finalPermessoHours}`, '']);
                if (opVisibility.malattiaDays) body.push([`GIORNI DI MALATTIA: ${finalMalattiaDays}`, '']);
                if (opVisibility.absenceDays) body.push([`ASSENZE: ${summary.absenceDays}`, '']);


                (doc as any).autoTable({
                    startY: y,
                    theme: 'plain',
                    body: body,
                    styles: { fontSize: 10, cellPadding: 1, textColor: [0,0,0] },
                });
                y = (doc as any).lastAutoTable.finalY + 5;


                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text(`TOTALE DOVUTO: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, margin, y);
                y += 10;
                
                doc.text('FIRMA: _____________________________', margin, y);
                y += 15;
            });


            const blob = doc.output('blob');
            const fileName = `Report_Mensile_${format(currentMonth, 'yyyy-MM')}.pdf`;

            return { blob, fileName };
        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({ title: 'Errore PDF', description: 'Impossibile generare il PDF.', variant: 'destructive'});
            return null;
        } finally {
            setIsGenerating(false);
        }
    }, [currentMonth, filteredOperators, summaries, calculateTotalDue, manualOverrides, toast, visibility]);

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
                title: `Report Mensile - ${currentMonth ? format(currentMonth, 'MMMM yyyy', { locale: it }) : ''}`,
                text: `Report mensile per ${currentMonth ? format(currentMonth, 'MMMM yyyy', { locale: it }) : ''}`,
                files: [file],
            });
        } catch (error) {
            if ((error as DOMException).name !== 'AbortError') {
                 toast({ title: 'Errore Condivisione', description: 'Impossibile condividere il file.', variant: 'destructive' });
            }
        }
    };


    if (isLoading || !currentMonth) {
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
                <div id="print-content" className="w-full max-w-4xl bg-white p-6 sm:p-8 shadow-lg print:shadow-none print:p-0" style={{ width: '210mm', minHeight: '297mm' }}>
                    <div className="space-y-4">
                         {filteredOperators.map((op, index) => {
                            const summary = summaries.get(op.id);
                            if (!summary) return null;

                            const override = manualOverrides[op.id] || {};
                            const opVisibility = visibility[op.id] || {};
                            const totalDue = calculateTotalDue(op, summary, opVisibility);
                            
                            const finalFerieDays = override.ferieDays ?? summary.ferieDays;
                            const finalPermessoHours = override.permessoHours ?? summary.permessoHours;
                            const finalMalattiaDays = override.malattiaDays ?? summary.malattiaDays;

                            const ordinaryCost = op.salaryType === 'fixed' 
                                ? (op.fixedSalary || 0) 
                                : (summary.ordinaryHours || 0) * (op.hourlyRate || 0);

                            const holidayCost = (summary.holidayHoursPayable || 0) * (op.hourlyRate || 0);
                            const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);

                            return (
                                <div key={op.id} className="pt-6 pb-2 text-sm text-black print:break-inside-avoid" style={{ minHeight: '99mm' }}>
                                    <p className="font-bold text-lg text-black uppercase">{op.firstName} {op.lastName}</p>
                                    <p className='text-sm text-gray-600 mb-2'>MESE: {format(currentMonth, 'MMMM yyyy', {locale: it}).toUpperCase()}</p>
                                    
                                    <table className="w-full text-base mb-2">
                                        <tbody>
                                            {opVisibility.workedDays && <tr><td className="pb-1">GIORNI LAVORATI: {summary.workedDays}</td><td className="pb-1 text-right"></td></tr>}
                                            {opVisibility.ordinaryHours && <tr><td className="pb-1">ORE ORDINARIE: {summary.ordinaryHours}</td><td className="pb-1 text-right">{opVisibility.ordinaryCost && `TOTALE ORDINARIE: ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`}</td></tr>}
                                            {opVisibility.overtimeHours && <tr><td className="pb-1">ORE STRAORDINARIE: {summary.overtimeHours}</td><td className="pb-1 text-right">{opVisibility.overtimeCost && `TOTALE STRAORDINARIE: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`}</td></tr>}
                                            {opVisibility.ferieDays && <tr><td className="pb-1">FERIE: {finalFerieDays}</td><td className="pb-1 text-right">{op.salaryType !== 'fixed' && holidayCost > 0 && opVisibility.holidayCost && `COSTO FERIE: ${holidayCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`}</td></tr>}
                                            {opVisibility.permessoHours && <tr><td className="pb-1">ORE PERMESSI: {finalPermessoHours}</td><td></td></tr>}
                                            {opVisibility.malattiaDays && <tr><td className="pb-1">GIORNI DI MALATTIA: {finalMalattiaDays}</td><td></td></tr>}
                                            {opVisibility.absenceDays && <tr><td className="pb-1">ASSENZE: {summary.absenceDays}</td><td></td></tr>}
                                            
                                            <tr>
                                                <td className="pt-2" colSpan={2}>
                                                    <div className="border-t-2 border-black pt-1 font-bold text-lg text-right">TOTALE DOVUTO: {totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <div className='mt-8 mb-4'>
                                        <p className="text-base text-black">FIRMA: _____________________________</p>
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
