'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { Loader2, Printer, Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';
import { format, startOfMonth, isValid, endOfMonth as dfnsEndOfMonth, subMonths, addMonths } from 'date-fns';
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
    ordinaryCost?: number | string;
    overtimeHours?: number | string;
    overtimeCost?: number | string;
    malattiaCost?: number | string;
    permessoCost?: number | string;
    ferieCost?: number | string;
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
    anticipiAmount?: boolean;
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

    const calculateLordoDue = useCallback((opId: string, op: Operator, summary: MonthlySummary | undefined, visibilitySettings: Partial<VisibilitySettings> | undefined) => {
        const override = manualOverrides[opId] || {};
        if (!summary) return 0;
        
        const finalVisibility = visibilitySettings || {};

        const ordinaryCost = override.ordinaryCost !== undefined && override.ordinaryCost !== '' 
            ? Number(override.ordinaryCost) 
            : (op.salaryType === 'fixed' 
                ? (op.fixedSalary || 0) 
                : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));
        
        const overtimeCost = override.overtimeCost !== undefined && override.overtimeCost !== '' 
            ? Number(override.overtimeCost) 
            : (summary.overtimeHours || 0) * (op.overtimeRate || 0);
        const ferieCost = override.ferieCost !== undefined && override.ferieCost !== '' ? Number(override.ferieCost) : (summary.ferieCost || 0);
        const permessoCost = override.permessoCost !== undefined && override.permessoCost !== '' ? Number(override.permessoCost) : (summary.permessoCost || 0);
        const malattiaCost = override.malattiaCost !== undefined && override.malattiaCost !== '' ? Number(override.malattiaCost) : (summary.malattiaCost || 0);

        let total = 0;
        if (finalVisibility.ordinaryCost !== false) total += ordinaryCost;
        if (finalVisibility.overtimeCost !== false) total += overtimeCost;
        if (finalVisibility.ferieCost !== false) total += ferieCost;
        if (finalVisibility.permessoCost !== false) total += permessoCost;
        if (finalVisibility.malattiaCost !== false) total += malattiaCost;
        
        return total;
    }, [manualOverrides]);

    const calculateTotalDue = useCallback((opId: string, op: Operator, summary: MonthlySummary | undefined, visibilitySettings: Partial<VisibilitySettings> | undefined) => {
        const override = manualOverrides[opId] || {};
        if (override.totalDueOverride !== undefined && override.totalDueOverride !== '') {
            return Number(override.totalDueOverride);
        }
        
        const lordo = calculateLordoDue(opId, op, summary, visibilitySettings);
        
        const anticipiAmount = override.anticipiAmount !== undefined && override.anticipiAmount !== ''
            ? Number(override.anticipiAmount) 
            : (summary?.anticipiAmount || 0);
            
        return Math.max(0, lordo - anticipiAmount);
    }, [manualOverrides, calculateLordoDue]);

    // Raggruppamento rigoroso a coppie di 2 operatori per foglio A4
    const operatorPages = useMemo(() => {
        const pages: Operator[][] = [];
        for (let i = 0; i < filteredOperators.length; i += 2) {
            pages.push(filteredOperators.slice(i, i + 2));
        }
        return pages;
    }, [filteredOperators]);

    const generatePdf = useCallback(async (): Promise<{ blob: Blob; fileName: string } | null> => {
        setIsGenerating(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            if (!currentMonth || !document) return null;

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = 210;
            const margin = 15;

            const renderPdfSlot = (op: Operator, startY: number) => {
                const summary = summaries.get(op.id);
                if (!summary) return;
                const override = manualOverrides[op.id] || {};
                const opVisibility = visibility[op.id] || {};
                
                const lordoDue = calculateLordoDue(op.id, op, summary, opVisibility);
                const totalDue = calculateTotalDue(op.id, op, summary, opVisibility);
                const anticipiAmount = override.anticipiAmount !== undefined 
                    ? Number(override.anticipiAmount) 
                    : (summary?.anticipiAmount || 0);

                const periodText = format(currentMonth, 'MMMM yyyy', { locale: it }).toUpperCase();
                let y = startY;

                // Intestazione
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`${op.firstName} ${op.lastName}`, margin, y);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(90, 90, 90);
                doc.text(`MESE: ${periodText}`, pageWidth - margin, y, { align: 'right' });
                y += 6;

                // Linea sotto intestazione
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.4);
                doc.line(margin, y, pageWidth - margin, y);
                y += 6;

                // Calcolo voci
                const ordinaryCost = override.ordinaryCost !== undefined ? Number(override.ordinaryCost) : (op.salaryType === 'fixed' 
                    ? (op.fixedSalary || 0) 
                    : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));
                const overtimeCost = override.overtimeCost !== undefined ? Number(override.overtimeCost) : (summary.overtimeHours || 0) * (op.overtimeRate || 0);
                const absenceDays = override.absenceDays !== undefined ? override.absenceDays : (summary?.absenceDays || 0);
                const overtimeHours = override.overtimeHours !== undefined ? override.overtimeHours : (summary?.overtimeHours || 0);
                const ferieDays = override.ferieDays !== undefined ? override.ferieDays : (summary?.ferieDays || 0);
                const permessoHours = override.permessoHours !== undefined ? override.permessoHours : (summary?.permessoHours || 0);
                const malattiaDays = override.malattiaDays !== undefined ? override.malattiaDays : (summary?.malattiaDays || 0);
                const ordinaryWorkedDaysDisplay = override.ordinaryWorkedDays !== undefined 
                    ? override.ordinaryWorkedDays 
                    : (summary ? (opVisibility.showWorkedHours ? `${summary.ordinaryWorkedDays || 0} (${summary.ordinaryHours || 0}h)` : (summary.ordinaryWorkedDays || 0)) : 0);

                const allItems = [
                    opVisibility.ordinaryWorkedDays !== false ? `GIORNI ORDINARI LAVORATI: ${ordinaryWorkedDaysDisplay}` : null,
                    opVisibility.ordinaryCost !== false ? `${op.salaryType === 'fixed' ? 'FISSO MENSILE' : 'TOTALE ORDINARIE'}: ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                    opVisibility.overtimeHours !== false ? `ORE STRAORDINARIE: ${overtimeHours}` : null,
                    opVisibility.overtimeCost !== false ? `TOTALE STRAORDINARI: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
                    opVisibility.malattiaDays !== false ? `GIORNI DI MALATTIA: ${malattiaDays}`: null,
                    opVisibility.permessoHours !== false ? `ORE PERMESSI: ${permessoHours}` : null,
                    opVisibility.ferieDays !== false ? `FERIE: ${ferieDays}` : null,
                    opVisibility.absenceDays !== false ? `ASSENZE: ${absenceDays}` : null,
                ].filter(Boolean) as string[];

                const bodyData: [string, string][] = [];
                for (let i = 0; i < allItems.length; i += 2) {
                    bodyData.push([allItems[i], allItems[i + 1] || '']);
                }

                doc.setFontSize(9.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(20, 20, 20);

                bodyData.forEach(row => {
                    doc.text(row[0], margin, y);
                    doc.text(row[1], pageWidth - margin, y, { align: 'right' });
                    y += 5.5;
                });

                // Linea separatrice subito sopra i totali (spazio compatto ed equilibrato)
                doc.setDrawColor(180, 180, 180);
                doc.setLineWidth(0.3);
                doc.line(margin, y, pageWidth - margin, y);
                y += 5;

                // Sezione Totali e Anticipo
                if (anticipiAmount > 0) {
                    doc.setFontSize(9);
                    doc.setTextColor(60, 60, 60);
                    doc.text(`Totale Competenze: ${lordoDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, margin, y);
                    doc.setTextColor(190, 24, 24);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`Anticipo Erogato: - ${anticipiAmount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, margin, y + 4.5);
                    
                    doc.setFontSize(13);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(0, 0, 0);
                    doc.text(`NETTO A SALDO: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, pageWidth - margin, y + 3.5, { align: 'right' });
                    y += 9.5;
                } else {
                    doc.setFontSize(13);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(0, 0, 0);
                    doc.text(`TOTALE DOVUTO: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, pageWidth - margin, y + 3, { align: 'right' });
                    y += 8;
                }

                // Dicitura quietanza
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(40, 40, 40);
                const declarationText = anticipiAmount > 0
                    ? `Io sottoscritto/a ${op.firstName} ${op.lastName}, dichiaro di aver ricevuto dal datore di lavoro la somma netta di ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} a saldo del periodo ${format(currentMonth, 'MMMM yyyy', { locale: it })}, calcolata a fronte di competenze totali maturate per ${lordoDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} e detratto l'anticipo sullo stipendio di ${anticipiAmount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} già percepito. Rilascio pertanto integrale quietanza liberatoria.`
                    : `Io sottoscritto/a ${op.firstName} ${op.lastName}, dichiaro di aver ricevuto dal datore di lavoro la somma di ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} a saldo del periodo ${format(currentMonth, 'MMMM yyyy', { locale: it })}, e di accettare integralmente gli importi indicati rilasciando ricevuta.`;
                const splitDeclaration = doc.splitTextToSize(declarationText, pageWidth - margin * 2);
                doc.text(splitDeclaration, margin, y);
                y += (splitDeclaration.length * 3.8) + 6;

                // Firma
                doc.setFontSize(9.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text('FIRMA PER RICEVUTA E QUIETANZA: __________________________________________', margin, y);
            };

            for (let pageIdx = 0; pageIdx < operatorPages.length; pageIdx++) {
                if (pageIdx > 0) doc.addPage();
                const pair = operatorPages[pageIdx];

                // Operatore 1 in alto a Y = 12mm
                renderPdfSlot(pair[0], 12);

                // Operatore 2 a Y = 160.5mm (esattamente 12mm sotto la metà foglio A4 di 148.5mm)
                if (pair[1]) {
                    renderPdfSlot(pair[1], 160.5);
                }
            }

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
    }, [currentMonth, filteredOperators, operatorPages, summaries, calculateTotalDue, calculateLordoDue, manualOverrides, toast, visibility]);

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

    const renderOperatorCard = (op: Operator) => {
        const summary = summaries.get(op.id);
        if (!summary) return null;

        const override = manualOverrides[op.id] || {};
        const opVisibility = visibility[op.id] || {};
        const lordoDue = calculateLordoDue(op.id, op, summary, opVisibility);
        const totalDue = calculateTotalDue(op.id, op, summary, opVisibility);
        
        const ordinaryCost = override.ordinaryCost !== undefined ? Number(override.ordinaryCost) : (op.salaryType === 'fixed' 
            ? (op.fixedSalary || 0) 
            : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));

        const overtimeCost = override.overtimeCost !== undefined ? Number(override.overtimeCost) : (summary.overtimeHours || 0) * (op.overtimeRate || 0);
        
        const finalAbsenceDays = override.absenceDays !== undefined ? override.absenceDays : (summary?.absenceDays || 0);
        const finalOvertimeHours = override.overtimeHours !== undefined ? override.overtimeHours : (summary?.overtimeHours || 0);
        const finalFerieDays = override.ferieDays !== undefined ? override.ferieDays : (summary?.ferieDays || 0);
        const finalPermessoHours = override.permessoHours !== undefined ? override.permessoHours : (summary?.permessoHours || 0);
        const finalMalattiaDays = override.malattiaDays !== undefined ? override.malattiaDays : (summary?.malattiaDays || 0);

        const anticipiAmount = override.anticipiAmount !== undefined 
            ? Number(override.anticipiAmount) 
            : (summary?.anticipiAmount || 0);

        const ordinaryWorkedDaysDisplay = override.ordinaryWorkedDays !== undefined 
            ? override.ordinaryWorkedDays 
            : (summary ? (opVisibility.showWorkedHours ? `${summary.ordinaryWorkedDays || 0} (${summary.ordinaryHours || 0}h)` : (summary.ordinaryWorkedDays || 0)) : 0);

        const allItems = [
            opVisibility.ordinaryWorkedDays !== false ? `GIORNI ORDINARI LAVORATI: ${ordinaryWorkedDaysDisplay}` : null,
            opVisibility.ordinaryCost !== false ? `${op.salaryType === 'fixed' ? 'FISSO MENSILE' : 'TOTALE ORDINARIE'}: ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
            opVisibility.overtimeHours !== false ? `ORE STRAORDINARIE: ${finalOvertimeHours}` : null,
            opVisibility.overtimeCost !== false ? `TOTALE STRAORDINARI: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : null,
            opVisibility.malattiaDays !== false ? `GIORNI DI MALATTIA: ${finalMalattiaDays}`: null,
            opVisibility.permessoHours !== false ? `ORE PERMESSI: ${finalPermessoHours}` : null,
            opVisibility.ferieDays !== false ? `FERIE: ${finalFerieDays}` : null,
            opVisibility.absenceDays !== false ? `ASSENZE: ${finalAbsenceDays}` : null,
        ].filter(Boolean) as string[];

        const bodyData: [string, string][] = [];
        for (let i = 0; i < allItems.length; i += 2) {
            bodyData.push([allItems[i], allItems[i + 1] || '']);
        }

        const periodText = format(currentMonth, 'MMMM yyyy', {locale: it}).toUpperCase();

        return (
            <div key={op.id} className="operator-card text-black flex flex-col justify-start">
                {/* 1. Intestazione */}
                <div className="flex justify-between items-baseline border-b-2 border-black pb-1 mb-2">
                    <p className="font-bold text-lg sm:text-xl text-black uppercase tracking-wide">{op.firstName} {op.lastName}</p>
                    <p className="text-xs sm:text-sm font-bold text-gray-700">MESE: {periodText}</p>
                </div>
                
                {/* 2. Tabella Voci con spaziatura naturale */}
                <table className="w-full text-xs sm:text-sm my-1">
                    <tbody>
                        {bodyData.map((row, i) => (
                            <tr key={i} className="border-b border-gray-100">
                                <td className="py-1 text-gray-800 font-medium">{row[0]}</td>
                                <td className="py-1 text-right font-semibold text-gray-900">{row[1]}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* 3. Totale & Detrazione Anticipi (subito sotto la tabella, senza buchi enormi) */}
                <div className="pt-2.5 mt-2.5 border-t-2 border-gray-400">
                    {anticipiAmount > 0 ? (
                        <div className="flex justify-between items-end gap-2">
                            <div className="text-left text-xs sm:text-sm text-gray-700">
                                <div>Totale Competenze: <span className="font-semibold text-black">{lordoDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span></div>
                                <div className="text-red-600 font-bold">Anticipo già percepito: - {anticipiAmount.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</div>
                            </div>
                            <div className="text-right font-black text-xl sm:text-2xl text-black">
                                <span>NETTO A SALDO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-right font-black text-xl sm:text-2xl text-black">
                            <span>TOTALE DOVUTO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</span>
                        </div>
                    )}
                </div>

                {/* 4. Dicitura Quietanza */}
                <div className="mt-2.5 mb-2.5 italic text-gray-800 text-[11px] sm:text-xs leading-snug bg-gray-50/80 print:bg-transparent p-2.5 rounded border border-gray-200 print:border-gray-300">
                    {anticipiAmount > 0 ? (
                        <p>
                            Io sottoscritto/a, <span className="font-bold not-italic">{op.firstName} {op.lastName}</span>, dichiaro di aver ricevuto dal datore di lavoro la somma netta di <span className="font-bold not-italic">{totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</span> a saldo del periodo <span className="font-bold not-italic">{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>, a fronte di competenze totali maturate per <span className="font-bold not-italic">{lordoDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</span> e detratto l'anticipo sullo stipendio di <span className="font-bold not-italic">{anticipiAmount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</span> già percepito. Rilascio pertanto piena quietanza liberatoria.
                        </p>
                    ) : (
                        <p>
                            Io sottoscritto/a, <span className="font-bold not-italic">{op.firstName} {op.lastName}</span>, dichiaro di aver ricevuto dal datore di lavoro la somma di <span className="font-bold not-italic">{totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</span> a saldo del periodo <span className="font-bold not-italic">{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>, e di accettare integralmente gli importi indicati rilasciando ricevuta.
                        </p>
                    )}
                </div>

                {/* 5. Riga Firma */}
                <div className="pt-1">
                    <p className="text-xs sm:text-sm text-black font-bold">FIRMA PER RICEVUTA E QUIETANZA: __________________________________________</p>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-background text-foreground min-h-screen">
            {/* Stili di stampa: zero margini pagina predefiniti, 2 slot A5 perfetti per foglio A4 (148.5mm ciascuno) */}
            <style jsx global>{`
                @page {
                    size: A4 portrait;
                    margin: 0;
                }
                @media print {
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .no-print {
                        display: none !important;
                    }
                    main {
                        padding: 0 !important;
                        margin: 0 !important;
                        background: white !important;
                        display: block !important;
                    }
                    #print-content {
                        padding: 0 !important;
                        margin: 0 !important;
                        width: 210mm !important;
                        display: block !important;
                    }
                    .print-page {
                        width: 210mm !important;
                        height: 297mm !important;
                        max-height: 297mm !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        box-sizing: border-box !important;
                        display: flex !important;
                        flex-direction: column !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                    }
                    .print-page:last-child {
                        page-break-after: auto !important;
                        break-after: auto !important;
                    }
                    .half-page-slot {
                        width: 210mm !important;
                        height: 148.5mm !important;
                        max-height: 148.5mm !important;
                        box-sizing: border-box !important;
                        padding: 10mm 15mm 6mm 15mm !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: flex-start !important;
                        overflow: hidden !important;
                    }
                    .operator-card {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                }
            `}</style>

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

            <main className="flex flex-col items-center p-4 sm:p-8 bg-gray-300 print:bg-white print:p-0">
                {globalCompact ? (
                    <div id="print-content" className="w-full max-w-4xl bg-white p-6 sm:p-10 shadow-lg print:shadow-none" style={{ width: '210mm' }}>
                        {currentMonth && (
                            <div className="mb-8 text-center border-b-2 border-black pb-4">
                                <h1 className="text-3xl font-bold uppercase">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h1>
                            </div>
                        )}
                        <div className="space-y-4">
                            {filteredOperators.map((op) => {
                                const summary = summaries.get(op.id);
                                if (!summary) return null;
                                const override = manualOverrides[op.id] || {};
                                const opVisibility = visibility[op.id] || {};
                                const lordoDue = calculateLordoDue(op.id, op, summary, opVisibility);
                                const totalDue = calculateTotalDue(op.id, op, summary, opVisibility);
                                const anticipiAmount = override.anticipiAmount !== undefined ? Number(override.anticipiAmount) : (summary?.anticipiAmount || 0);

                                return (
                                    <div key={op.id} className="text-base text-black pb-3 border-b border-dashed border-gray-300">
                                        <div className="flex justify-between items-baseline gap-2">
                                            <p className="font-bold text-xl text-black uppercase whitespace-nowrap">{op.firstName} {op.lastName}</p>
                                            <div className="flex-1 border-b border-dotted border-gray-400 mb-1"></div>
                                            <div className="text-right">
                                                <p className="font-bold text-xl text-black whitespace-nowrap">NETTO: {totalDue.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})}</p>
                                                {anticipiAmount > 0 && (
                                                    <span className="text-xs text-gray-700 font-semibold block">
                                                        (Lordo: {lordoDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} - Anticipo: {anticipiAmount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div id="print-content" className="w-full flex flex-col items-center">
                        {operatorPages.map((pagePair, pageIndex) => {
                            const op1 = pagePair[0];
                            const op2 = pagePair[1];

                            return (
                                <div 
                                    key={pageIndex} 
                                    className="print-page w-full max-w-4xl bg-white shadow-lg print:shadow-none mb-8 print:mb-0 flex flex-col" 
                                    style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}
                                >
                                    {/* Metà superiore (A5 superiore: altezza esatta 148.5mm, parte subito da sopra) */}
                                    <div className="half-page-slot p-6 sm:p-8 print:p-0 flex flex-col justify-start" style={{ minHeight: '148.5mm', height: '148.5mm', boxSizing: 'border-box' }}>
                                        {renderOperatorCard(op1)}
                                    </div>

                                    {/* Metà inferiore (A5 inferiore: altezza esatta 148.5mm, parte esattamente poco sotto la metà foglio) */}
                                    <div className="half-page-slot p-6 sm:p-8 print:p-0 flex flex-col justify-start" style={{ minHeight: '148.5mm', height: '148.5mm', boxSizing: 'border-box' }}>
                                        {op2 && renderOperatorCard(op2)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
            <Toaster />
        </div>
    );
}
