'use client';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { collection, query, where, Timestamp, onSnapshot, doc, writeBatch, getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Calendar as CalendarIcon, Clock, Loader2, Plus, Trash2, Pencil, Plane, Stethoscope, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/hooks/use-user';
import { format, startOfMonth, endOfMonth, isSameDay, set, isWithinInterval, startOfDay, endOfDay, getDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter } from '@/components/ui/responsive-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
};

type Operator = {
    id: string;
    workSchedule: WorkSchedule;
}

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata';
    latitude?: number;
    longitude?: number;
};

type Shift = {
    events: Timbratura[];
    startTime: Timestamp;
    endTime: Timestamp | null;
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato' | 'in_attesa' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
}

type SelectedDayInfo = {
    type: 'ferie' | 'malattia' | 'permesso';
} | null;


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
    const [dailyShifts, setDailyShifts] = useState<Shift[]>([]);
    const [workedDays, setWorkedDays] = useState<Date[]>([]);
    const [leaveDays, setLeaveDays] = useState<{ferie: Date[], malattia: Date[], permesso: Date[]}>({ ferie: [], malattia: [], permesso: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDayInfo, setSelectedDayInfo] = useState<SelectedDayInfo>(null);


    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newShift, setNewShift] = useState({
        entrata: '',
        uscita: '',
        pausa: '',
        fine_pausa: '',
    });

    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [editShiftTimes, setEditShiftTimes] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);


    const [operatorData, setOperatorData] = useState<Operator | null>(null);

    const targetUserId = operatorId || user?.id;
    const isAdminView = !!operatorId && user?.role === 'admin';

    useEffect(() => {
        if (!firestore || !targetUserId) return;

        const fetchOperatorData = async () => {
            const operatorDocRef = doc(firestore, `app-users/${targetUserId}`);
            const docSnap = await getDoc(operatorDocRef);
            if (docSnap.exists()) {
                setOperatorData({ id: docSnap.id, ...docSnap.data() } as Operator);
            } else {
                toast({ title: "Errore", description: "Impossibile trovare i dati dell'operatore.", variant: "destructive" });
            }
        };
        fetchOperatorData();
    }, [firestore, targetUserId, toast]);


    const { startOfPeriod, endOfPeriod } = useMemo(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        return {
            startOfPeriod: Timestamp.fromDate(start),
            endOfPeriod: Timestamp.fromDate(end),
        };
    }, [currentMonth]);
    
    useEffect(() => {
        if (!firestore || !targetUserId || !operatorData) return;

        const monthlyTimbratureQuery = query(
            collection(firestore, `app-users/${targetUserId}/timbrature`),
            where('timestamp', '>=', startOfPeriod),
            where('timestamp', '<=', endOfPeriod),
        );

        const unsubTimbrature = onSnapshot(monthlyTimbratureQuery, 
            (snapshot) => {
                const allTimbrature = snapshot.docs.map(doc => doc.data() as {type: string, timestamp: Timestamp, status: string});
                const confirmedTimbrature = allTimbrature.filter(data => data.status === 'confermata');
                
                const dailyEvents = confirmedTimbrature.reduce((acc, t) => {
                    const day = format(t.timestamp.toDate(), 'yyyy-MM-dd');
                    if (!acc[day]) acc[day] = [];
                    acc[day].push(t.type);
                    return acc;
                }, {} as Record<string, string[]>);

                const validWorkedDays: Date[] = [];
                for (const dayStr in dailyEvents) {
                    const events = dailyEvents[dayStr];
                    if (events.includes('entrata') && events.includes('uscita')) {
                         validWorkedDays.push(new Date(dayStr + 'T12:00:00'));
                    }
                }
                setWorkedDays(validWorkedDays);
            },
            (error) => {
                 console.error("Error fetching worked days:", error);
                 toast({ title: "Errore", description: "Impossibile caricare i giorni lavorati.", variant: "destructive" });
            }
        );

        const requestsQuery = query(
            collection(firestore, `app-users/${targetUserId}/requests`)
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
                        const dayOfWeekIndex = getDay(day);
                        const dayName = dayIndexToName[dayOfWeekIndex];
                        const contractualHours = operatorData.workSchedule[dayName] || 0;

                        if (contractualHours > 0) {
                            if (req.type === 'ferie') ferie.push(new Date(day));
                            if (req.type === 'malattia') malattia.push(new Date(day));
                        }
                         if (req.type === 'permesso') {
                             permesso.push(new Date(day));
                         }
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
    }, [firestore, targetUserId, startOfPeriod, endOfPeriod, toast, currentMonth, operatorData]);

    useEffect(() => {
        if (!firestore || !targetUserId || !selectedDate) {
            if (!isUserLoading) setIsLoading(false);
            setDailyShifts([]);
            setSelectedDayInfo(null);
            return;
        }

        setIsLoading(true);

        // Check if the selected day is a leave day
        let dayInfo: SelectedDayInfo = null;
        if (leaveDays.ferie.some(d => isSameDay(d, selectedDate))) {
            dayInfo = { type: 'ferie' };
        } else if (leaveDays.malattia.some(d => isSameDay(d, selectedDate))) {
            dayInfo = { type: 'malattia' };
        } else if (leaveDays.permesso.some(d => isSameDay(d, selectedDate))) {
            dayInfo = { type: 'permesso' };
        }
        setSelectedDayInfo(dayInfo);

        // If it's a leave day, we don't need to fetch shifts
        if (dayInfo) {
            setDailyShifts([]);
            setIsLoading(false);
            return;
        }


        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);
        const startOfDayTs = Timestamp.fromDate(start);
        const endOfDayTs = Timestamp.fromDate(end);
        
        const timbratureQuery = query(
            collection(firestore, `app-users/${targetUserId}/timbrature`),
            where('timestamp', '>=', startOfDayTs),
            where('timestamp', '<=', endOfDayTs)
        );

        const unsubscribeTimbrature = onSnapshot(timbratureQuery, 
            (snapshot) => {
                const timbratureDelGiorno = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Timbratura[];
                // Sort client-side to avoid complex index
                timbratureDelGiorno.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                
                const shifts: Shift[] = [];
                let currentShiftEvents: Timbratura[] = [];

                timbratureDelGiorno.forEach(t => {
                    if (t.type === 'entrata' && currentShiftEvents.length > 0) {
                        shifts.push({ 
                            events: currentShiftEvents,
                            startTime: currentShiftEvents[0].timestamp,
                            endTime: currentShiftEvents[currentShiftEvents.length - 1].type === 'uscita' ? currentShiftEvents[currentShiftEvents.length - 1].timestamp : null
                        });
                        currentShiftEvents = [t];
                    } else {
                        currentShiftEvents.push(t);
                    }
                });

                if (currentShiftEvents.length > 0) {
                    shifts.push({ 
                        events: currentShiftEvents,
                        startTime: currentShiftEvents[0].timestamp,
                        endTime: currentShiftEvents[currentShiftEvents.length - 1].type === 'uscita' ? currentShiftEvents[currentShiftEvents.length - 1].timestamp : null
                    });
                }
                
                setDailyShifts(shifts);
                setIsLoading(false);
            },
            (error) => {
                console.error("Error fetching daily timbrature:", error);
                toast({ title: "Errore", description: "Impossibile caricare le timbrature del giorno.", variant: "destructive" });
                setIsLoading(false);
            }
        );

        return () => unsubscribeTimbrature();
    }, [firestore, targetUserId, selectedDate, toast, isUserLoading, leaveDays]);

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
                    return;
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
    
    const handleOpenEditDialog = (shift: Shift) => {
        setEditingShift(shift);
        const times = { entrata: '', uscita: '', pausa: '', fine_pausa: '' };
        shift.events.forEach(e => {
            times[e.type] = format(e.timestamp.toDate(), 'HH:mm');
        });
        setEditShiftTimes(times);
        setIsEditDialogOpen(true);
    };

    const handleEditShift = async () => {
        if (!firestore || !editingShift || !targetUserId || !selectedDate) {
            return;
        }

        const batch = writeBatch(firestore);

        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(selectedDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };

        const newEventsMap: Partial<Record<Timbratura['type'], { timestamp: Timestamp | null }>> = {
            entrata: { timestamp: createTimestamp(editShiftTimes.entrata) },
            uscita: { timestamp: createTimestamp(editShiftTimes.uscita) },
            pausa: { timestamp: createTimestamp(editShiftTimes.pausa) },
            fine_pausa: { timestamp: createTimestamp(editShiftTimes.fine_pausa) },
        };

        // Update existing or delete if time is cleared
        for (const event of editingShift.events) {
            const docRef = doc(firestore, `app-users/${targetUserId}/timbrature`, event.id);
            if (newEventsMap[event.type] && newEventsMap[event.type]?.timestamp) {
                batch.update(docRef, { timestamp: newEventsMap[event.type]!.timestamp });
            } else {
                batch.delete(docRef);
            }
            delete newEventsMap[event.type];
        }

        // Add new events
        for (const type in newEventsMap) {
            const eventType = type as Timbratura['type'];
            const timestamp = newEventsMap[eventType]?.timestamp;
            if (timestamp) {
                const newDocRef = doc(collection(firestore, `app-users/${targetUserId}/timbrature`));
                batch.set(newDocRef, {
                    userId: targetUserId,
                    type: eventType,
                    timestamp: timestamp,
                    status: 'confermata',
                });
            }
        }

        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno aggiornato.' });
        } catch (error) {
            console.error("Error editing shift:", error);
            toast({ title: 'Errore', description: 'Impossibile aggiornare il turno.', variant: 'destructive' });
        } finally {
            setIsEditDialogOpen(false);
            setEditingShift(null);
        }
    };
    
    const handleDeleteShift = async () => {
        if (!firestore || !shiftToDelete || !targetUserId) return;
        const batch = writeBatch(firestore);
        shiftToDelete.events.forEach(event => {
            const docRef = doc(firestore, `app-users/${targetUserId}/timbrature`, event.id);
            batch.delete(docRef);
        });
        
        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno eliminato con successo.' });
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile eliminare il turno.', variant: 'destructive' });
        } finally {
            setIsDeleteDialogOpen(false);
            setShiftToDelete(null);
        }
    };

    if (isUserLoading || !operatorData) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
     if (!targetUserId) {
        return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Utente non trovato.</p></div>;
    }

    const handleInputChange = (field: keyof typeof newShift, value: string) => {
        setNewShift(prev => ({ ...prev, [field]: value }));
    };
    
    const handleEditInputChange = (field: keyof typeof editShiftTimes, value: string) => {
        setEditShiftTimes(prev => ({ ...prev, [field]: value }));
    };
    
    const LeaveDayCard = ({ type }: { type: 'ferie' | 'malattia' | 'permesso' }) => {
        const details = {
            ferie: { Icon: Plane, text: 'Giorno di Ferie', color: 'text-green-600' },
            malattia: { Icon: Stethoscope, text: 'Giorno di Malattia', color: 'text-red-600' },
            permesso: { Icon: UserCheck, text: 'Giorno di Permesso', color: 'text-yellow-600' },
        };
        const { Icon, text, color } = details[type];
        return (
            <div className="text-center h-40 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <Icon className={cn("h-12 w-12", color)} />
                <p className="text-lg font-medium">{text}</p>
                <p>Nessun turno di lavoro registrato.</p>
            </div>
        )
    };

    return (
        <>
        <div className="grid gap-6 md:grid-cols-[350px_1fr]">
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
                             disabled={(date) => {
                                const isFuture = date > new Date() && !isSameDay(date, new Date());
                                // Allow clicking on future leave days
                                const isLeaveDay = 
                                    leaveDays.ferie.some(d => isSameDay(d, date)) ||
                                    leaveDays.malattia.some(d => isSameDay(d, date)) ||
                                    leaveDays.permesso.some(d => isSameDay(d, date));
                                return isFuture && !isLeaveDay;
                            }}
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
                    ) : selectedDayInfo ? (
                        <LeaveDayCard type={selectedDayInfo.type} />
                    ) : (
                        <div className="border rounded-md">
                            {dailyShifts.length > 0 ? (
                                dailyShifts.map((shift, index) => (
                                    <div key={index} className="border-b last:border-b-0">
                                        <div className='p-4'>
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="font-semibold">Turno {index + 1}</h4>
                                                {isAdminView && (
                                                    <div className="flex gap-2">
                                                        <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(shift)}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => {setShiftToDelete(shift); setIsDeleteDialogOpen(true);}}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Orario</TableHead>
                                                        <TableHead>Evento</TableHead>
                                                        <TableHead className="text-right">Stato</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {shift.events.map(t => (
                                                        <TableRow key={t.id}>
                                                            <TableCell className="font-medium">{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                                            <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                                                            <TableCell className="text-right">
                                                                <Badge variant={t.status === 'confermata' ? 'secondary' : 'default'} className={cn(t.status === 'sospesa' && 'bg-yellow-500 text-white')}>
                                                                    {t.status}
                                                                </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center h-24 flex items-center justify-center">Nessun turno trovato per questo giorno.</div>
                            )}
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
        
        <ResponsiveDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>Modifica Turno</ResponsiveDialogTitle>
                </ResponsiveDialogHeader>
                <div className="grid gap-4 py-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label htmlFor="edit-entrata">Entrata*</Label>
                           <Input id="edit-entrata" type="time" value={editShiftTimes.entrata} onChange={e => handleEditInputChange('entrata', e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-uscita">Uscita*</Label>
                            <Input id="edit-uscita" type="time" value={editShiftTimes.uscita} onChange={e => handleEditInputChange('uscita', e.target.value)} required />
                        </div>
                     </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label htmlFor="edit-pausa">Inizio Pausa (Opz.)</Label>
                           <Input id="edit-pausa" type="time" value={editShiftTimes.pausa} onChange={e => handleEditInputChange('pausa', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-fine-pausa">Fine Pausa (Opz.)</Label>                            <Input id="edit-fine-pausa" type="time" value={editShiftTimes.fine_pausa} onChange={e => handleEditInputChange('fine_pausa', e.target.value)} />
                        </div>
                     </div>
                </div>
                <ResponsiveDialogFooter>
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Annulla</Button>
                    <Button onClick={handleEditShift}>Salva Modifiche</Button>
                </ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>

         <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei sicuro di voler eliminare questo turno?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione è permanente e non può essere annullata. Tutte le timbrature associate a questo turno verranno eliminate.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setShiftToDelete(null)}>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteShift}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
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
