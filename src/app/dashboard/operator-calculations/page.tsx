
'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, query, where, Timestamp, getDocs, onSnapshot, doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { Loader2, Printer, Download, Euro, Trash2, Pencil, Plus, ChevronLeft, ChevronRight, AlertTriangle, Briefcase, Plane, Stethoscope, UserCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth as dfnsEndOfMonth, subMonths, addMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, MonthlySummary } from '@/lib/calculations';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { generateDetailedOperatorPdf } from '@/lib/pdf-utility';


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
    scheduleType?: 'daily' | 'monthly';
};

type ManualTotals = {
    ferieDays?: number;
    permessoHours?: number;
    malattiaDays?: number;
    totalDueOverride?: number;
};

type VisibilitySettings = {
    workedDays: boolean;
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


const OperatorCalculationsPage = () => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [operators, setOperators] = useState<Operator[]>([]);
    const [summaries, setSummaries] = useState<Map<string, { summary: MonthlySummary, details: any[] }>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOperatorIds, setSelectedOperatorIds] = useState<Set<string>>(new Set());
    const [visibility, setVisibility] = useState<Record<string, VisibilitySettings>>({});
    const [globalCompactMode, setGlobalCompactMode] = useState(false);

    const [manualOverrides, setManualOverrides] = useState<Record<string, ManualTotals>>({});
    const [editingTotal, setEditingTotal] = useState<{ operatorId: string, type: keyof ManualTotals, currentValue: number } | null>(null);
    const [totalContent, setTotalContent] = useState('');

    const [isCleaning, setIsCleaning] = useState(false);
    const [isCleanConfirmOpen, setIsCleanConfirmOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);


    const fetchOverridesForMonth = useCallback(async (date: Date) => {
        if (!firestore || operators.length === 0) return;

        const monthId = format(date, 'yyyy-MM');
        const newOverrides: Record<string, ManualTotals> = {};

        for (const op of operators) {
            const overrideDocRef = doc(firestore, `app-users/${op.id}/monthly-overrides`, monthId);
            try {
                const docSnap = await getDoc(overrideDocRef);
                if (docSnap.exists()) {
                    newOverrides[op.id] = docSnap.data();
                }
            } catch (error: any) {
                 if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        operation: 'get',
                        path: overrideDocRef.path
                    }));
                } else {
                    console.error(`Error fetching override for operator ${op.id}:`, error);
                }
            }
        }
        setManualOverrides(newOverrides);

    }, [firestore, operators]);


    useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ops = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Operator));
            ops.sort((a,b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
            setOperators(ops);
            // Configure visibilities
            const initialVisibility: Record<string, VisibilitySettings> = {};
            ops.forEach(op => {
                initialVisibility[op.id] = {
                    workedDays: true,
                    showWorkedHours: true, 
                    ordinaryHours: true,
                    overtimeHours: true,
                    ferieDays: true,
                    permessoHours: true,
                    malattiaDays: true,
                    absenceDays: true,
                    ordinaryCost: true,
                    overtimeCost: true,
                    ferieCost: true,
                    permessoCost: true,
                    malattiaCost: true,
                    compactMode: false,
                };
            });
            setVisibility(initialVisibility);
        });
        return () => unsubscribe();
    }, [firestore]);

    const fetchDataForMonth = useCallback(async (date: Date) => {
        if (!firestore || operators.length === 0) {
            if (operators.length > 0) setIsLoading(false);
            return;
        }
        setIsLoading(true);

        const monthStart = startOfMonth(date);
        const monthEnd = dfnsEndOfMonth(date);
        
        const queryStart = subMonths(monthStart, 1);
        const queryEnd = addMonths(monthEnd, 1);

        try {
            const promises = operators.map(async (op) => {
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

                const timbratureData = timbratureSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                const requestsData = requestsSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                const straordinariData = straordinariSnap.docs.map(d => ({...d.data(), id: d.id} as any));

                const { monthlySummary, dailyDetails } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData, straordinari: straordinariData });
                return { opId: op.id, summary: monthlySummary, details: dailyDetails };
            });

            const results = await Promise.all(promises);
            const newSummaries = new Map<string, { summary: MonthlySummary, details: any[] }>();
            results.forEach(({ opId, summary, details }) => {
                if (summary) newSummaries.set(opId, { summary, details });
            });
            setSummaries(newSummaries);
            await fetchOverridesForMonth(date);

        } catch (error) {
            console.error("Error fetching monthly report data:", error);
            toast({ title: 'Errore', description: 'Impossibile caricare le report mensile.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, operators, toast, fetchOverridesForMonth]);

    useEffect(() => {
        if (operators.length > 0) {
            fetchDataForMonth(currentMonth);
        } else if (operators.length === 0) {
             setIsLoading(false);
        }
    }, [currentMonth, operators, fetchDataForMonth]);

    const handleMonthChange = (offset: number) => {
        setCurrentMonth(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };
    
    const handleOpenPrintPreview = () => {
        if (selectedOperatorIds.size === 0) {
            toast({ title: 'Nessun operatore selezionato', description: 'Seleziona almeno un operatore da includere nel report.', variant: 'destructive'});
            return;
        }

        const monthString = format(currentMonth, 'yyyy-MM');
        
        // Apertura report separati dettagliati (Fine Mese Operatore)
        Array.from(selectedOperatorIds).forEach(operatorId => {
            const queryParams = new URLSearchParams({
                month: monthString
            });

            // Reindirizziamo alla rotta del report di fine mese dettagliato per l'operatore specifico
            window.open(`/dashboard/operators/${operatorId}/end-of-month/print?${queryParams.toString()}`, '_blank');
        });
    };

    const handleDownloadSelectedPdfs = async () => {
        if (selectedOperatorIds.size === 0) return;
        setIsDownloading(true);
        try {
            const selectedOperators = operators.filter(op => selectedOperatorIds.has(op.id));
            for (const op of selectedOperators) {
                const data = summaries.get(op.id);
                if (data) {
                    const result = await generateDetailedOperatorPdf(
                        currentMonth,
                        op,
                        data.summary,
                        data.details,
                        visibility[op.id] || {},
                        manualOverrides[op.id] || {}
                    );
                    if (result) {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(result.blob);
                        a.download = result.fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(a.href);
                        // Small delay to prevent browser download throttling
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
            }
            toast({ title: 'Download completato', description: `${selectedOperatorIds.size} report scaricati correttamente.` });
        } catch (error) {
            console.error("Error downloading PDFs:", error);
            toast({ title: 'Errore durante il download', variant: 'destructive' });
        } finally {
            setIsDownloading(false);
        }
    };

    const calculateTotalDue = (opId: string, op: Operator, summary: MonthlySummary | undefined, visibilitySettings: VisibilitySettings | undefined) => {
        const override = manualOverrides[opId];
        if (override?.totalDueOverride !== undefined) {
            return override.totalDueOverride;
        }
        
        if (!summary || !visibilitySettings) return 0;
        const summaryData = (summary as any).summary || summary; // Handle both old and new format during transition
        
        const ordinaryCost = (op.salaryType === 'fixed' 
            ? (op.fixedSalary || 0) 
            : (summaryData.ordinaryHours || 0) * (op.hourlyRate || 0));
        
        const overtimeCost = (summaryData.overtimeHours || 0) * (op.overtimeRate || 0);
        const ferieCost = summaryData.ferieCost || 0;
        const permessoCost = summaryData.permessoCost || 0;
        const malattiaCost = summaryData.malattiaCost || 0;

        let total = 0;
        if (visibilitySettings.ordinaryCost) total += ordinaryCost;
        if (visibilitySettings.overtimeCost) total += overtimeCost;
        if (visibilitySettings.ferieCost) total += ferieCost;
        if (visibilitySettings.permessoCost) total += permessoCost;
        if (visibilitySettings.malattiaCost) total += malattiaCost;
        
        return total;
    }
    
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedOperatorIds(new Set(operators.map(op => op.id)));
        } else {
            setSelectedOperatorIds(new Set());
        }
    };

    const handleSelectOperator = (operatorId: string, checked: boolean) => {
        setSelectedOperatorIds(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(operatorId);
            } else {
                newSet.delete(operatorId);
            }
            return newSet;
        });
    };

    const handleCleanMonth = async () => {
        if (!firestore || selectedOperatorIds.size === 0 || !currentMonth) return;
        setIsCleaning(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = dfnsEndOfMonth(currentMonth);
        const batch = writeBatch(firestore);

        try {
            for (const operatorId of Array.from(selectedOperatorIds)) {
                // Timbrature
                const timbratureQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('timestamp', '>=', monthStart), where('timestamp', '<=', monthEnd));
                const timbratureSnap = await getDocs(timbratureQuery);
                timbratureSnap.forEach(doc => batch.delete(doc.ref));

                // Straordinari
                const straordinariQuery = query(collection(firestore, `app-users/${operatorId}/straordinari`), where('date', '>=', monthStart), where('date', '<=', monthEnd));
                const straordinariSnap = await getDocs(straordinariQuery);
                straordinariSnap.forEach(doc => batch.delete(doc.ref));

                // Requests
                const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('startDate', '>=', monthStart), where('startDate', '<=', monthEnd));
                const requestsSnap = await getDocs(requestsQuery);
                requestsSnap.forEach(doc => batch.delete(doc.ref));

                // Daily Notes
                const notesQuery = query(collection(firestore, `app-users/${operatorId}/daily-notes`), where('__name__', '>=', format(monthStart, 'yyyy-MM-dd')), where('__name__', '<=', format(monthEnd, 'yyyy-MM-dd')));
                const notesSnap = await getDocs(notesQuery);
                notesSnap.forEach(doc => batch.delete(doc.ref));

                // Monthly Overrides
                const monthId = format(currentMonth, 'yyyy-MM');
                const overrideDocRef = doc(firestore, `app-users/${operatorId}/monthly-overrides`, monthId);
                batch.delete(overrideDocRef);
            }

            await batch.commit();
            toast({ title: "Successo!", description: `I dati per gli operatori selezionati sono stati eliminati per ${format(currentMonth, 'MMMM yyyy', { locale: it })}.` });
            fetchDataForMonth(currentMonth);
            setSelectedOperatorIds(new Set());
        } catch (error) {
            console.error("Errore pulizia mese:", error);
            toast({ title: "Errore", description: "Impossibile completare la pulizia.", variant: "destructive" });
        } finally {
            setIsCleaning(false);
            setIsCleanConfirmOpen(false);
        }
    };
    
    const handleSaveTotal = async () => {
        if (!editingTotal || !firestore) return;
        const { operatorId, type } = editingTotal;
        const monthId = format(currentMonth, 'yyyy-MM');
        const overrideDocRef = doc(firestore, `app-users/${operatorId}/monthly-overrides`, monthId);

        const newValue = parseFloat(totalContent);
        if (isNaN(newValue)) {
            toast({ title: 'Valore non valido', variant: 'destructive'});
            return;
        }
        
        const updateData = { [type]: newValue };

        setDoc(overrideDocRef, updateData, { merge: true })
            .catch(error => {
                if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        operation: 'write',
                        path: overrideDocRef.path,
                        requestResourceData: updateData
                    }));
                } else {
                    console.error("Error saving override:", error);
                    toast({ title: 'Errore', description: 'Impossibile salvare la rettifica.', variant: 'destructive' });
                }
            })
            .finally(() => {
                setEditingTotal(null);
                setTotalContent('');
            });
        
        setManualOverrides(prev => ({
            ...prev,
            [operatorId]: {
                ...(prev[operatorId] || {}),
                [type]: newValue
            }
        }));
        toast({ title: 'Rettifica Salvata', description: 'Il nuovo valore è stato salvato in modo permanente per questo mese.'});
        setEditingTotal(null);
        setTotalContent('');
    };

    const handleVisibilityChange = (operatorId: string, key: keyof VisibilitySettings) => {
        setVisibility(prev => {
            const currentSettings: VisibilitySettings = prev[operatorId] || {
                workedDays: true, showWorkedHours: true, ordinaryHours: true, overtimeHours: true, ferieDays: true,
                permessoHours: true, malattiaDays: true, absenceDays: true, ordinaryCost: true,
                overtimeCost: true, ferieCost: true, permessoCost: true, malattiaCost: true, compactMode: false,
            };
            return {
                ...prev,
                [operatorId]: { ...currentSettings, [key]: !currentSettings[key] }
            };
        });
    };

    const getDialogTitleForType = (type?: keyof ManualTotals) => {
        switch (type) {
            case 'ferieDays': return 'Rettifica Ferie (giorni)';
            case 'permessoHours': return 'Rettifica Permessi (ore)';
            case 'malattiaDays': return 'Rettifica Malattia (giorni)';
            case 'totalDueOverride': return 'Rettifica Totale Dovuto (€)';
            default: return 'Rettifica Valore';
        }
    }

    const InfoCard = ({
        opId,
        title,
        value,
        subtext,
        icon: Icon,
        visibilityKey,
        extraSwitchKey,
        extraSwitchLabel
    }: {
        opId: string;
        title: string;
        value: string | number;
        subtext?: string;
        icon: React.ElementType;
        visibilityKey: keyof VisibilitySettings;
        extraSwitchKey?: keyof VisibilitySettings;
        extraSwitchLabel?: string;
    }) => {
        const opVisibility = visibility[opId];
        const isVisible = opVisibility ? opVisibility[visibilityKey] : true;
        const isExtraSwitchVisible = extraSwitchKey ? (opVisibility ? opVisibility[extraSwitchKey] : true) : false;

        return (
            <div className={cn("flex justify-between items-center p-3 border rounded-md transition-all", !isVisible && "bg-muted/50")}>
                <div className="flex flex-col flex-1">
                    <div className="flex items-center text-xs text-muted-foreground gap-1.5 mb-1.5">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="font-medium">{title}</span>
                    </div>
                     {isVisible ? (
                        <>
                            <div className={cn('text-lg font-bold leading-none', manualOverrides[opId]?.[visibilityKey as keyof ManualTotals] !== undefined && 'text-primary')}>
                                {value}
                            </div>
                            {subtext && <span className="text-xs text-muted-foreground mt-1">{subtext}</span>}
                            {extraSwitchKey && extraSwitchLabel && (
                                <div className="flex items-center space-x-2 mt-2.5">
                                    <Switch
                                        id={`extra-switch-${opId}`}
                                        checked={isExtraSwitchVisible}
                                        onCheckedChange={() => handleVisibilityChange(opId, extraSwitchKey)}
                                        className="h-3 w-6 [&>span]:h-2 [&>span]:w-2 [&>span]:data-[state=checked]:translate-x-3"
                                    />
                                    <Label htmlFor={`extra-switch-${opId}`} className="text-[10px] font-normal uppercase text-muted-foreground">
                                        {extraSwitchLabel}
                                    </Label>
                                </div>
                            )}
                        </>
                     ) : (
                        <div className="text-lg font-bold leading-none text-muted-foreground line-through opacity-40">
                            {value}
                        </div>
                     )}
                </div>
                <div className="flex flex-col items-end justify-start self-stretch pt-0.5 pl-2 border-l border-border/50 ml-2">
                    <Switch
                        checked={isVisible}
                        onCheckedChange={() => handleVisibilityChange(opId, visibilityKey)}
                        className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                    />
                </div>
            </div>
        );
    };


    return (
        <>
        <div className="space-y-6">
            <Card>
                <CardHeader className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
                    <div>
                        <CardTitle className="text-2xl">
                            {globalCompactMode 
                                ? format(currentMonth, 'MMMM yyyy', { locale: it }) 
                                : 'Situazione Attuale Operatori'}
                        </CardTitle>
                        <CardDescription>Visualizza i calcoli di tutti gli operatori per il mese selezionato.</CardDescription>
                    </div>
                     <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Button onClick={handleDownloadSelectedPdfs} disabled={isLoading || selectedOperatorIds.size === 0 || isDownloading} variant="outline" className="border-primary text-primary hover:bg-primary/10">
                            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Scarica PDF Selezionati
                        </Button>
                        <Button onClick={handleOpenPrintPreview} disabled={isLoading || selectedOperatorIds.size === 0}>
                            <Printer className="mr-2 h-4 w-4" /> Anteprima di Stampa
                        </Button>
                         <Button variant="destructive" onClick={() => setIsCleanConfirmOpen(true)} disabled={isLoading || selectedOperatorIds.size === 0}>
                            <Trash2 className="mr-2 h-4 w-4" /> Pulisci Mese
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                     <div className="flex items-center justify-between gap-2 p-2 border rounded-md mb-6 w-full md:w-auto">
                        <Button variant="outline" size="icon" onClick={() => handleMonthChange(-1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                        <Button variant="outline" size="icon" onClick={() => handleMonthChange(1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    
                    {isLoading ? (
                         <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : operators.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">Nessun operatore trovato. Aggiungine uno dalla sezione "Gestione Operatori".</p>
                    ) : (
                        <>
                        <div className="flex flex-wrap items-center gap-4 mb-4 p-2 border rounded-md bg-muted/20">
                           <div className="flex items-center space-x-2">
                               <Checkbox
                                    id="select-all"
                                    checked={selectedOperatorIds.size === operators.length && operators.length > 0}
                                    onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                                />
                                <Label htmlFor="select-all" className="font-semibold cursor-pointer">Seleziona Tutto</Label>
                            </div>
                            <Separator orientation="vertical" className="hidden sm:block h-6" />
                            <div className="flex items-center space-x-2">
                                <Switch 
                                    id="global-compact" 
                                    checked={globalCompactMode} 
                                    onCheckedChange={setGlobalCompactMode} 
                                />
                                <Label htmlFor="global-compact" className="font-semibold cursor-pointer text-primary">Vista Sintetica Globale</Label>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {operators.map(op => {
                                const data = summaries.get(op.id);
                                const summaryData = data?.summary;
                                const override = manualOverrides[op.id];
                                const opVisibility = visibility[op.id] || { compactMode: false } as VisibilitySettings;
                                const isCompact = globalCompactMode || opVisibility.compactMode;
                                const totalDue = calculateTotalDue(op.id, op, data?.summary, opVisibility);
                                
                                const finalFerieDays = override?.ferieDays ?? summaryData?.ferieDays ?? 0;
                                const finalPermessoHours = override?.permessoHours ?? summaryData?.permessoHours ?? 0;
                                const finalMalattiaDays = override?.malattiaDays ?? summaryData?.malattiaDays ?? 0;

                                const ordinaryCost = (op.salaryType === 'fixed' 
                                    ? (op.fixedSalary || 0) 
                                    : (summaryData?.ordinaryHours || 0) * (op.hourlyRate || 0));

                                const overtimeCost = (summaryData?.overtimeHours || 0) * (op.overtimeRate || 0);
                                const ferieCost = summaryData?.ferieCost || 0;
                                const permessoCost = summaryData?.permessoCost || 0;
                                const malattiaCost = summaryData?.malattiaCost || 0;
                                
                                const workedDaysValue = opVisibility.showWorkedHours && summaryData
                                    ? `${summaryData.workedDays} (${summaryData.ordinaryHours}h)`
                                    : summaryData?.workedDays || 0;

                                return (
                                    <Card key={op.id} className={cn(isCompact && "border-primary/20 bg-muted/10")}>
                                        <CardHeader className={cn(isCompact && "py-3")}>
                                            <div className='flex justify-between items-start'>
                                                <div className="flex items-center gap-4">
                                                    <Checkbox
                                                        id={`select-${op.id}`}
                                                        checked={selectedOperatorIds.has(op.id)}
                                                        onCheckedChange={(checked) => handleSelectOperator(op.id, Boolean(checked))}
                                                    />
                                                    <Link href={`/dashboard/operators/${op.id}/end-of-month`}>
                                                        <CardTitle className="hover:underline text-lg">{op.firstName} {op.lastName}</CardTitle>
                                                        {!isCompact && <CardDescription>Codice: {op.username}</CardDescription>}
                                                    </Link>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <div className='font-bold text-lg flex items-center gap-2'>
                                                        <Euro className="h-5 w-5" />
                                                        <span className={cn(override?.totalDueOverride !== undefined && "text-primary underline decoration-dotted")}>
                                                            {totalDue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-6 w-6 ml-1" 
                                                            onClick={() => {
                                                                setEditingTotal({ operatorId: op.id, type: 'totalDueOverride', currentValue: totalDue });
                                                                setTotalContent(String(totalDue));
                                                            }}
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    {!globalCompactMode && (
                                                        <div className="flex items-center gap-2">
                                                            <Label htmlFor={`compact-${op.id}`} className="text-xs text-muted-foreground">Vista Sintetica</Label>
                                                            <Switch
                                                                id={`compact-${op.id}`}
                                                                checked={opVisibility.compactMode}
                                                                onCheckedChange={() => handleVisibilityChange(op.id, 'compactMode')}
                                                                className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>
                                        {summaryData && !isCompact && (
                                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0 pb-4">
                                                <InfoCard opId={op.id} title="Giorni Lavorati" value={workedDaysValue} icon={Briefcase} visibilityKey="workedDays" extraSwitchKey="showWorkedHours" extraSwitchLabel="Mostra Ore" />
                                                <InfoCard opId={op.id} title={op.salaryType === 'fixed' ? 'Fisso Mensile' : 'Totale Ordinarie'} value={`${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} icon={Euro} visibilityKey="ordinaryCost" />
                                                
                                                <InfoCard opId={op.id} title="Ore Straordinarie" value={summaryData.overtimeHours} icon={Plus} visibilityKey="overtimeHours" />
                                                <InfoCard opId={op.id} title="Totale Straordinari" value={`${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} icon={Euro} visibilityKey="overtimeCost" />
                                                
                                                <InfoCard opId={op.id} title="Ferie (h)" value={finalFerieDays} icon={Plane} visibilityKey="ferieDays" subtext={summaryData.ferieHours ? `(${summaryData.ferieHours}h)` : ''} />
                                                <InfoCard opId={op.id} title="Totale Ferie" value={`${ferieCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} icon={Euro} visibilityKey="ferieCost" />
                                                
                                                {!(op.scheduleType === 'monthly' && finalPermessoHours === 0) && (
                                                    <>
                                                        <InfoCard opId={op.id} title="Permessi (h)" value={finalPermessoHours} icon={UserCheck} visibilityKey="permessoHours" />
                                                        <InfoCard opId={op.id} title="Totale Permessi" value={`${permessoCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} icon={Euro} visibilityKey="permessoCost" />
                                                    </>
                                                )}
                                                
                                                <InfoCard opId={op.id} title="Malattia (g)" value={finalMalattiaDays} icon={Stethoscope} visibilityKey="malattiaDays" />
                                                <InfoCard opId={op.id} title="Totale Malattia" value={`${malattiaCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} icon={Euro} visibilityKey="malattiaCost" />
                                                
                                                <InfoCard opId={op.id} title="Assenze (g)" value={summaryData.absenceDays} icon={AlertTriangle} visibilityKey="absenceDays" />
                                            </CardContent>
                                        )}
                                    </Card>
                                )
                            })}
                        </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>

        <Dialog open={!!editingTotal} onOpenChange={(open) => !open && setEditingTotal(null)}>
            <DialogContent>
                 <DialogHeader>
                    <DialogTitle className='capitalize'>{getDialogTitleForType(editingTotal?.type)}</DialogTitle>
                     <DialogDescription>
                        Inserisci il valore totale che vuoi assegnare per questo mese. Questa modifica è permanente per questo mese.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="total-content" className="capitalize">
                        {editingTotal?.type === 'totalDueOverride' ? 'Nuovo Totale Dovuto (€)' : `Totale ${editingTotal?.type.replace('Days', ' (giorni)').replace('Hours', ' (ore)')}`}
                    </Label>
                    <Input
                        id="total-content"
                        type="number"
                        value={totalContent}
                        onChange={(e) => setTotalContent(e.target.value)}
                        placeholder="Es: 1500.00"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingTotal(null)}>Annulla</Button>
                    <Button onClick={handleSaveTotal}>Salva Rettifica</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <AlertDialog open={isCleanConfirmOpen} onOpenChange={setIsCleanConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione è irreversibile. Verranno eliminati TUTTI i dati (turni, richieste, note, etc.) per gli operatori selezionati nel mese di{' '}
                        <span className="font-bold">{currentMonth ? format(currentMonth, 'MMMM yyyy', { locale: it }) : ''}</span>.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCleanMonth} disabled={isCleaning}>
                        {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Conferma e Pulisci
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
};

export default OperatorCalculationsPage;
