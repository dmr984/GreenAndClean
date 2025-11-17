'use client';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { collection, query, where, Timestamp, onSnapshot, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar as CalendarIcon, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/hooks/use-user';
import { format, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useSearchParams } from 'next/navigation';

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata';
    latitude: number;
    longitude: number;
};

function DailySummaryContent() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const urlMonth = searchParams.get('month');
    const urlYear = searchParams.get('year');
    const operatorId = searchParams.get('operatorId');

    const initialDate = useMemo(() => {
        if (urlMonth && urlYear) {
            return new Date(parseInt(urlYear), parseInt(urlMonth) - 1, 1);
        }
        return new Date();
    }, [urlMonth, urlYear]);

    const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
    const [currentMonth, setCurrentMonth] = useState(initialDate);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [workedDays, setWorkedDays] = useState<Date[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const targetUserId = operatorId || user?.id;

    const { startOfPeriod, endOfPeriod } = useMemo(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        return {
            startOfPeriod: Timestamp.fromDate(start),
            endOfPeriod: Timestamp.fromDate(end),
        };
    }, [currentMonth]);

    // Effect to fetch all worked days in the current month for calendar highlighting
    useEffect(() => {
        if (!firestore || !targetUserId) return;
        
        // Simplified query to avoid composite index requirement
        const monthlyTimbratureQuery = query(
            collection(firestore, `app-users/${targetUserId}/timbrature`),
            where('timestamp', '>=', startOfPeriod),
            where('timestamp', '<=', endOfPeriod)
            // where('status', '==', 'confermata') // This was causing the index error
        );

        const unsubscribe = onSnapshot(monthlyTimbratureQuery, 
            (snapshot) => {
                // Filter for confirmed status on the client-side
                const dates = snapshot.docs
                    .map(doc => doc.data())
                    .filter(data => data.status === 'confermata')
                    .map(data => data.timestamp.toDate());
                    
                const uniqueDays = dates.reduce((acc, date) => {
                    if (!acc.some(d => isSameDay(d, date))) {
                        acc.push(date);
                    }
                    return acc;
                }, [] as Date[]);
                setWorkedDays(uniqueDays);
            },
            (error) => {
                 console.error("Error fetching worked days:", error);
                 toast({ title: "Errore", description: "Impossibile caricare i giorni lavorati.", variant: "destructive" });
            }
        );
        return () => unsubscribe();
    }, [firestore, targetUserId, startOfPeriod, endOfPeriod, toast]);

    // Effect to fetch details for the selected day
    useEffect(() => {
        if (!firestore || !targetUserId || !selectedDate) {
            if (!isUserLoading) setIsLoading(false);
            setTimbrature([]);
            return;
        }

        setIsLoading(true);

        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);

        const startOfDay = Timestamp.fromDate(start);
        const endOfDay = Timestamp.fromDate(end);
        
        const timbratureQuery = query(
            collection(firestore, `app-users/${targetUserId}/timbrature`),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay)
            // where('status', '==', 'confermata') // Removing to avoid index error, filtering client-side
        );

        const unsubscribeTimbrature = onSnapshot(timbratureQuery, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Timbratura[];
                // Filter for confirmed status and sort on the client-side
                const confirmedAndSorted = data
                    .filter(t => t.status === 'confermata')
                    .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                
                setTimbrature(confirmedAndSorted);
                setIsLoading(false);
            },
            (error) => {
                console.error("Error fetching daily timbrature:", error);
                toast({ title: "Errore", description: "Impossibile caricare le timbrature del giorno.", variant: "destructive" });
                setIsLoading(false);
            }
        );

        return () => unsubscribeTimbrature();
    }, [firestore, targetUserId, selectedDate, toast, isUserLoading]);
    
    if (isUserLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
     if (!targetUserId) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Utente non trovato. Effettua nuovamente il login.</p>
            </div>
        );
    }

    return (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col gap-6">
                <Card>
                    <CardHeader>
                        <div className='flex items-center gap-3'>
                            <CalendarIcon className="h-6 w-6 text-primary" />
                            <CardTitle className="text-2xl">Seleziona Giorno</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            month={currentMonth}
                            onMonthChange={setCurrentMonth}
                            className="rounded-md border p-0"
                            locale={it}
                            disabled={(date) => date > new Date()}
                            modifiers={{ worked: workedDays }}
                            modifiersClassNames={{ worked: 'bg-primary/20 rounded-full' }}
                        />
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                     <div className='flex items-center gap-3'>
                        <Clock className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">
                            Dettaglio Timbrature del {selectedDate ? format(selectedDate, 'PPP', { locale: it }) : '...'}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                         <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Orario</TableHead>
                                        <TableHead>Evento</TableHead>
                                        <TableHead className="text-right">Stato</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {timbrature.length > 0 ? (
                                        timbrature.map((t) => (
                                            <TableRow key={t.id}>
                                                <TableCell className="font-medium">{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                                <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant={t.status === 'confermata' ? 'secondary' : 'default'}>
                                                        {t.status}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center h-24">Nessuna timbratura confermata trovata per questo giorno.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function DailySummaryPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <DailySummaryContent />
        </Suspense>
    );
}
