// src/app/dashboard/operators/[operatorId]/end-of-month/page.tsx

'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs, writeBatch, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, AlertTriangle, Printer, RefreshCw, Archive, Share2, FileText, Download, X, ChevronLeft, ChevronRight, Euro, Pencil } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useParams, useRouter } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, set, parse } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { processMonthlyData, calculateShiftDetails, type DailyDetail, type MonthlySummary, calculateHours, calculatePureOvertime } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


// Type definitions are now in calculations.ts
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
    hourlyRate?: number;
    overtimeRate?: number;
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

type DailyNote = {
    note: string;
    date: string;
}

const SummaryCard = ({ title, value, icon: Icon, subtext, className, onEdit }: { title: string, value: string | number, icon: React.ElementType, subtext?: string, className?: string, onEdit?: () => void }) => (
    <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <div className='flex items-center gap-1'>
                 {onEdit && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>}
                <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
        </CardContent>
    </Card>
);

const InfoBox = ({ label, value }: { label: string, value: string }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
    </div>
);


export default function EndOfMonthPage() {
    const firestore = useFirestore();
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const operatorId = params.operatorId as string;
    
    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[], dailyNotes: DailyNote[] }>({ timbrature: [], requests: [], dailyNotes: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [isCleanConfirmOpen, setIsCleanConfirmOpen] = useState(false);
    
    const [editingNote, setEditingNote] = useState<{ date: Date, currentNote: string } | null>(null);
    const [noteContent, setNoteContent] = useState('');

    const [editingTotal, setEditingTotal] = useState<{ type: 'ferie' | 'permesso' | 'malattia', currentValue: number } | null>(null);
    const [totalContent, setTotalContent] = useState('');


    useEffect(() => {
        // Set the initial month only on the client side
        setCurrentMonth(new Date());
    }, []);

    useEffect(() => {
        if (!firestore || !operatorId) return;

        const fetchOperator = async () => {
            const opDoc = await getDoc(doc(firestore, 'app-users', operatorId));
            if (opDoc.exists()) {
                setOperator({ id: opDoc.id, ...opDoc.data() } as Operator);
            }
        };
        fetchOperator();
    }, [firestore, operatorId]);

    const fetchDataForMonth = useCallback(async () => {
        if (!firestore || !operatorId || !currentMonth) {
            setIsLoading(false);
            return;
        };
        setIsLoading(true);

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

            const notesQuery = query(
                collection(firestore, `app-users/${operatorId}/daily-notes`),
                 where('__name__', '>=', format(monthStart, 'yyyy-MM-dd')),
                 where('__name__', '<=', format(monthEnd, 'yyyy-MM-dd'))
            );
    
            const [timbratureSnapshot, requestsSnapshot, notesSnapshot] = await Promise.all([
                getDocs(timbratureQuery),
                getDocs(requestsQuery),
                getDocs(notesQuery)
            ]);

            const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)).filter(t => t.status === 'confermata');
            const requestsData = requestsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Request));
            const notesData = notesSnapshot.docs.map(d => ({ date: d.id, ...d.data() } as DailyNote));

            setMonthlyData({ timbrature: timbratureData, requests: requestsData, dailyNotes: notesData });
        } catch (error) {
            console.error("Error fetching monthly data:", error);
            toast({ title: 'Errore', description: 'Impossibile caricare i dati del mese.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, operatorId, currentMonth, toast]);

    useEffect(() => {
        if (currentMonth) {
            fetchDataForMonth();
        }
    }, [fetchDataForMonth, currentMonth]);
    
    const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator || isLoading || !currentMonth) {
            return { monthlySummary: {} as MonthlySummary, dailyDetails: [] as DailyDetail[] };
        }
        return processMonthlyData(currentMonth, operator, monthlyData);
    }, [operator, currentMonth, monthlyData, isLoading]);
    
    // State for editable totals
    const [editableFerie, setEditableFerie] = useState<number | null>(null);
    const [editablePermessi, setEditablePermessi] = useState<number | null>(null);
    const [editableMalattia, setEditableMalattia] = useState<number | null>(null);

    useEffect(() => {
        setEditableFerie(monthlySummary.ferieDays ?? null);
        setEditablePermessi(monthlySummary.permessoHours ?? null);
        setEditableMalattia(monthlySummary.malattiaDays ?? null);
    }, [monthlySummary]);


    const handleMonthChange = (offset: number) => {
        setCurrentMonth(prev => prev ? new Date(prev.getFullYear(), prev.getMonth() + offset, 1) : new Date());
    };
    
    const handleCleanMonth = async () => {
        if (!firestore || !operatorId || !currentMonth) return;
        setIsCleaning(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        const batch = writeBatch(firestore);

        const timbratureQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('timestamp', '>=', monthStart), where('timestamp', '<=', monthEnd));
        const timbratureSnap = await getDocs(timbratureQuery);
        timbratureSnap.forEach(doc => batch.delete(doc.ref));

        const straordinariQuery = query(collection(firestore, `app-users/${operatorId}/straordinari`), where('date', '>=', monthStart), where('date', '<=', monthEnd));
        const straordinariSnap = await getDocs(straordinariQuery);
        straordinariSnap.forEach(doc => batch.delete(doc.ref));

        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('startDate', '>=', monthStart), where('startDate', '<=', monthEnd));
        const requestsSnap = await getDocs(requestsQuery);
        requestsSnap.forEach(doc => batch.delete(doc.ref));
        
        const notesQuery = query(collection(firestore, `app-users/${operatorId}/daily-notes`), where('__name__', '>=', format(monthStart, 'yyyy-MM-dd')), where('__name__', '<=', format(monthEnd, 'yyyy-MM-dd')));
        const notesSnap = await getDocs(notesQuery);
        notesSnap.forEach(doc => batch.delete(doc.ref));

        try {
            await batch.commit();
            toast({ title: "Successo!", description: `I dati di ${format(currentMonth, 'MMMM yyyy', { locale: it })} sono stati eliminati.` });
            fetchDataForMonth();
        } catch (error) {
            console.error("Errore pulizia mese:", error);
            toast({ title: "Errore", description: "Impossibile completare la pulizia del mese.", variant: "destructive" });
        } finally {
            setIsCleaning(false);
            setIsCleanConfirmOpen(false);
        }
    };
    
    const handleOpenPrintPreview = () => {
        if (!currentMonth) return;
        const monthString = format(currentMonth, 'yyyy-MM');
        window.open(`/dashboard/operators/${operatorId}/end-of-month/print?month=${monthString}`, '_blank');
    };
    
    const handleSaveNote = async () => {
        if (!firestore || !operatorId || !editingNote) return;

        const dateString = format(editingNote.date, 'yyyy-MM-dd');
        const noteRef = doc(firestore, `app-users/${operatorId}/daily-notes`, dateString);
        
        const noteData = {
            note: noteContent,
            date: dateString,
            userId: operatorId,
            updatedAt: serverTimestamp()
        };

        setDoc(noteRef, noteData)
        .then(() => {
            toast({ title: 'Nota salvata', description: 'La nota per il giorno selezionato è stata aggiornata.'});
            setMonthlyData(prev => ({
                ...prev,
                dailyNotes: [
                    ...prev.dailyNotes.filter(n => n.date !== dateString),
                    { note: noteContent, date: dateString }
                ]
            }));
        })
        .catch(err => {
            if (err.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    operation: 'write',
                    path: noteRef.path,
                    requestResourceData: noteData,
                }));
            } else {
                toast({ title: 'Errore', description: 'Impossibile salvare la nota.', variant: 'destructive'});
            }
        })
        .finally(() => {
            setEditingNote(null);
            setNoteContent('');
        });
    };

    if (!operator || !currentMonth) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    const ordinaryCost = (monthlySummary.ordinaryHours || 0) * (operator.hourlyRate || 0);
    const overtimeCost = (monthlySummary.overtimeHours || 0) * (operator.overtimeRate || 0);
    const totalDue = ordinaryCost + overtimeCost;
    
    const formatFullRate = (rate?: number) => {
        if (typeof rate !== 'number') return '0,00';
        return rate.toLocaleString('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        });
    };

    const handleEditNoteClick = (detail: DailyDetail) => {
        const defaultTexts: Record<string, string> = {
            mancata_timbratura: 'Assenza',
            ferie: 'Giorno di Ferie',
            malattia: 'Giorno di Malattia',
            festa: 'Giorno Festivo',
        };
        const currentNote = detail.note || defaultTexts[detail.status] || '';
        setEditingNote({ date: detail.date, currentNote });
        setNoteContent(currentNote);
    };

    const handleEditTotal = (type: 'ferie' | 'permesso' | 'malattia') => {
        let currentValue = 0;
        if(type === 'ferie') currentValue = editableFerie ?? 0;
        if(type === 'permesso') currentValue = editablePermessi ?? 0;
        if(type === 'malattia') currentValue = editableMalattia ?? 0;
        
        setEditingTotal({ type, currentValue });
        setTotalContent(String(currentValue));
    };

    const handleSaveTotal = () => {
        if (!editingTotal) return;

        const newValue = parseFloat(totalContent);
        if (isNaN(newValue)) {
            toast({ title: 'Valore non valido', variant: 'destructive'});
            return;
        }

        if (editingTotal.type === 'ferie') setEditableFerie(newValue);
        if (editingTotal.type === 'permesso') setEditablePermessi(newValue);
        if (editingTotal.type === 'malattia') setEditableMalattia(newValue);

        setEditingTotal(null);
        setTotalContent('');
    }

    return (
        <>
        <Card className="p-4 sm:p-6">
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                         <h1 className="text-3xl font-bold tracking-tight">{operator.firstName} {operator.lastName}</h1>
                        <p className="text-muted-foreground">Calcolo Fine Mese (Codice: {operator.username})</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                         <Button variant="outline" onClick={handleOpenPrintPreview}>
                            <Printer className="mr-2 h-4 w-4" /> Crea Report
                        </Button>
                     </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                 <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                    <Button variant="outline" size="icon" onClick={() => handleMonthChange(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 flex items-center justify-center gap-2">
                        <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                        <Button variant="ghost" size="icon" onClick={fetchDataForMonth} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => handleMonthChange(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                {isLoading ? (
                     <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                ) : (
                <>
                 <div className="space-y-2">
                     <SummaryCard 
                        title="Totale Dovuto" 
                        value={`${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                        icon={Euro}
                        className="bg-accent/20 border-accent"
                    />
                    <SummaryCard title="Giorni Lavorati" value={monthlySummary.workedDays || 0} icon={Briefcase} />
                    <SummaryCard title="Ore Ordinarie" value={(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')} icon={Clock} />
                     <SummaryCard 
                        title="Costo Ore Ordinarie" 
                        value={`${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                        icon={Euro}
                        subtext={`${monthlySummary.ordinaryHours || 0}h x ${formatFullRate(operator.hourlyRate)} €/h`}
                    />
                    <SummaryCard title="Ore Straordinarie" value={(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')} icon={Plus} />
                     <SummaryCard 
                        title="Costo Ore Straordinarie" 
                        value={`${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                        icon={Euro}
                        subtext={`${monthlySummary.overtimeHours || 0}h x ${formatFullRate(operator.overtimeRate)} €/h`}
                    />
                    <SummaryCard 
                        title="Ferie (giorni)" 
                        value={editableFerie ?? '...'}
                        icon={Plane}
                        onEdit={() => handleEditTotal('ferie')}
                    />
                    <SummaryCard 
                        title="Permessi (ore)" 
                        value={editablePermessi ?? '...'} 
                        icon={UserCheck}
                        onEdit={() => handleEditTotal('permesso')}
                    />
                     <SummaryCard 
                        title="Malattia (giorni)" 
                        value={editableMalattia ?? '...'}
                        icon={Stethoscope}
                        onEdit={() => handleEditTotal('malattia')}
                    />
                </div>

                <Separator />

                <div>
                    <h3 className="text-xl font-semibold mb-4">Dettaglio Giornaliero</h3>
                    {dailyDetails.length > 0 ? (
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                            {dailyDetails.map(detail => {
                                 if (detail.status === 'riposo') return null;

                                 const isSunday = getDay(detail.date) === 0;

                                return (
                                <div key={detail.date.toISOString()} className={cn("border rounded-lg p-3", isSunday && "border-red-500/30 bg-red-500/5")}>
                                    <h4 className={cn("font-bold text-lg capitalize flex items-center gap-3", isSunday && "text-red-600")}>
                                        {detail.status === 'ferie' && <Plane className="h-5 w-5 text-green-500" />}
                                        {detail.status === 'malattia' && <Stethoscope className="h-5 w-5 text-red-500" />}
                                        {detail.status === 'mancata_timbratura' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                                        {detail.status === 'lavorato' && <Briefcase className="h-5 w-5 text-blue-500" />}
                                        {detail.status === 'festa' && <Briefcase className="h-5 w-5 text-purple-500" />}

                                        {format(detail.date, 'eeee dd MMMM', { locale: it })}
                                    </h4>

                                    <div className="border-b my-2"></div>
                                    
                                    {detail.status === 'lavorato' && detail.shift ? (
                                        <>
                                            <div className="text-sm text-muted-foreground mt-1 mb-3">
                                                {detail.shift.events.map((e, index) => {
                                                    const originalTime = format(e.timestamp.toDate(), 'HH:mm:ss');
                                                    let referenceTime = '';

                                                    if (e.type === 'entrata' && detail.shift?.calculationStart) {
                                                        const calcStart = format(detail.shift.calculationStart, 'HH:mm');
                                                        if (calcStart !== originalTime.substring(0, 5)) {
                                                            referenceTime = `(${calcStart})`;
                                                        }
                                                    } else if (e.type === 'uscita' && detail.shift?.calculationEnd) {
                                                        const calcEnd = format(detail.shift.calculationEnd, 'HH:mm');
                                                        if (calcEnd !== originalTime.substring(0, 5)) {
                                                            referenceTime = `(${calcEnd})`;
                                                        }
                                                    }
                                                    const formattedType = e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ');

                                                    return (
                                                        <span key={e.id} className={cn('mr-2')}>
                                                            {`${formattedType}: ${originalTime} ${referenceTime}`.trim()}
                                                            {(index < detail.shift.events.length - 1) && ` | `}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <InfoBox label="Ore Previste" value={`${detail.shift.contractualHours}h`} />
                                                <InfoBox label="Ore Ordinarie" value={`${detail.shift.ordinaryHours}h`} />
                                                <InfoBox label="Straordinario" value={`${detail.shift.overtimeHours}h`} />
                                                <InfoBox label="Permesso" value={`${detail.shift.permissionHours}h`} />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-muted-foreground font-semibold">
                                                { detail.note ? <em>{detail.note}</em> : 
                                                  detail.status === 'mancata_timbratura' ? 'Assenza' :
                                                  detail.status === 'ferie' ? 'Giorno di Ferie' :
                                                  detail.status === 'malattia' ? 'Giorno di Malattia' :
                                                  detail.status === 'festa' ? 'Giorno Festivo' : ''
                                                }
                                            </p>
                                             <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditNoteClick(detail)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}

                                </div>
                            )})}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Nessun dato da mostrare per questo mese.</p>
                    )}
                </div>
                </>
                )}
            </CardContent>
        </Card>
        
        <AlertDialog open={isCleanConfirmOpen} onOpenChange={setIsCleanConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione è irreversibile. Verranno eliminate tutte le timbrature, richieste e straordinari dell'operatore per il mese di{' '}
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

        <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Modifica Nota Giornaliera</DialogTitle>
                    <DialogDescription>
                        Aggiungi o modifica la nota per il giorno {editingNote ? format(editingNote.date, 'PPP', { locale: it }) : ''}.
                        Questa nota sarà visibile solo agli amministratori.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="note-content">Nota</Label>
                    <Input
                        id="note-content"
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Es: Assenza giustificata verbalmente"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingNote(null)}>Annulla</Button>
                    <Button onClick={handleSaveNote}>Salva Nota</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        <Dialog open={!!editingTotal} onOpenChange={(open) => !open && setEditingTotal(null)}>
            <DialogContent>
                 <DialogHeader>
                    <DialogTitle className='capitalize'>Modifica Totale {editingTotal?.type}</DialogTitle>
                     <DialogDescription>
                        Inserisci il valore totale che vuoi assegnare per questo mese.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="total-content" className="capitalize">{`Totale ${editingTotal?.type}`}</Label>
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
                    <Button onClick={handleSaveTotal}>Salva Totale</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        </>
    );
}
