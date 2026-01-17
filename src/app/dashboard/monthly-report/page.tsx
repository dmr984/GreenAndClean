// src/app/dashboard/monthly-report/page.tsx
'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, query, where, Timestamp, getDocs, onSnapshot, doc, setDoc, getDoc } from 'firebase/firestore';
import { Loader2, Calendar as CalendarIcon, Printer, User, Briefcase, Plane, Stethoscope, Coffee, ChevronLeft, ChevronRight, Euro, AlertTriangle, Pencil, Wallet, Trash2, Clock, Plus, UserCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfDay, endOfDay, isWithinInterval, startOfMonth, subMonths, addMonths, endOfMonth as dfnsEndOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { processMonthlyData, DailyDetail, MonthlySummary } from '@/lib/calculations';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';


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
type Request = { type: string; startDate: Timestamp; endDate: Timestamp; hours?: number; };
type Timbratura = { type: string; timestamp: Timestamp; status: string; };

type ManualTotals = {
    ferieDays?: number;
    permessoHours?: number;
    malattiaDays?: number;
};

type VisibilitySettings = {
    workedDays: boolean;
    showWorkedHours: boolean; // New setting
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


const MonthlyReportPage = () => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [operators, setOperators] = useState<Operator[]>([]);
    const [summaries, setSummaries] = useState<Map<string, MonthlySummary>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOperatorIds, setSelectedOperatorIds] = useState<Set<string>>(new Set());
    const [visibility, setVisibility] = useState<Record<string, VisibilitySettings>>({});

    const [manualOverrides, setManualOverrides] = useState<Record<string, ManualTotals>>({});
    const [editingTotal, setEditingTotal] = useState<{ operatorId: string, type: keyof ManualTotals, currentValue: number } | null>(null);
    const [totalContent, setTotalContent] = useState('');

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
            // Initially, select all operators and configure visibilities
            const initialVisibility: Record<string, VisibilitySettings> = {};
            ops.forEach(op => {
                initialVisibility[op.id] = {
                    workedDays: true,
                    showWorkedHours: false,
                    ordinaryHours: true,
                    overtimeHours: true,
                    ferieDays: true,
                    permessoHours: true,
                    malattiaDays: true,
                    absenceDays: true,
                    ordinaryCost: true,
                    overtimeCost: true,
                    holidayCost: false,
                };
            });
            setSelectedOperatorIds(new Set(ops.map(op => op.id)));
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

        try {
            const promises = operators.map(async (op) => {
                const timbratureQuery = query(
                    collection(firestore, `app-users/${op.id}/timbrature`),
                    where('timestamp', '>=', monthStart),
                    where('timestamp', '<=', monthEnd)
                );
                // Fetch all approved requests, not just those starting in the current month,
                // as some might span across months (e.g., ferie).
                const requestsQuery = query(
                    collection(firestore, `app-users/${op.id}/requests`),
                    where('status', '==', 'approvato')
                );
                const straordinariQuery = query(
                    collection(firestore, `app-users/${op.id}/straordinari`),
                    where('date', '>=', monthStart),
                    where('date', '<=', monthEnd)
                );

                const [timbratureSnap, requestsSnap, straordinariSnap] = await Promise.all([
                    getDocs(timbratureQuery),
                    getDocs(requestsQuery),
                    getDocs(straordinariQuery)
                ]);

                const timbratureData = timbratureSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                const requestsData = requestsSnap.docs.map(d => ({...d.data(), id: d.id} as any));
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
            await fetchOverridesForMonth(date);

        } catch (error) {
            console.error("Error fetching monthly report data:", error);
            toast({ title: 'Errore', description: 'Impossibile caricare il report mensile.', variant: 'destructive' });
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
        const operatorIdsString = Array.from(selectedOperatorIds).join(',');
        
        const queryParams = new URLSearchParams({
            month: monthString,
            operators: operatorIdsString,
        });

        // Add visibility params
        for (const operatorId of selectedOperatorIds) {
             const opVisibility = visibility[operatorId] || {};
             for (const key in opVisibility) {
                queryParams.append(`${key}_${operatorId}`, String(opVisibility[key as keyof VisibilitySettings]));
             }
        }

        window.open(`/dashboard/monthly-report/print?${queryParams.toString()}`, '_blank');
    };

    const calculateTotalDue = (op: Operator, summary: MonthlySummary | undefined, visibilitySettings: VisibilitySettings | undefined) => {
        if (!summary || !visibilitySettings) return 0;
        
        const ordinaryCost = (op.salaryType === 'fixed' 
            ? (op.fixedSalary || 0) 
            : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));
        
        const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);
        const holidayCost = (summary.holidayHoursPayable || 0) * (op.hourlyRate || 0);

        let total = 0;
        if (visibilitySettings.ordinaryCost) total += ordinaryCost;
        if (visibilitySettings.overtimeCost) total += overtimeCost;
        if (visibilitySettings.holidayCost) total += holidayCost;
        
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
        
         // Optimistic update
        setManualOverrides(prev => ({
            ...prev,
            [operatorId]: {
                ...(prev[operatorId] || {}),
                [type]: newValue
            }
        }));
        toast({ title: 'Totale Rettificato', description: 'Il nuovo valore è stato salvato in modo permanente.'});
        setEditingTotal(null);
        setTotalContent('');
    };

    const handleVisibilityChange = (operatorId: string, key: keyof VisibilitySettings) => {
        setVisibility(prev => {
            const currentSettings: VisibilitySettings = prev[operatorId] || {
                workedDays: true, showWorkedHours: false, ordinaryHours: true, overtimeHours: true, ferieDays: true,
                permessoHours: true, malattiaDays: true, absenceDays: true, ordinaryCost: true,
                overtimeCost: true, holidayCost: true
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
            default: return 'Rettifica Totale';
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
        const isExtraSwitchVisible = extraSwitchKey ? (opVisibility ? opVisibility[extraSwitchKey] : false) : false;

        return (
            <div className={cn("flex flex-col p-2 border rounded-md transition-all", !isVisible && "bg-muted/50")}>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>{title}</span>
                    <Switch
                        checked={isVisible}
                        onCheckedChange={() => handleVisibilityChange(opId, visibilityKey)}
                        className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                    />
                </div>
                 {isVisible && (
                    <>
                        <div className={cn('font-bold mt-1', manualOverrides[opId]?.[visibilityKey as keyof ManualTotals] !== undefined && 'text-primary')}>
                            {value}
                        </div>
                        {subtext && <span className="text-xs text-muted-foreground">{subtext}</span>}
                        {extraSwitchKey && extraSwitchLabel && (
                            <div className="flex items-center space-x-2 mt-2">
                                <Switch
                                    id={`extra-switch-${opId}`}
                                    checked={isExtraSwitchVisible}
                                    onCheckedChange={() => handleVisibilityChange(opId, extraSwitchKey)}
                                    className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                                />
                                <Label htmlFor={`extra-switch-${opId}`} className="text-xs font-normal">
                                    {extraSwitchLabel}
                                </Label>
                            </div>
                        )}
                    </>
                 )}
            </div>
        );
    };


    return (
        <>
        <div className="space-y-6">
            <Card>
                <CardHeader className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
                    <div>
                        <CardTitle className="text-2xl">Report Mensile Aggregato</CardTitle>
                        <CardDescription>Visualizza i totali di tutti gli operatori per il mese selezionato.</CardDescription>
                    </div>
                     <Button onClick={handleOpenPrintPreview} disabled={isLoading} className="w-full sm:w-auto">
                        <Printer className="mr-2 h-4 w-4" /> Crea Report Stampabile
                    </Button>
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
                        <div className="flex items-center space-x-2 mb-4 p-2 border rounded-md">
                           <Checkbox
                                id="select-all"
                                checked={selectedOperatorIds.size === operators.length}
                                onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                            />
                            <Label htmlFor="select-all" className="font-semibold">Seleziona/Deseleziona Tutto</Label>
                        </div>
                        <div className="space-y-4">
                            {operators.map(op => {
                                const summary = summaries.get(op.id);
                                const override = manualOverrides[op.id];
                                const opVisibility = visibility[op.id] || {} as VisibilitySettings;
                                const totalDue = calculateTotalDue(op, summary, opVisibility);
                                
                                const finalFerieDays = override?.ferieDays ?? summary?.ferieDays ?? 0;
                                const finalPermessoHours = override?.permessoHours ?? summary?.permessoHours ?? 0;
                                const finalMalattiaDays = override?.malattiaDays ?? summary?.malattiaDays ?? 0;

                                const ordinaryCost = (op.salaryType === 'fixed' 
                                    ? (op.fixedSalary || 0) 
                                    : (summary?.ordinaryHours || 0) * (op.hourlyRate || 0));

                                const overtimeCost = (summary?.overtimeHours || 0) * (op.overtimeRate || 0);
                                const holidayCost = (summary?.holidayHoursPayable || 0) * (op.hourlyRate || 0);
                                
                                const workedDaysValue = opVisibility.showWorkedHours && summary
                                    ? `${summary.workedDays} (${summary.ordinaryHours}h)`
                                    : summary?.workedDays || 0;

                                return (
                                    <Card key={op.id}>
                                        <CardHeader>
                                            <div className='flex justify-between items-start'>
                                                <div className="flex items-center gap-4">
                                                    <Checkbox
                                                        id={`select-${op.id}`}
                                                        checked={selectedOperatorIds.has(op.id)}
                                                        onCheckedChange={(checked) => handleSelectOperator(op.id, Boolean(checked))}
                                                    />
                                                    <Link href={`/dashboard/operators/${op.id}/end-of-month`}>
                                                        <CardTitle className="hover:underline">{op.firstName} {op.lastName}</CardTitle>
                                                        <CardDescription>Codice: {op.username}</CardDescription>
                                                    </Link>
                                                </div>
                                                <div className='font-semibold text-lg flex items-center gap-2'><Euro className="h-5 w-5" />{totalDue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                            </div>
                                        </CardHeader>
                                        {summary && (
                                            <CardContent className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-2 text-sm">
                                                <InfoCard opId={op.id} title="Giorni Lavorati" value={workedDaysValue} icon={Briefcase} visibilityKey="workedDays" extraSwitchKey="showWorkedHours" extraSwitchLabel="Mostra Ore" />
                                                <InfoCard opId={op.id} title={op.salaryType === 'fixed' ? 'Fisso Mensile' : 'Costo Ordinarie'} value={`${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} icon={Euro} visibilityKey="ordinaryCost" />
                                                <InfoCard opId={op.id} title="Ore Straordinarie" value={summary.overtimeHours} icon={Plus} visibilityKey="overtimeHours" />
                                                <InfoCard opId={op.id} title="Costo Straordinari" value={`${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} icon={Euro} visibilityKey="overtimeCost" />
                                                <InfoCard opId={op.id} title="Malattia (g)" value={finalMalattiaDays} icon={Stethoscope} visibilityKey="malattiaDays" />
                                                <InfoCard opId={op.id} title="Permessi (h)" value={finalPermessoHours} icon={UserCheck} visibilityKey="permessoHours" />
                                                <InfoCard opId={op.id} title="Ferie (g)" value={finalFerieDays} icon={Plane} visibilityKey="ferieDays" />
                                                <InfoCard opId={op.id} title="Costo Ferie" value={`${holidayCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} icon={Euro} visibilityKey="holidayCost" />
                                                <InfoCard opId={op.id} title="Assenze (g)" value={summary.absenceDays} icon={AlertTriangle} visibilityKey="absenceDays" />
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
                    <Label htmlFor="total-content" className="capitalize">{`Totale ${editingTotal?.type.replace('Days', ' (giorni)').replace('Hours', ' (ore)')}`}</Label>
                    <Input
                        id="total-content"
                        type="number"
                        value={totalContent}
                        onChange={(e) => setTotalContent(e.target.value)}
                        placeholder="Es: 10"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingTotal(null)}>Annulla</Button>
                    <Button onClick={handleSaveTotal}>Salva Rettifica</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
};

export default MonthlyReportPage;
