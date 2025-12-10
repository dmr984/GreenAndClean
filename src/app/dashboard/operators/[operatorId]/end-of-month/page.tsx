// src/app/dashboard/operators/[operatorId]/end-of-month/page.tsx

'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs, writeBatch } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, AlertTriangle, Printer, RefreshCw, Archive } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useParams } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, set } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { processMonthlyData, calculateShiftDetails, type DailyDetail, type MonthlySummary } from '@/lib/calculations';

// Type definitions moved to calculations.ts
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
};

const SummaryCard = ({ title, value, icon: Icon }: { title: string, value: string | number, icon: React.ElementType }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
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
    const { toast } = useToast();
    const operatorId = params.operatorId as string;
    const [isProcessing, setIsProcessing] = useState(false);
    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[] }>({ timbrature: [], requests: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [isCleanConfirmOpen, setIsCleanConfirmOpen] = useState(false);

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
        if (!firestore || !operatorId) {
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
    
            const [timbratureSnapshot, requestsSnapshot] = await Promise.all([
                getDocs(timbratureQuery),
                getDocs(requestsQuery)
            ]);

            const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)).filter(t => t.status === 'confermata');
            const requestsData = requestsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Request));

            setMonthlyData({ timbrature: timbratureData, requests: requestsData });
        } catch (error) {
            console.error("Error fetching monthly data:", error);
            toast({ title: 'Errore', description: 'Impossibile caricare i dati del mese.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, operatorId, currentMonth, toast]);

    useEffect(() => {
        fetchDataForMonth();
    }, [fetchDataForMonth]);
    
    const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator || isLoading) {
            return { monthlySummary: {} as MonthlySummary, dailyDetails: [] as DailyDetail[] };
        }
        return processMonthlyData(currentMonth, operator, monthlyData);
    }, [operator, currentMonth, monthlyData, isLoading]);

    const handleMonthChange = (offset: number) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const handlePrintAndShare = () => {
        // This function would contain the complex logic for generating PDF/sharing.
        // It's kept simple here for brevity.
        toast({ title: "Funzione non implementata", description: "La stampa e condivisione non sono ancora attive." });
    };

    const handleCleanMonth = async () => {
        if (!firestore || !operatorId || !currentMonth) return;
        setIsCleaning(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        const batch = writeBatch(firestore);

        // Delete timbrature for the month
        const timbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', monthStart),
            where('timestamp', '<=', monthEnd)
        );
        const timbratureSnap = await getDocs(timbratureQuery);
        timbratureSnap.forEach(doc => batch.delete(doc.ref));

        // Delete straordinari for the month
        const straordinariQuery = query(
            collection(firestore, `app-users/${operatorId}/straordinari`),
            where('date', '>=', monthStart),
            where('date', '<=', monthEnd)
        );
        const straordinariSnap = await getDocs(straordinariQuery);
        straordinariSnap.forEach(doc => batch.delete(doc.ref));

        // Delete requests for the month
        const requestsQuery = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            where('startDate', '>=', monthStart),
            where('startDate', '<=', monthEnd)
        );
        const requestsSnap = await getDocs(requestsQuery);
        requestsSnap.forEach(doc => batch.delete(doc.ref));

        try {
            await batch.commit();
            toast({
                title: "Successo!",
                description: `I dati di ${format(currentMonth, 'MMMM yyyy', { locale: it })} sono stati eliminati.`
            });
            fetchDataForMonth(); // Refetch data to update the view
        } catch (error) {
            console.error("Errore pulizia mese:", error);
            toast({
                title: "Errore",
                description: "Impossibile completare la pulizia del mese.",
                variant: "destructive"
            });
        } finally {
            setIsCleaning(false);
            setIsCleanConfirmOpen(false);
        }
    };


    if (!operator) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
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
                         <Button onClick={handlePrintAndShare} disabled={isProcessing} className="w-full sm:w-auto">
                            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                            Stampa/Condividi Riepilogo
                        </Button>
                         <Button variant="destructive" onClick={() => setIsCleanConfirmOpen(true)} disabled={isCleaning} className="w-full sm:w-auto">
                            {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                            Pulisci Mese
                        </Button>
                     </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                 <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                    <Button variant="outline" size="sm" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                        <Button variant="ghost" size="icon" onClick={fetchDataForMonth} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleMonthChange(1)}>Succ.</Button>
                </div>

                {isLoading ? (
                     <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                ) : (
                <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SummaryCard title="Giorni Lavorati" value={monthlySummary.workedDays || 0} icon={Briefcase} />
                    <SummaryCard title="Ore Ordinarie" value={(monthlySummary.ordinaryHours || 0).toLocaleString('it-IT')} icon={Clock} />
                    <SummaryCard title="Ore Straordinarie" value={(monthlySummary.overtimeHours || 0).toLocaleString('it-IT')} icon={Plus} />
                    <SummaryCard title="Ferie (giorni)" value={monthlySummary.ferieDays || 0} icon={Plane} />
                    <SummaryCard title="Permessi (ore)" value={(monthlySummary.permessoHours || 0).toLocaleString('it-IT')} icon={UserCheck} />
                    <SummaryCard title="Malattia (giorni)" value={monthlySummary.malattiaDays || 0} icon={Stethoscope} />
                </div>

                <Separator />

                <div>
                    <h3 className="text-xl font-semibold mb-4">Dettaglio Giornaliero</h3>
                    {dailyDetails.length > 0 ? (
                        <div className="space-y-2">
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
                                                 {detail.shift.events.map(e => {
                                                    const originalTime = format(e.timestamp.toDate(), 'HH:mm:ss');
                                                     let referenceTime = '';

                                                    if (operator && (e.type === 'entrata' || e.type === 'uscita')) {
                                                        const { calculationStart, calculationEnd } = calculateShiftDetails(detail.shift.events, operator.workSchedule[dayIndexToName[getDay(detail.date)]]);
                                                        if (e.type === 'entrata' && calculationStart && Math.abs(calculationStart.getTime() - e.timestamp.toDate().getTime()) > 1000) {
                                                            referenceTime = `(${format(calculationStart, 'HH:mm')})`;
                                                        } else if (e.type === 'uscita' && calculationEnd && Math.abs(calculationEnd.getTime() - e.timestamp.toDate().getTime()) > 1000) {
                                                             referenceTime = `(${format(calculationEnd, 'HH:mm')})`;
                                                        }
                                                    }

                                                    return (
                                                        <span key={e.id} className={cn('mr-2')}>
                                                            {`${e.type.replace('_', ' ')}: ${originalTime} ${referenceTime}`.trim()}
                                                            {` | `}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <InfoBox label="Ore Previste" value={`${detail.shift.contractualHours}h`} />
                                                <InfoBox label="Ore Ordinarie" value={`${detail.shift.ordinaryHours}h`} />
                                                <InfoBox label="Straordinario" value={`${detail.shift.overtimeHours}h`} />
                                                <InfoBox label="Permesso" value={`${detail.shift.permissionHours}h`} />
                                            </div>
                                        </>
                                    ) : detail.status === 'ferie' ? (
                                        <p className="text-muted-foreground mt-1">Giorno di ferie approvato.</p>
                                    ) : detail.status === 'malattia' ? (
                                        <p className="text-muted-foreground mt-1">Giorno di malattia approvato.</p>
                                    ) : detail.status === 'festa' ? (
                                        <p className="text-muted-foreground mt-1">Giorno festivo.</p>
                                    ) : detail.status === 'mancata_timbratura' ? (
                                        <p className="text-yellow-600 font-semibold mt-1">Nessuna timbratura registrata in un giorno lavorativo.</p>
                                    ) : null}

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
                        <span className="font-bold">{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>.
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
}
