// src/app/dashboard/operators/[operatorId]/end-of-month/page.tsx

'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs, writeBatch, serverTimestamp, setDoc, addDoc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, AlertTriangle, Printer, RefreshCw, Archive, Share2, FileText, Download, X, ChevronLeft, ChevronRight, Euro, Pencil, PlusCircle, Wallet, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useParams, useRouter } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, set, parse, startOfDay, endOfMonth as dfnsEndOfMonth, subMonths, addMonths, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { processMonthlyData, calculateShiftDetails, type DailyDetail, type MonthlySummary, calculateHours, calculatePureOvertime } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { generateDetailedOperatorPdf } from '@/lib/pdf-utility';


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
    entryTolerance?: number;
    ordinaryHalfHourTrigger?: number;
    ordinaryHourTrigger?: number;
    scheduleType?: 'daily' | 'monthly';
    monthlyContractualHours?: number;
    contractType?: 'weekly' | 'monthly';
    totalMonthlyHours?: number;
    overtimeHalfHourTrigger?: number;
    overtimeHourTrigger?: number;
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
    sickLeaveRate?: number;
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    associatedShiftId?: string;
    dailyCosts?: { [date: string]: number };
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    isOvertime?: boolean;
    isAuto?: boolean;
    ignoreContractualStart?: boolean;
    makeupOfDay?: string;
};

type DailyNote = {
    note: string;
    date: string;
}

type MonthlyTotals = {
    ferieDays: number;
    permessoHours: number;
    malattiaDays: number;
}

type AddRequestContext = {
    date: Date;
    type: 'ferie' | 'permesso' | 'malattia';
    hours?: string;
    reason?: string;
} | null;

const SummaryCard = ({ title, value, icon: Icon, subtext, className, actionButton }: { title: string, value: string | number, icon: React.ElementType, subtext?: string, className?: string, actionButton?: React.ReactNode }) => (
    <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <div className='flex items-center gap-1'>
                 {actionButton}
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
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[], dailyNotes: DailyNote[], straordinari: any[] }>({ timbrature: [], requests: [], dailyNotes: [], straordinari: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [isCleanConfirmOpen, setIsCleanConfirmOpen] = useState(false);
    
    const [editingNote, setEditingNote] = useState<{ date: Date, currentNote: string } | null>(null);
    const [noteContent, setNoteContent] = useState('');
    
    const [addRequestContext, setAddRequestContext] = useState<AddRequestContext>(null);
    const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);


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
        const monthEnd = dfnsEndOfMonth(currentMonth);
        const queryStart = subMonths(monthStart, 1);
        const queryEnd = addMonths(monthEnd, 1);

        try {
            const timbratureQuery = query(
                collection(firestore, `app-users/${operatorId}/timbrature`),
                where('timestamp', '>=', queryStart),
                where('timestamp', '<=', queryEnd)
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
            const straordinariQuery = query(
                collection(firestore, `app-users/${operatorId}/straordinari`),
                where('date', '>=', queryStart),
                where('date', '<=', queryEnd)
            );
    
            const [timbratureSnapshot, requestsSnapshot, notesSnapshot, straordinariSnap] = await Promise.all([
                getDocs(timbratureQuery),
                getDocs(requestsQuery),
                getDocs(notesQuery),
                getDocs(straordinariQuery)
            ]);

            const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));
            const requestsData = requestsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Request));
            const notesData = notesSnapshot.docs.map(d => ({ date: d.id, ...d.data() } as DailyNote));
            const straordinariData = straordinariSnap.docs.map(d => ({id: d.id, ...d.data()} as any));
            
            setMonthlyData({ timbrature: timbratureData, requests: requestsData, dailyNotes: notesData, straordinari: straordinariData });
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
        
        const employmentDate = (operator as any).employmentStartDate 
            ? (operator as any).employmentStartDate.toDate() 
            : undefined;

        return processMonthlyData(currentMonth, operator, monthlyData, employmentDate);
    }, [operator, currentMonth, monthlyData, isLoading]);


    const handleMonthChange = (offset: number) => {
        setCurrentMonth(prev => prev ? new Date(prev.getFullYear(), prev.getMonth() + offset, 1) : new Date());
    };
    
    const handleCleanMonth = async () => {
        if (!firestore || !operatorId || !currentMonth) return;
        setIsCleaning(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = dfnsEndOfMonth(currentMonth);

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

        const monthId = format(currentMonth, 'yyyy-MM');
        const overrideDocRef = doc(firestore, `app-users/${operatorId}/monthly-overrides`, monthId);
        batch.delete(overrideDocRef);

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
        
        const queryParams = new URLSearchParams({ month: monthString, autoPrint: 'true' });
        
        window.open(`/dashboard/operators/${operatorId}/end-of-month/print?${queryParams.toString()}`, '_blank');
    };

    const handleDownloadPdf = async () => {
        if (!operator || !currentMonth || !monthlySummary) return;
        setIsDownloading(true);
        try {
            const result = await generateDetailedOperatorPdf(
                currentMonth,
                operator,
                monthlySummary,
                dailyDetails,
                {}, // visibility
                {}  // overrides
            );
            // Removed 4th argument false as it's not supported by signature
            if (result) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(result.blob);
                a.download = result.fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            }
            toast({ title: 'Download completato', description: `Report scaricato correttamente.` });
        } catch (error) {
            console.error("Error downloading PDF:", error);
            toast({ title: 'Errore durante il download', variant: 'destructive' });
        } finally {
            setIsDownloading(false);
        }
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

    const handleAddRequest = async () => {
        if (!firestore || !operatorId || !addRequestContext) return;

        const { date, type, hours, reason } = addRequestContext;

        const newRequestData: any = {
            userId: operatorId,
            type: type,
            status: 'approvato', // Automatically approve admin-added requests
            startDate: Timestamp.fromDate(startOfDay(date)),
            endDate: Timestamp.fromDate(startOfDay(date)),
            reason: reason || "",
            createdAt: serverTimestamp(),
            viewedByOperator: false,
        };

        if (type === 'permesso') {
            if (!hours || parseFloat(hours) <= 0) {
                toast({ title: 'Ore mancanti', description: 'Per un permesso, le ore sono obbligatorie.', variant: 'destructive'});
                return;
            }
            newRequestData.hours = parseFloat(hours);
        }

        try {
            await addDoc(collection(firestore, `app-users/${operatorId}/requests`), newRequestData);
            toast({ title: 'Successo', description: 'Richiesta aggiunta e approvata.'});
            fetchDataForMonth(); // Refresh data
        } catch (error) {
            console.error("Error adding request:", error);
            toast({ title: 'Errore', description: 'Impossibile aggiungere la richiesta.', variant: 'destructive'});
        } finally {
            setAddRequestContext(null);
        }
    };
    
    const handleDeleteRequest = async () => {
        if (!firestore || !operatorId || !requestToDelete) return;

        const requestRef = doc(firestore, `app-users/${operatorId}/requests`, requestToDelete.id);
        
        try {
            await deleteDoc(requestRef);
            toast({ title: 'Richiesta eliminata', description: 'La richiesta è stata rimossa con successo.' });
            fetchDataForMonth(); // Refresh data to reflect the change
        } catch (error) {
            console.error('Error deleting request:', error);
            toast({ title: 'Errore', description: 'Impossibile eliminare la richiesta.', variant: 'destructive' });
        } finally {
            setRequestToDelete(null);
        }
    };


    if (!operator || !currentMonth) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    const finalFerieDays = monthlySummary.ferieDays ?? 0;
    const finalFerieHours = monthlySummary.ferieHours ?? 0;
    const finalPermessoHours = monthlySummary.permessoHours ?? 0;
    const finalMalattiaDays = monthlySummary.malattiaDays ?? 0;
    const finalAbsenceDays = monthlySummary.absenceDays ?? 0;

    const ordinaryCost = (monthlySummary.ordinaryHours || 0) * (operator.hourlyRate || 0);
    const overtimeCost = (monthlySummary.overtimeHours || 0) * (operator.overtimeRate || 0);
    const ferieCost = monthlySummary.ferieCost || 0;
    const permessoCost = monthlySummary.permessoCost || 0;
    const malattiaCost = monthlySummary.malattiaCost || 0;
    
    let totalDue: number;
    if (operator.salaryType === 'fixed') {
        totalDue = (operator.fixedSalary || 0) + overtimeCost + malattiaCost + ferieCost + permessoCost;
    } else {
        totalDue = ordinaryCost + overtimeCost + malattiaCost + ferieCost + permessoCost;
    }

    
    const formatFullRate = (rate?: number) => {
        if (typeof rate !== 'number') return '0,00';
        return rate.toLocaleString('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        });
    };

    const handleEditNoteClick = (detail: DailyDetail) => {
        let defaultText = '';
        if (!detail.shift && !detail.note) {
            const defaultTexts: Record<string, string> = {
                mancata_timbratura: 'Assenza',
                ferie: 'Giorno di Ferie',
                malattia: 'Giorno di Malattia',
                festa: 'Giorno Festivo',
                riposo: 'Giorno di Riposo'
            };
            defaultText = defaultTexts[detail.status] || '';
        }
        const currentNote = detail.note?.note || defaultText;
        setEditingNote({ date: detail.date, currentNote });
        setNoteContent(currentNote);
    };

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
                        <Button variant="outline" onClick={handleDownloadPdf} disabled={isLoading || isDownloading} className="border-primary text-primary hover:bg-primary/10">
                            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Scarica PDF
                        </Button>
                        <Button variant="outline" onClick={handleOpenPrintPreview}>
                            <Printer className="mr-2 h-4 w-4" /> Stampa
                        </Button>
                        <Button variant="destructive" onClick={() => setIsCleanConfirmOpen(true)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Pulisci Mese
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
                 <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SummaryCard 
                            title="Totale Dovuto" 
                            value={`${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                            icon={Euro}
                            className="bg-accent/20 border-accent"
                        />
                         <SummaryCard 
                            title="Giorni Ordinari Lavorati" 
                            value={monthlySummary.ordinaryWorkedDays ?? '...'}
                            icon={Briefcase} 
                        />
                         <SummaryCard 
                            title="Ore Ordinarie" 
                            value={(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')} 
                            icon={Clock}
                        />
                        {operator.salaryType === 'fixed' ? (
                            <SummaryCard 
                                title="Fisso Mensile" 
                                value={`${(operator.fixedSalary || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                                icon={Wallet}
                            />
                        ) : (
                             <SummaryCard 
                                title="Costo Ore Ordinarie" 
                                value={`${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                                icon={Euro}
                                subtext={`${(monthlySummary.ordinaryHours || 0)}h x ${formatFullRate(operator.hourlyRate)} €/h`}
                            />
                        )}
                        <SummaryCard 
                            title="Ore Straordinarie" 
                            value={(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')} 
                            icon={Plus}
                        />
                        <SummaryCard 
                            title="Costo Ore Straordinarie" 
                            value={`${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                            icon={Euro}
                            subtext={`${(monthlySummary.overtimeHours || 0)}h x ${formatFullRate(operator.overtimeRate)} €/h`}
                        />
                        <SummaryCard 
                            title="Ferie (giorni)" 
                            value={`${finalFerieDays} (${finalFerieHours}h)`}
                            icon={Plane}
                        />
                        <SummaryCard 
                            title="Costo Ferie" 
                            value={`${ferieCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                            icon={Euro}
                            subtext="Costo approvato manually"
                        />
                        {!(operator.scheduleType === 'monthly' && finalPermessoHours === 0) && (
                            <>
                                <SummaryCard 
                                    title="Permessi (ore)" 
                                    value={finalPermessoHours} 
                                    icon={UserCheck}
                                />
                                <SummaryCard 
                                    title="Costo Permessi" 
                                    value={`${permessoCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                                    icon={Euro}
                                    subtext="Costo approvato manually"
                                />
                            </>
                        )}
                         <SummaryCard 
                            title="Malattia (giorni)" 
                            value={finalMalattiaDays}
                            icon={Stethoscope}
                        />
                         <SummaryCard 
                            title="Costo Malattia" 
                            value={`${malattiaCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} 
                            icon={Euro}
                            subtext={`Costo approvato manually`}
                        />
                        <SummaryCard
                            title="Assenze (giorni)"
                            value={finalAbsenceDays}
                            icon={AlertTriangle}
                        />
                    </div>
                </div>

                <Separator />

                <div>
                    <h3 className="text-xl font-semibold mb-4">Dettaglio Giornaliero</h3>
                    {dailyDetails.length > 0 ? (
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                            {dailyDetails.map(detail => {
                                const isSunday = getDay(detail.date) === 0;
                                
                                const performedOnDate = detail.shift && detail.shift.events.length > 0 && !isSameDay(detail.shift.events[0].timestamp.toDate(), detail.date)
                                     ? format(detail.shift.events[0].timestamp.toDate(), 'PPP', { locale: it }) 
                                     : null;
                                     
                                if (detail.status === 'recupero_effettuato') {
                                    return (
                                        <div key={detail.date.toISOString()} className={cn("border rounded-lg p-3", isSunday && "border-red-500/30 bg-red-500/5")}>
                                            <div className="flex justify-between items-start">
                                                <h4 className={cn("font-bold text-lg capitalize flex items-center gap-3", isSunday && "text-red-600")}>
                                                    {format(detail.date, 'eeee dd MMMM', { locale: it })}
                                                </h4>
                                            </div>
                                            <div className="border-b my-2"></div>
                                            <p className="text-muted-foreground italic">Effettuato turno di recupero (vedi {detail.makeupPerformedFor})</p>
                                        </div>
                                    )
                                }
                                     
                                return (
                                <div key={detail.date.toISOString()} className={cn("border rounded-lg p-3", isSunday && "border-red-500/30 bg-red-500/5")}>
                                    <div className="flex justify-between items-start">
                                        <h4 className={cn("font-bold text-lg capitalize flex items-center gap-3", isSunday && "text-red-600")}>
                                            {format(detail.date, 'eeee dd MMMM', { locale: it })}
                                        </h4>
                                        <div className="flex items-center gap-1">
                                             {!detail.shift && !detail.request && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddRequestContext({ date: detail.date, type: 'ferie' })}>
                                                    <PlusCircle className="h-4 w-4 text-primary" />
                                                </Button>
                                            )}
                                            {detail.request && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRequestToDelete(detail.request)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditNoteClick(detail)}>
                                                <FileText className={cn('h-4 w-4', detail.note ? 'text-green-500' : 'text-muted-foreground')} />
                                            </Button>
                                        </div>
                                    </div>
                                    
                                     {performedOnDate && (
                                        <p className="text-sm font-semibold text-primary mt-1">
                                            Recupero eseguito il {performedOnDate}
                                        </p>
                                    )}
                                    {detail.makeupActivityFor && detail.makeupActivityFor.length > 0 && (
                                        <div>
                                            <p className="text-sm font-semibold text-purple-600 mt-1">
                                                Recupero per: {detail.makeupActivityFor.join(', ')}
                                            </p>
                                            <p className="text-xs text-muted-foreground italic">
                                                (Le ore di questo turno sono attribuite al giorno di recupero e non vengono conteggiate per questa data.)
                                            </p>
                                        </div>
                                    )}

                                    <div className="border-b my-2"></div>
                                    
                                    {detail.status === 'ferie' ? (
                                        <p className="text-muted-foreground font-semibold">Giorno di Ferie</p>
                                    ) : detail.note && !detail.shift ? (
                                        <p className="text-muted-foreground font-semibold italic">"{detail.note.note}"</p>
                                    ) : detail.status === 'riposo' ? (
                                        <p className="text-muted-foreground font-semibold">Giorno di Riposo</p>
                                    ) : null}

                                    {detail.shift && detail.shift.allShifts ? (
                                        <>
                                            <div className="text-sm text-muted-foreground mt-1 mb-3">
                                                {detail.shift.allShifts.map((shiftBlock, idx) => {
                                                    const timbratureString = shiftBlock.events.map(e => {
                                                        const originalTime = format(e.timestamp.toDate(), 'HH:mm');
                                                        let referenceTime = '';

                                                        if (e.type === 'entrata' && shiftBlock.calculationStart) {
                                                            referenceTime = `(${format(shiftBlock.calculationStart, 'HH:mm')})`;
                                                        } else if (e.type === 'uscita' && shiftBlock.calculationEnd) {
                                                            referenceTime = `(${format(shiftBlock.calculationEnd, 'HH:mm')})`;
                                                        }
                                                        const formattedType = e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ');
                                                        return `${formattedType}: ${originalTime} ${referenceTime}`.trim();
                                                    }).join(' | ');

                                                    const firstEventDate = shiftBlock.events[0]?.timestamp.toDate();
                                                    const isRecoveryDisplay = firstEventDate && !isSameDay(firstEventDate, detail.date);
                                                    const recoveryDateString = isRecoveryDisplay ? ` (rec. il ${format(firstEventDate, 'dd/MM/yy')})` : '';


                                                    return (
                                                        <span key={idx} className="mr-2 inline-block mb-1 border-b pb-1">
                                                            {`T${idx + 1}: ${timbratureString}${recoveryDateString}`}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                <InfoBox label="Ore Previste" value={`${detail.shift.contractualHours}h`} />
                                                <InfoBox label="Ore Ordinarie" value={`${detail.shift.ordinaryHours}h`} />
                                                <InfoBox label="Straordinario" value={`${detail.shift.overtimeHours}h`} /> 
                                                <InfoBox label="Permesso" value={`${detail.shift.permissionHours}h`} />
                                            </div>
                                        </>
                                    ) : (
                                        !detail.note && detail.status !== 'riposo' && detail.status !== 'ferie' && (
                                           <p className="text-muted-foreground font-semibold mt-1">
                                                { detail.status === 'mancata_timbratura' ? 'Assenza' :
                                                  detail.status === 'malattia' ? 'Giorno di Malattia' :
                                                  detail.status === 'festa' ? 'Giorno Festivo' :
                                                  detail.status === 'in_corso' ? 'Turno in corso...' : ''
                                                }
                                            </p>
                                        )
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
                        Questa nota sostituirà lo stato di default nel report.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="note-content">Nota</Label>
                    <Input
                        id="note-content"
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Es: Assenza giustificata"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingNote(null)}>Annulla</Button>
                    <Button onClick={handleSaveNote}>Salva Nota</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        <Dialog open={!!addRequestContext} onOpenChange={(open) => !open && setAddRequestContext(null)}>
            <DialogContent>
                 <DialogHeader>
                    <DialogTitle>Aggiungi Richiesta</DialogTitle>
                    {addRequestContext && (
                        <DialogDescription>
                            Giustifica il giorno {format(addRequestContext.date, 'PPP', { locale: it })} aggiungendo una richiesta.
                        </DialogDescription>
                    )}
                </DialogHeader>
                {addRequestContext && (
                     <div className="py-4 space-y-4">
                        <div className="space-y-2">
                             <Label htmlFor="request-type">Tipo di Richiesta</Label>
                             <Select 
                                value={addRequestContext.type} 
                                onValueChange={(v) => setAddRequestContext(p => p ? {...p, type: v as any} : null)}
                            >
                                <SelectTrigger id="request-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ferie">Ferie</SelectItem>
                                    <SelectItem value="malattia">Malattia</SelectItem>
                                    <SelectItem value="permesso">Permesso</SelectItem>
                                </SelectContent>
                             </Select>
                        </div>
                        {addRequestContext.type === 'permesso' && (
                             <div className="space-y-2">
                                <Label htmlFor="request-hours">Ore di Permesso</Label>
                                <Input 
                                    id="request-hours"
                                    type="number"
                                    value={addRequestContext.hours || ''}
                                    onChange={(e) => setAddRequestContext(p => p ? {...p, hours: e.target.value} : null)}
                                    placeholder="Es. 4"
                                />
                             </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="request-reason">Motivazione (opzionale)</Label>
                            <Textarea
                                id="request-reason"
                                value={addRequestContext.reason || ''}
                                onChange={(e) => setAddRequestContext(p => p ? {...p, reason: e.target.value} : null)}
                                placeholder="Aggiungi una nota..."
                            />
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => setAddRequestContext(null)}>Annulla</Button>
                    <Button onClick={handleAddRequest}>Aggiungi e Approva</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <AlertDialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione eliminerà la richiesta in modo permanente. L'azione non può essere annullata.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteRequest}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        
        </>
    );
}
