// src/app/dashboard/monthly-report/page.tsx
'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, query, where, Timestamp, getDocs, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Loader2, Calendar as CalendarIcon, Printer, User, Briefcase, Plane, Stethoscope, Coffee, ChevronLeft, ChevronRight, Euro, AlertTriangle, Pencil } from 'lucide-react';
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

const MonthlyReportPage = () => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [operators, setOperators] = useState<Operator[]>([]);
    const [summaries, setSummaries] = useState<Map<string, MonthlySummary>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOperatorIds, setSelectedOperatorIds] = useState<Set<string>>(new Set());

    const [manualOverrides, setManualOverrides] = useState<Record<string, ManualTotals>>({});
    const [editingTotal, setEditingTotal] = useState<{ operatorId: string, type: keyof ManualTotals, currentValue: number } | null>(null);
    const [totalContent, setTotalContent] = useState('');

    const fetchOverridesForMonth = useCallback(async (date: Date) => {
        if (!firestore || operators.length === 0) return;

        const monthId = format(date, 'yyyy-MM');
        const newOverrides: Record<string, ManualTotals> = {};

        for (const op of operators) {
            const overrideDocRef = doc(firestore, `app-users/${op.id}/monthly-overrides`, monthId);
            const docSnap = await getDoc(overrideDocRef);
            if (docSnap.exists()) {
                newOverrides[op.id] = docSnap.data();
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
            // Initially, select all operators
            setSelectedOperatorIds(new Set(ops.map(op => op.id)));
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

                const [timbratureSnap, requestsSnap] = await Promise.all([
                    getDocs(timbratureQuery),
                    getDocs(requestsQuery),
                ]);

                const timbratureData = timbratureSnap.docs.map(d => ({...d.data(), id: d.id} as any));
                const requestsData = requestsSnap.docs.map(d => ({...d.data(), id: d.id} as any));

                const { monthlySummary } = processMonthlyData(date, op, { timbrature: timbratureData, requests: requestsData });
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

        window.open(`/dashboard/monthly-report/print?${queryParams.toString()}`, '_blank');
    };

    const calculateTotalDue = (op: Operator, summary: MonthlySummary | undefined, override?: ManualTotals) => {
        if (!summary) return 0;
        
        const finalOvertime = summary.overtimeHours || 0;
        const overtimeCost = finalOvertime * (op.overtimeRate || 0);

        if (op.salaryType === 'fixed') {
            return (op.fixedSalary || 0) + overtimeCost;
        } else {
            const payableOrdinaryHours = (summary.ordinaryHours || 0) + (summary.holidayHoursPayable || 0);
            const ordinaryCost = payableOrdinaryHours * (op.hourlyRate || 0);
            return ordinaryCost + overtimeCost;
        }
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

    const handleEditTotal = (operatorId: string, type: keyof ManualTotals) => {
        const summary = summaries.get(operatorId);
        const override = manualOverrides[operatorId];
        let currentValue = 0;

        switch(type) {
            case 'ferieDays': currentValue = override?.ferieDays ?? summary?.ferieDays ?? 0; break;
            case 'permessoHours': currentValue = override?.permessoHours ?? summary?.permessoHours ?? 0; break;
            case 'malattiaDays': currentValue = override?.malattiaDays ?? summary?.malattiaDays ?? 0; break;
        }
        
        setEditingTotal({ operatorId, type, currentValue });
        setTotalContent(String(currentValue));
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
            .then(() => {
                setManualOverrides(prev => ({
                    ...prev,
                    [operatorId]: {
                        ...(prev[operatorId] || {}),
                        [type]: newValue
                    }
                }));
                 toast({ title: 'Totale Rettificato', description: 'Il nuovo valore è stato salvato in modo permanente.'});
            })
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
    };


    const getDialogTitleForType = (type?: keyof ManualTotals) => {
        switch (type) {
            case 'ferieDays': return 'Rettifica Ferie (giorni)';
            case 'permessoHours': return 'Rettifica Permessi (ore)';
            case 'malattiaDays': return 'Rettifica Malattia (giorni)';
            default: return 'Rettifica Totale';
        }
    }


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
                                const totalDue = calculateTotalDue(op, summary, override);
                                
                                const finalFerieDays = override?.ferieDays ?? summary?.ferieDays ?? 0;
                                const finalPermessoHours = override?.permessoHours ?? summary?.permessoHours ?? 0;
                                const finalMalattiaDays = override?.malattiaDays ?? summary?.malattiaDays ?? 0;

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
                                            <CardContent className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-4 gap-4 pt-2 text-sm">
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Giorni Lavorati</span><span className='font-bold'>{summary.workedDays}</span></div>
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Ore Ordinarie</span><span className='font-bold'>{summary.ordinaryHours}h</span></div>
                                                <div className="flex flex-col p-2 border rounded-md"><span className="text-xs text-muted-foreground">Straordinari</span><span className='font-bold'>{summary.overtimeHours}h</span></div>
                                                
                                                <div className="flex flex-col p-2 border rounded-md">
                                                    <span className="text-xs text-muted-foreground flex justify-between items-center">Ferie (g) <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleEditTotal(op.id, 'ferieDays')}><Pencil className="h-3 w-3"/></Button></span>
                                                    <span className={cn('font-bold', override?.ferieDays !== undefined && 'text-primary')}>{finalFerieDays}</span>
                                                </div>

                                                 <div className="flex flex-col p-2 border rounded-md">
                                                    <span className="text-xs text-muted-foreground flex justify-between items-center">Permessi (h) <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleEditTotal(op.id, 'permessoHours')}><Pencil className="h-3 w-3"/></Button></span>
                                                    <span className={cn('font-bold', override?.permessoHours !== undefined && 'text-primary')}>{finalPermessoHours}</span>
                                                </div>
                                                
                                                 <div className="flex flex-col p-2 border rounded-md">
                                                    <span className="text-xs text-muted-foreground flex justify-between items-center">Malattia (g) <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleEditTotal(op.id, 'malattiaDays')}><Pencil className="h-3 w-3"/></Button></span>
                                                    <span className={cn('font-bold', override?.malattiaDays !== undefined && 'text-primary')}>{finalMalattiaDays}</span>
                                                </div>

                                                <div className="flex flex-col p-2 border rounded-md text-destructive"><span className="text-xs">Assenze (g)</span><span className='font-bold'>{summary.absenceDays}</span></div>
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
