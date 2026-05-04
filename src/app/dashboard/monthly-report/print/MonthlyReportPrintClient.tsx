'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, onSnapshot, getDoc, doc, orderBy, limit } from 'firebase/firestore';
import { Loader2, Printer, Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';
import { format, startOfMonth, isValid, endOfMonth as dfnsEndOfMonth, subMonths, addMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, MonthlySummary } from '@/lib/calculations';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    workSchedule: any;
    overtimeHalfHourTrigger?: number;
    overtimeHourTrigger?: number;
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
    sickLeaveRate?: number;
};

type ManualTotals = {
    ferieDays?: number | string;
    permessoHours?: number | string;
    malattiaDays?: number | string;
    totalDueOverride?: number;
    ordinaryWorkedDays?: number | string;
    ordinaryCost?: number;
    overtimeHours?: number | string;
    overtimeCost?: number;
    malattiaCost?: number;
    permessoCost?: number;
    ferieCost?: number;
    absenceDays?: number | string;
    [key: string]: any;
};

type VisibilitySettings = {
    ordinaryWorkedDays: boolean;
    showWorkedHours: boolean;
    ordinaryHours: boolean;
    overtimeHours: boolean;
    ferieDays: boolean;
    permessoHours: boolean;
    malattiaDays: boolean;
    absenceDays: boolean;
    ordinaryCost: boolean;
    overtimeCost: boolean;
    ferieCost: boolean;
    permessoCost: boolean;
    malattiaCost: boolean;
    compactMode: boolean;
};

export default function MonthlyReportPrintClient() {
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
    const [globalCompact, setGlobalCompact] = useState(false);

    useEffect(() => {
        const month = searchParams.get('month'); // YYYY-MM
        if (month) {
            const [year, monthIndex] = month.split('-').map(Number);
            const parsedDate = new Date(Date.UTC(year, monthIndex - 1, 15));
            if (isValid(parsedDate)) {
                setCurrentMonth(parsedDate);
            }
        } else {
            setCurrentMonth(new Date());
        }

        const isGlobalCompact = searchParams.get('globalCompact') === 'true';
        setGlobalCompact(isGlobalCompact);

        const visibilitySettings: Record<string, Partial<VisibilitySettings>> = {};
        for (const [key, value] of searchParams.entries()) {
            if(key.includes('_')) {
                const parts = key.split('_');
                const opId = parts[parts.length - 1];
                const settingKey = parts.slice(0, -1).join('_') as keyof VisibilitySettings;

                if (!visibilitySettings[opId]) visibilitySettings[opId] = {};
                (visibilitySettings[opId] as any)[settingKey] = value === 'true';
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
            const ids = operatorIds.split(',');
            const idSet = new Set(ids);
            const filtered = allOperators.filter(op => idSet.has(op.id));
            setFilteredOperators(filtered);
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
            const queryStart = subMonths(monthStart, 1);
            const queryEnd = addMonths(monthEnd, 1);

            const monthId = format(date, 'yyyy-MM');
            const newOverrides: Record<string, ManualTotals> = {};

            try {
                const promises = filteredOperators.map(async (op) => {
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
                    const straordinariQuery = query(
                        collection(firestore, `app-users/${op.id}/straordinari`),
                        where('date', '>=', queryStart),
                        where('date', '<=', queryEnd)
                    );


                    const [timbratureSnap, requestsSnap, straordinariSnap] = await Promise.all([
                        getDocs(timbratureQuery),
                        getDocs(requestsQuery),
                        getDocs(straordinariQuery)
                    ]);
                    const timbratureData = timbratureSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                    const requestsData = requestsSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                    const straordinariData = straordinariSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                    
                    let employmentStartDate: Date | undefined;
                    if ((op as any).employmentStartDate) {
                        employmentStartDate = (op as any).employmentStartDate.toDate();
                    }

                    const { monthlySummary } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData, straordinari: straordinariData }, employmentStartDate);
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

    const calculateTotalDue = useCallback((opId: string, op: Operator, summary: MonthlySummary | undefined, visibilitySettings: Partial<VisibilitySettings> | undefined) => {
        const override = manualOverrides[opId];
        if (override?.totalDueOverride !== undefined) {
            return override.totalDueOverride;
        }
        
        if (!summary) return 0;
        
        const finalVisibility = visibilitySettings || {};

        const ordinaryCost = override.ordinaryCost !== undefined ? Number(override.ordinaryCost) : (op.salaryType === 'fixed' 
            ? (op.fixedSalary || 0) 
            : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));
        
        const overtimeCost = override.overtimeCost !== undefined ? Number(override.overtimeCost) : (summary.overtimeHours || 0) * (op.overtimeRate || 0);
        const ferieCost = override.ferieCost !== undefined ? Number(override.ferieCost) : summary.ferieCost || 0;
        const permessoCost = override.permessoCost !== undefined ? Number(override.permessoCost) : summary.permessoCost || 0;
        const malattiaCost = override.malattiaCost !== undefined ? Number(override.malattiaCost) : summary.malattiaCost || 0;

        let total = 0;
        if (finalVisibility.ordinaryCost !== false) total += ordinaryCost;
        if (finalVisibility.overtimeCost !== false) total += overtimeCost;
        if (finalVisibility.ferieCost !== false) total += ferieCost;
        if (finalVisibility.permessoCost !== false) total += permessoCost;
        if (finalVisibility.malattiaCost !== false) total += malattiaCost;
        
        return total;
    }, [manualOverrides]);
    
    const generatePdf = useCallback(async (): Promise<{ blob: Blob; fileName: string } | null> => {
        setIsGenerating(true);
        try {
            const { default: jsPDF } = await import('jspdf');

            if (!currentMonth || !document) return null;

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageHeight = doc.internal.pageSize.height;
            const pageWidth = doc.internal.pageSize.width;
            const margin = 15;
            let y = 20;

            let itemsOnCurrentPage = 0;

            filteredOperators.forEach((op) => {
                const summary = summaries.get(op.id);
                if (!summary) return;
                const override = manualOverrides[op.id] || {};
                const opVisibility = visibility[op.id] || {};
                
                const totalDue = calculateTotalDue(op.id, op, summary, opVisibility);

                if (globalCompact || opVisibility.compactMode) {
                    if (y > pageHeight - 15) {
                        doc.addPage();
                        y = 20;
                    }
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(0, 0, 0);
                    doc.text(`${op.firstName} ${op.lastName}`.toUpperCase(), margin, y);
                    
                    doc.setFont('helvetica', 'normal');
                    const nameWidth = doc.getTextWidth(`${op.firstName} ${op.lastName} `);
                    const totalText = `TOTALE: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`;
                    
                    doc.setTextColor(150);
                    doc.text("....................................................................................................", margin + nameWidth, y);
                    doc.setTextColor(0, 0, 0);
                    doc.setFont('helvetica', 'bold');
                    doc.text(totalText, pageWidth - margin, y, { align: 'right' });
                    y += 12;
                    return;
                }

                if (itemsOnCurrentPage === 2) {
                    doc.addPage();
                    y = 20;
                    itemsOnCurrentPage = 0;
                }

                const periodText = format(currentMonth, 'MMMM yyyy', { locale: it }).toUpperCase();

                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`${op.firstName} ${op.lastName}`, margin, y);
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(100);
                doc.text(`MESE: ${periodText}`, pageWidth - margin, y, { align: 'right' });
                y += 10;
                
                const ordinaryCost = override.ordinaryCost !== undefined ? Number(override.ordinaryCost) : (op.salaryType === 'fixed' 
                    ? (op.fixedSalary || 0) 
                    : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));

                const overtimeCost = override.overtimeCost !== undefined ? Number(override.overtimeCost) : (summary.overtimeHours || 0) * (op.overtimeRate || 0);
                
                const defaultOrdinaryWorkedDaysText = opVisibility.showWorkedHours ? `${summary.ordinaryWorkedDays} (${summary.ordinaryHours}h)` : `${summary.ordinaryWorkedDays}`;
                const ordinaryWorkedDaysText = override.ordinaryWorkedDays !== undefined ? override.ordinaryWorkedDays : defaultOrdinaryWorkedDaysText;

                const allItems = [
                    opVisibility.ordinaryWorkedDays !== false ? `GIORNI ORDINARI LAVORATI: ${ordinaryWorkedDaysText}` : null,
                    opVisibility.ordinaryCost !== false ? `${op.salaryType === 'fixed' ? 'FISSO MENSILE' : 'TOTALE ORDINARIE'}: ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                    opVisibility.overtimeHours !== false ? `ORE STRAORDINARIE: ${override.overtimeHours ?? summary.overtimeHours}` : null,
                    opVisibility.overtimeCost !== false ? `TOTALE STRAORDINARI: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                    opVisibility.malattiaDays !== false ? `GIORNI DI MALATTIA: ${override.malattiaDays ?? summary.malattiaDays}`: null,
                    opVisibility.permessoHours !== false ? `ORE PERMESSI: ${override.permessoHours ?? summary.permessoHours}` : null,
                    opVisibility.ferieDays !== false ? `FERIE: ${override.ferieDays ?? summary.ferieDays}` : null,
                    opVisibility.absenceDays !== false ? `ASSENZE: ${override.absenceDays ?? summary.absenceDays}` : null
                ].filter(Boolean) as string[];

                const bodyData: [string, string][] = [];
                for (let i = 0; i < allItems.length; i += 2) {
                    bodyData.push([allItems[i], allItems[i + 1] || '']);
                }
                
                doc.setFontSize(12);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0,0,0);

                bodyData.forEach(row => {
                    y += 8;
                    doc.text(row[0], margin, y);
                    doc.text(row[1], pageWidth - margin, y, { align: 'right' });
                });
                
                y += 8;
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text(`TOTALE DOVUTO: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, pageWidth - margin, y + 5, { align: 'right' });
                y += 15;

                doc.setFontSize(11);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(0, 0, 0);
                const declarationText = `Io sottoscritto, ${op.firstName} ${op.lastName}, dichiaro di aver ricevuto dal datore di lavoro la busta paga relativa al periodo ${format(currentMonth, 'MMMM yyyy', { locale: it })}, e di accettare gli importi indicati.`;
                const splitDeclaration = doc.splitTextToSize(declarationText, pageWidth - margin * 2);
                doc.text(splitDeclaration, margin, y);
                y += (splitDeclaration.length * 6) + 8;

                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text('FIRMA: __________________________________________', margin, y);
                y += 20; 
                itemsOnCurrentPage++;
            });


            const blob = doc.output('blob');
            let fileName = `Report_Mensile_${format(currentMonth, 'yyyy-MM')}.pdf`;
            if (filteredOperators.length === 1) {
                const op = filteredOperators[0];
                fileName = `${op.firstName.trim()}_${op.lastName.trim()}_${format(currentMonth, 'yyyy-MM')}.pdf`;
            }

            return { blob, fileName };
        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({ title: 'Errore PDF', description: 'Impossibile generare il PDF.', variant: 'destructive'});
            return null;
        } finally {
            setIsGenerating(false);
        }
    }, [currentMonth, filteredOperators, summaries, calculateTotalDue, manualOverrides, toast, visibility, globalCompact]);

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
                <div id="print-content" className="w-full max-w-4xl bg-white p-6 sm:p-10 shadow-lg print:shadow-none" style={{ width: '210mm' }}>
                    
                    {globalCompact && currentMonth && (
                        <div className="mb-10 text-center border-b-2 border-black pb-4">
                            <h1 className="text-3xl font-bold uppercase">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h1>
                        </div>
                    )}

                    <div className="space-y-4">
                         {filteredOperators.map((op, index) => {
                            const summary = summaries.get(op.id);
                            if (!summary) return null;

                            const override = manualOverrides[op.id] || {};
                            const opVisibility = visibility[op.id] || {};
                            const totalDue = calculateTotalDue(op.id, op, summary, opVisibility);
                            
                            const finalFerieDays = override.ferieDays ?? summary.ferieDays;
                            const finalPermessoHours = override.permessoHours ?? summary.permessoHours;
                            const finalMalattiaDays = override.malattiaDays ?? summary.malattiaDays;

                            const ordinaryCost = override.ordinaryCost !== undefined ? Number(override.ordinaryCost) : (op.salaryType === 'fixed' 
                                ? (op.fixedSalary || 0) 
                                : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));

                            const overtimeCost = override.overtimeCost !== undefined ? Number(override.overtimeCost) : (summary.overtimeHours || 0) * (op.overtimeRate || 0);
                            
                            const defaultOrdinaryWorkedDaysText = opVisibility.showWorkedHours ? `${summary.ordinaryWorkedDays} (${summary.ordinaryHours}h)` : `${summary.ordinaryWorkedDays}`;
                            const ordinaryWorkedDaysText = override.ordinaryWorkedDays !== undefined ? override.ordinaryWorkedDays : defaultOrdinaryWorkedDaysText;
                            
                            if (globalCompact || opVisibility.compactMode) {
                                return (
                                    <div key={op.id} className="text-base text-black print:break-inside-avoid pb-4 border-b border-dashed border-gray-300">
                                        <div className="flex justify-between items-baseline gap-2">
                                            <p className="font-bold text-xl text-black uppercase whitespace-nowrap">{op.firstName} {op.lastName}</p>
                                            <div className="flex-1 border-b border-dotted border-gray-400 mb-1"></div>
                                            <p className="font-bold text-xl text-black whitespace-nowrap">TOTALE: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</p>
                                        </div>
                                    </div>
                                )
                            }

                            const allItems = [
                                opVisibility.ordinaryWorkedDays !== false ? `GIORNI ORDINARI LAVORATI: ${ordinaryWorkedDaysText}` : null,
                                opVisibility.ordinaryCost !== false ? `${op.salaryType === 'fixed' ? 'FISSO MENSILE' : 'TOTALE ORDINARIE'}: ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                                opVisibility.overtimeHours !== false ? `ORE STRAORDINARIE: ${override.overtimeHours ?? summary.overtimeHours}` : null,
                                opVisibility.overtimeCost !== false ? `TOTALE STRAORDINARI: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                                opVisibility.malattiaDays !== false ? `GIORNI DI MALATTIA: ${finalMalattiaDays}`: null,
                                opVisibility.permessoHours !== false ? `ORE PERMESSI: ${finalPermessoHours}` : null,
                                opVisibility.ferieDays !== false ? `FERIE: ${finalFerieDays}` : null,
                                opVisibility.absenceDays !== false ? `ASSENZE: ${override.absenceDays ?? summary.absenceDays}` : null
                            ].filter(Boolean) as string[];

                            const bodyData: [string, string][] = [];
                            for (let i = 0; i < allItems.length; i += 2) {
                                bodyData.push([allItems[i], allItems[i + 1] || '']);
                            }

                            const needsPageBreak = (index + 1) % 2 === 0 && (index + 1) < filteredOperators.length;
                            const periodText = format(currentMonth, 'MMMM yyyy', {locale: it}).toUpperCase();

                            return (
                                <div key={op.id} className={cn(
                                    "text-black print:break-inside-avoid pb-20 pt-6", 
                                    needsPageBreak && "print:break-after-page"
                                )}>
                                    <div className='flex justify-between items-start mb-6'>
                                        <p className="font-bold text-2xl text-black uppercase">{op.firstName} {op.lastName}</p>
                                        <p className='text-base text-gray-600 font-bold'>MESE: {periodText}</p>
                                    </div>
                                    
                                    <table className="w-full text-lg mt-2 mb-6">
                                        <tbody>
                                            {bodyData.map((row, i) => (
                                                <tr key={i}>
                                                    <td className="py-2 border-b border-gray-100">{row[0]}</td>
                                                    <td className="py-2 text-right border-b border-gray-100">{row[1]}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    
                                     <div className="text-right font-bold text-3xl mt-6 pt-4 text-black border-t-2 border-gray-300">
                                        <span>TOTALE DOVUTO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                                    </div>

                                    <div className='mt-10 mb-10 italic text-gray-800 text-lg leading-relaxed'>
                                        <p>
                                            Io sottoscritto, <span className='font-bold'>{op.firstName} {op.lastName}</span>, dichiaro di aver ricevuto dal datore di lavoro la busta paga relativa al periodo <span className='font-bold'>{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>, e di accettare gli importi indicati.
                                        </p>
                                    </div>

                                    <div className='pt-6'>
                                        <p className="text-lg text-black font-bold">FIRMA: __________________________________________________</p>
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
}
