'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, Timestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar as CalendarIcon, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/hooks/use-user';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata';
    latitude: number;
    longitude: number;
};

export default function DailySummaryPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const { startOfDay, endOfDay } = useMemo(() => {
        if (!selectedDate) {
            return { startOfDay: null, endOfDay: null };
        }
        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);

        return {
            startOfDay: Timestamp.fromDate(start),
            endOfDay: Timestamp.fromDate(end),
        };
    }, [selectedDate]);

    useEffect(() => {
        if (!firestore || !user?.id || !startOfDay || !endOfDay) {
             if (!isUserLoading) setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // Listener for Timbrature - only show confirmed ones to the operator
        const timbratureQuery = query(
            collection(firestore, `app-users/${user.id}/timbrature`),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay),
            where('status', '==', 'confermata'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribeTimbrature = onSnapshot(timbratureQuery, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Timbratura[];
                setTimbrature(data);
                setIsLoading(false);
            },
            (error) => {
                console.error("Error fetching timbrature:", error);
                // Note: This might fail if the composite index for status and timestamp is not created.
                // The error message from Firestore will guide the developer to create it.
                toast({ title: "Errore", description: "Impossibile caricare le timbrature confermate.", variant: "destructive" });
                setIsLoading(false);
            }
        );

        return () => {
            unsubscribeTimbrature();
        };
    }, [firestore, user, startOfDay, endOfDay, toast, isUserLoading]);
    
    if (isUserLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
     if (!user) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Utente non trovato. Effettua nuovamente il login.</p>
            </div>
        );
    }

    return (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-[280px_1fr]">
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
                            className="rounded-md border p-0"
                            locale={it}
                            disabled={(date) => date > new Date()}
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
