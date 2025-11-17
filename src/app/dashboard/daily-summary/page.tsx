'use client';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { collection, query, where, Timestamp, onSnapshot, addDoc, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Calendar as CalendarIcon, Clock, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/hooks/use-user';
import { format, startOfMonth, endOfMonth, isSameDay, set, isWithinInterval } from 'date-fns';
import { it } from 'date-fns/locale';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter } from '@/components/ui/responsive-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata';
    latitude?: number;
    longitude?: number;
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato' | 'in_attesa' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
}

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
    const [leaveDays, setLeaveDays] = useState<{ferie: Date[], malattia: Date[], permesso: Date[]}>({ ferie: [], malattia: [], permesso: [] });
    const [isLoading, setIsLoading] = useState(true);

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newShift, setNewShift] = useState({
        entrata: '',
        uscita: '',
        pausa: '',
        fine_pausa: '',
    });


    const targetUserId = operatorId || user?.id;
    const isAdminView = !!operatorId && user?.role === 'admin';

    const { startOfPeriod, endOfPeriod } = useMemo(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        return {
            startOfPeriod: Timestamp.fromDate(start),
            endOfPeriod: Timestamp.fromDate(end),
        };
    }, [currentMonth]);
    
    // Effect for fetching all month data (timbrature and requests)
    useEffect(() => {
        if (!firestore || !targetUserId) return;

        // Fetch timbrature
        const monthlyTimbratureQuery = query(
            collection(firestore, `app-users/${targetUserId}/timbrature`),
            where('timestamp', '>=', startOfPeriod),
            where('timestamp', '<=', endOfPeriod)
        );

        const unsubTimbrature = onSnapshot(monthlyTimbratureQuery, 
            (snapshot) => {
                const dates = snapshot.docs
                    .map(doc => doc.data())
                    .filter(data => data.status === 'confermata')
                    .map(data => data.timestamp.toDate());
                    
                const uniqueDays = dates.reduce((acc, date) => {
                    if (!acc.some(d => isSameDay(d, date))) acc.push(date);
                    return acc;
                }, [] as Date[]);
                setWorkedDays(uniqueDays);
            },
            (error) => {
                 console.error("Error fetching worked days:", error);
                 toast({ title: "Errore", description: "Impossibile caricare i giorni lavorati.", variant: "destructive" });
            }
        );

        // Fetch requests for leave highlighting
        const requestsQuery = query(
            collection(firestore, `app-users/${targetUserId}/requests`),
            where('startDate', '<=', endOfPeriod)
        );

        const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(currentMonth);
            const ferie: Date[] = [];
            const malattia: Date[] = [];
            const permesso: Date[] = [];

            const approvedRequests = snapshot.docs
                .map(doc => doc.data() as Request)
                .filter(req => req.status === 'approvato');

            approvedRequests.forEach(req => {
                const startReq = req.startDate.toDate();
                const endReq = req.endDate.toDate();

                for (let day = new Date(startReq); day <= endReq; day.setDate(day.getDate() + 1)) {
                    if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                        if (req.type === 'ferie') ferie.push(new Date(day));
                        if (req.type === 'malattia') malattia.push(new Date(day));
                        if (req.type === 'permesso') permesso.push(new Date(day));
                    }
                }
            });
            setLeaveDays({ ferie, malattia, permesso });
        }, (error) => {
             console.error("Error fetching requests:", error);
             toast({ title: "Errore", description: "Impossibile caricare le richieste di assenza.", variant: "destructive" });
        });


        return () => {
            unsubTimbrature();
            unsubRequests();
        };
    }, [firestore, targetUserId, startOfPeriod, endOfPeriod, toast, currentMonth]);


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
        );

        const unsubscribeTimbrature = onSnapshot(timbratureQuery, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Timbratura[];
                const sorted = data.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                
                setTimbrature(sorted);
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

    const handleAddManualShift = async () => {
        if (!firestore || !targetUserId || !selectedDate || !newShift.entrata || !newShift.uscita) {
            toast({ title: 'Dati mancanti', description: 'Entrata e Uscita sono obbligatorie.', variant: 'destructive'});
            return;
        }

        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if(isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(selectedDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };

        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${targetUserId}/timbrature`);

        const events: { type: Timbratura['type'], time: string }[] = [
            { type: 'entrata', time: newShift.entrata },
            { type: 'uscita', time: newShift.uscita },
            { type: 'pausa', time: newShift.pausa },
            { type: 'fine_pausa', time: newShift.fine_pausa },
        ];

        for (const event of events) {
            if (event.time) {
                const timestamp = createTimestamp(event.time);
                if (!timestamp) {
                    toast({ title: `Orario non valido per ${event.type}`, variant: 'destructive'});
                    return; // Stop the whole process if one time is invalid
                }
                const newDocRef = doc(timbratureCollectionRef);
                batch.set(newDocRef, {
                    userId: targetUserId,
                    type: event.type,
                    timestamp: timestamp,
                    status: 'confermata' as const,
                });
            }
        }
        
        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno manuale aggiunto con successo.' });
            setIsAddDialogOpen(false);
            setNewShift({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
        } catch (error) {
            console.error("Error adding manual shift:", error);
            toast({ title: 'Errore', description: 'Impossibile aggiungere il turno manuale.', variant: 'destructive'});
        }
    };
    
    if (isUserLoading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
     if (!targetUserId) {
        return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Utente non trovato.</p></div>;
    }

    const handleInputChange = (field: keyof typeof newShift, value: string) => {
        setNewShift(prev => ({ ...prev, [field]: value }));
    };

    return (
        <>
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
                            modifiers={{ 
                                worked: workedDays,
                                ferie: leaveDays.ferie,
                                malattia: leaveDays.malattia,
                                permesso: leaveDays.permesso
                             }}
                            modifiersClassNames={{ 
                                worked: 'bg-primary/20',
                                ferie: 'bg-green-500/30 text-green-800',
                                malattia: 'bg-red-500/30 text-red-800',
                                permesso: 'bg-yellow-500/30 text-yellow-800'
                             }}
                        />
                         <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-primary/20 border"></div> Giorno Lavorato</div>
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-green-500/30 border"></div> Ferie</div>
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-red-500/30 border"></div> Malattia</div>
                            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-yellow-500/30 border"></div> Permesso</div>
                        </div>
                    </CardContent>
                     {isAdminView && selectedDate && (
                        <CardFooter>
                           <Button className="w-full" onClick={() => setIsAddDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Aggiungi Turno Manuale</Button>
                        </CardFooter>
                    )}
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                     <div className='flex items-center gap-3'>
                        <Clock className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">
                            Dettaglio del {selectedDate ? format(selectedDate, 'PPP', { locale: it }) : '...'}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                         <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
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
                                                    <Badge variant={t.status === 'confermata' ? 'secondary' : 'default'} className={cn(t.status === 'sospesa' && 'bg-yellow-500 text-white')}>
                                                        {t.status}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center h-24">Nessuna timbratura trovata per questo giorno.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        <ResponsiveDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>Aggiungi Turno Manuale</ResponsiveDialogTitle>
                </ResponsiveDialogHeader>
                <div className="grid gap-4 py-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label htmlFor="manual-entrata">Entrata*</Label>
                           <Input id="manual-entrata" type="time" value={newShift.entrata} onChange={e => handleInputChange('entrata', e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="manual-uscita">Uscita*</Label>
                            <Input id="manual-uscita" type="time" value={newShift.uscita} onChange={e => handleInputChange('uscita', e.target.value)} required />
                        </div>
                     </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label htmlFor="manual-pausa">Inizio Pausa (Opz.)</Label>
                           <Input id="manual-pausa" type="time" value={newShift.pausa} onChange={e => handleInputChange('pausa', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="manual-fine-pausa">Fine Pausa (Opz.)</Label>
                            <Input id="manual-fine-pausa" type="time" value={newShift.fine_pausa} onChange={e => handleInputChange('fine_pausa', e.target.value)} />
                        </div>
                     </div>
                </div>
                <ResponsiveDialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Annulla</Button>
                    <Button onClick={handleAddManualShift}>Salva Turno</Button>
                </ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
        </>
    );
}

export default function DailySummaryPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <DailySummaryContent />
        </Suspense>
    );
}
