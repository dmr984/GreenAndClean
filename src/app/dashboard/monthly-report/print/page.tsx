
// src/app/dashboard/monthly-report/print/page.tsx
'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, Timestamp, getDocs, onSnapshot, getDoc, doc } from 'firebase/firestore';
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
    ferieDays?: number;
    permessoHours?: number;
    malattiaDays?: number;
    totalDueOverride?: number;
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
                    
                    const { monthlySummary } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData, straordinari: straordinariData });
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

    useEffect(() => {
        if (!isLoading && filteredOperators.length > 0 && searchParams.get('autoPrint') === 'true') {
            const timer = setTimeout(() => {
                window.print();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isLoading, filteredOperators.length, searchParams]);

    useEffect(() => {
        if (!currentMonth) return;
        let baseName = `Report_Mensile_${format(currentMonth, 'yyyy-MM')}`;
        if (filteredOperators.length === 1) {
            const op = filteredOperators[0];
            baseName = `${op.firstName.trim()}_${op.lastName.trim()}_${format(currentMonth, 'yyyy-MM')}`;
        } else if (filteredOperators.length > 1 && filteredOperators.length <= 3) {
            const names = filteredOperators.map(op => `${op.firstName.trim()}_${op.lastName.trim()}`).join('-');
            baseName = `Report_${names}_${format(currentMonth, 'yyyy-MM')}`;
        }
        document.title = baseName;
    }, [currentMonth, filteredOperators]);

    const calculateTotalDue = useCallback((opId: string, op: Operator, summary: MonthlySummary | undefined, visibilitySettings: Partial<VisibilitySettings> | undefined) => {
        const override = manualOverrides[opId];
        if (override?.totalDueOverride !== undefined) {
            return override.totalDueOverride;
        }
        
        if (!summary) return 0;
        
        const finalVisibility = visibilitySettings || {};

        const ordinaryCost = (op.salaryType === 'fixed' 
            ? (op.fixedSalary || 0) 
            : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));
        
        const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);
        const ferieCost = summary.ferieCost || 0;
        const permessoCost = summary.permessoCost || 0;
        const malattiaCost = summary.malattiaCost || 0;

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
            const { default: autoTable } = await import('jspdf-autotable');

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
                
                const ordinaryCost = op.salaryType === 'fixed' 
                    ? (op.fixedSalary || 0) 
                    : (summary.ordinaryHours || 0) * (op.hourlyRate || 0);

                const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);
                
                const ordinaryWorkedDaysText = opVisibility.showWorkedHours ? `${summary.ordinaryWorkedDays} (${summary.ordinaryHours}h)` : `${summary.ordinaryWorkedDays}`;

                const allItems = [
                    opVisibility.ordinaryWorkedDays !== false ? `GIORNI ORDINARI LAVORATI: ${ordinaryWorkedDaysText}` : null,
                    opVisibility.ordinaryCost !== false ? `${op.salaryType === 'fixed' ? 'FISSO MENSILE' : 'TOTALE ORDINARIE'}: ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                    opVisibility.overtimeHours !== false ? `ORE STRAORDINARIE: ${summary.overtimeHours}` : null,
                    opVisibility.overtimeCost !== false ? `TOTALE STRAORDINARIE: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                    opVisibility.malattiaDays !== false ? `GIORNI DI MALATTIA: ${override.malattiaDays ?? summary.malattiaDays}`: null,
                    opVisibility.permessoHours !== false ? `ORE PERMESSI: ${override.permessoHours ?? summary.permessoHours}` : null,
                    opVisibility.ferieDays !== false ? `FERIE: ${override.ferieDays ?? summary.ferieDays}` : null,
                    opVisibility.absenceDays !== false ? `ASSENZE: ${summary.absenceDays}` : null
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
            let baseName = `Report_Mensile_${format(currentMonth, 'yyyy-MM')}`;
            if (filteredOperators.length === 1) {
                const op = filteredOperators[0];
                baseName = `${op.firstName.trim()}_${op.lastName.trim()}_${format(currentMonth, 'yyyy-MM')}`;
            } else if (filteredOperators.length > 1 && filteredOperators.length <= 3) {
                 const names = filteredOperators.map(op => `${op.firstName.trim()}_${op.lastName.trim()}`).join('-');
                 baseName = `Report_${names}_${format(currentMonth, 'yyyy-MM')}`;
            }
            const fileName = `${baseName}.pdf`;

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

    const handleDownload = useCallback(async () => {
        const pdf = await generatePdf();
        if (!pdf) return;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(pdf.blob);
        a.download = pdf.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }, [generatePdf]);

    useEffect(() => {
        if (!isLoading && filteredOperators.length > 0 && searchParams.get('autoDownload') === 'true') {
            const timer = setTimeout(() => {
                handleDownload();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isLoading, filteredOperators.length, searchParams, handleDownload]);

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

            <main className="flex justify-center bg-gray-300 print:bg-transparent print:p-0">
                <div id="print-content" className="w-full max-w-4xl bg-white shadow-lg print:shadow-none print:w-full print:max-w-none" style={{ margin: '0 auto' }}>
                    
                    {globalCompact && currentMonth && (
                        <div className="mb-6 text-center border-b-2 border-black pb-2 print:hidden p-4">
                            <h1 className="text-2xl font-bold uppercase">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h1>
                        </div>
                    )}

                    <div className="space-y-0 w-full print:w-full">
                         {filteredOperators.map((op, index) => {
                            const summary = summaries.get(op.id);
                            if (!summary) return null;

                            const override = manualOverrides[op.id] || {};
                            const opVisibility = visibility[op.id] || {};
                            const totalDue = calculateTotalDue(op.id, op, summary, opVisibility);
                            
                            const finalFerieDays = override.ferieDays ?? summary.ferieDays;
                            const finalPermessoHours = override.permessoHours ?? summary.permessoHours;
                            const finalMalattiaDays = override.malattiaDays ?? summary.malattiaDays;

                            const ordinaryCost = op.salaryType === 'fixed' 
                                ? (op.fixedSalary || 0) 
                                : (summary.ordinaryHours || 0) * (op.hourlyRate || 0);

                            const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);
                            
                            const ordinaryWorkedDaysText = opVisibility.showWorkedHours ? `${summary.ordinaryWorkedDays} (${summary.ordinaryHours}h)` : `${summary.ordinaryWorkedDays}`;
                            
                            if (globalCompact || opVisibility.compactMode) {
                                return (
                                    <div key={op.id} className="text-sm text-black print:break-inside-avoid pb-2 p-2 print:p-0">
                                        <div className="flex justify-between items-baseline gap-2">
                                            <p className="font-bold text-lg text-black uppercase whitespace-nowrap">{op.firstName} {op.lastName}</p>
                                            <div className="flex-1 mb-1"></div>
                                            <p className="font-bold text-lg text-black whitespace-nowrap">TOTALE: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</p>
                                        </div>
                                    </div>
                                )
                            }

                            const allItems = [
                                opVisibility.ordinaryWorkedDays !== false ? `GIORNI ORDINARI LAVORATI: ${ordinaryWorkedDaysText}` : null,
                                opVisibility.ordinaryCost !== false ? `${op.salaryType === 'fixed' ? 'FISSO MENSILE' : 'TOTALE ORDINARIE'}: ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                                opVisibility.overtimeHours !== false ? `ORE STRAORDINARIE: ${summary.overtimeHours}` : null,
                                opVisibility.overtimeCost !== false ? `TOTALE STRAORDINARI: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                                opVisibility.malattiaDays !== false ? `GIORNI DI MALATTIA: ${finalMalattiaDays}`: null,
                                opVisibility.permessoHours !== false ? `ORE PERMESSI: ${finalPermessoHours}` : null,
                                opVisibility.ferieDays !== false ? `FERIE: ${finalFerieDays}` : null,
                                opVisibility.absenceDays !== false ? `ASSENZE: ${summary.absenceDays}` : null
                            ].filter(Boolean) as string[];

                            const bodyData: [string, string][] = [];
                            for (let i = 0; i < allItems.length; i += 2) {
                                bodyData.push([allItems[i], allItems[i + 1] || '']);
                            }

                            const needsPageBreak = (index + 1) % 2 === 0 && (index + 1) < filteredOperators.length;
                            const periodText = format(currentMonth, 'MMMM yyyy', {locale: it}).toUpperCase();
                            
                            return (
                                <div key={op.id} className={cn(
                                    "text-black print:break-inside-avoid flex flex-col px-2 sm:px-4 print:pt-4 print:pb-8 print:mb-8 print:w-full print:px-0", 
                                    needsPageBreak && "print:break-after-page"
                                )}>
                                    
                                    <div className="flex-1 flex flex-col justify-center">
                                        <div className='flex justify-between items-end mb-4'>
                                            <p className="font-bold text-2xl lg:text-3xl text-black uppercase">{op.firstName} {op.lastName}</p>
                                            <p className='text-lg lg:text-xl text-gray-700 font-bold'>MESE: {periodText}</p>
                                        </div>
                                        
                                        <table className="w-full text-base lg:text-xl mt-2 mb-4">
                                            <tbody>
                                                {bodyData.map((row, i) => (
                                                    <tr key={i}>
                                                        <td className="py-2 w-1/2 align-bottom">{row[0]}</td>
                                                        <td className="py-2 text-right font-medium w-1/2 align-bottom">{row[1]}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        
                                        <div className="text-right font-bold text-2xl lg:text-4xl mt-4 pt-2 text-black">
                                            <span>TOTALE DOVUTO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                                        </div>
                                    </div>

                                    <div className="mt-8 flex flex-col justify-end">
                                        <div className='mb-4 italic text-gray-800 text-sm lg:text-base leading-relaxed'>
                                            <p>
                                                Io sottoscritto, <span className='font-bold'>{op.firstName} {op.lastName}</span>, dichiaro di aver ricevuto dal datore di lavoro la busta paga relativa al periodo <span className='font-bold'>{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>, e di accettare gli importi indicati.
                                            </p>
                                        </div>

                                        <div className='pt-1'>
                                            <p className="text-lg lg:text-xl text-black font-bold">FIRMA: __________________________________________________</p>
                                        </div>
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
