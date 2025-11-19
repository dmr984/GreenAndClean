'use client';
import React, { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Loader2, User, CheckCircle, XCircle, MapPin, Trash2, Eye, Pencil, AlertCircle, Circle, Clock, Briefcase, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter, ResponsiveDialogClose } from '@/components/ui/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, set, getDay as getDayFns } from 'date-fns';
import { it } from 'date-fns/locale';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
};

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    workSchedule: WorkSchedule;
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    latitude?: number;
    longitude?: number;
};

type Shift = {
    events: Timbratura[];
    status: 'in_sospeso' | 'in_corso' | 'confermato';
    workDuration: number; // total work minutes
};

export default function ShiftApprovalPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const params = useParams();
    const operatorId = params.operatorId as string;
    const [operator, setOperator] = useState<Operator | null>(null);

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [detailShift, setDetailShift] = useState<Shift | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    
    const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [isEditShiftOpen, setIsEditShiftOpen] = useState(false);
    const [editShiftTimes, setEditShiftTimes] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    
    const [deletingTimbratura, setDeletingTimbratura] = useState<Timbratura | null>(null);
    const [isDeleteTimbraturaDialogOpen, setIsDeleteTimbraturaDialogOpen] = useState(false);

    const [overtimeHours, setOvertimeHours] = useState<string>("0");
    const [isApproveOvertimeOpen, setIsApproveOvertimeOpen] = useState(false);
    const [shiftToApprove, setShiftToApprove] = useState<Shift | null>(null);

     useEffect(() => {
        if (!firestore || !operatorId) return;
        const operatorDocRef = doc(firestore, 'app-users', operatorId);
        getDoc(operatorDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            }
        });
    }, [firestore, operatorId]);


    useEffect(() => {
        if (!firestore || !operatorId) return;
        const q = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('status', '==', 'sospesa'));
        
        const unsubscribe = onSnapshot(q, snapshot => {
            const fetchAllClockingsForPendingDays = async () => {
                if (snapshot.docs.length === 0) {
                    setShifts([]);
                    setIsLoading(false);
                    return;
                }
                
                const allClockingsQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), orderBy('timestamp', 'asc'));
                const allClockingsSnapshot = await getDocs(allClockingsQuery);
                const allClockings = allClockingsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));

                const groupedShifts: Shift[] = [];
                let currentShiftEvents: Timbratura[] = [];

                for (const event of allClockings) {
                    if (event.type === 'entrata' && currentShiftEvents.length > 0) {
                        const { status, workDuration } = processShift(currentShiftEvents);
                        if (status !== 'confermato') {
                           groupedShifts.push({ events: currentShiftEvents, status, workDuration });
                        }
                        currentShiftEvents = [event];
                    } else {
                        currentShiftEvents.push(event);
                        if (event.type === 'uscita') {
                            const { status, workDuration } = processShift(currentShiftEvents);
                             if (status !== 'confermato') {
                                groupedShifts.push({ events: currentShiftEvents, status, workDuration });
                            }
                            currentShiftEvents = [];
                        }
                    }
                }

                if (currentShiftEvents.length > 0) {
                     const { status, workDuration } = processShift(currentShiftEvents);
                     if (status !== 'confermato') {
                        groupedShifts.push({ events: currentShiftEvents, status, workDuration });
                     }
                }

                setShifts(groupedShifts.reverse());
                setIsLoading(false);
            };

            fetchAllClockingsForPendingDays();

        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le timbrature.', variant: 'destructive' });
            setIsLoading(false);
        });
        return unsubscribe;
    }, [firestore, operatorId, toast]);

    const processShift = (events: Timbratura[]): { status: Shift['status'], workDuration: number } => {
        const hasPending = events.some(e => e.status === 'sospesa');
        const isComplete = events.some(e => e.type === 'uscita');
        const status: Shift['status'] = !isComplete ? 'in_corso' : hasPending ? 'in_sospeso' : 'confermato';

        let workDuration = 0;
        const startTime = events.find(e => e.type === 'entrata')?.timestamp;
        const endTime = events.find(e => e.type === 'uscita')?.timestamp;

        if (startTime && endTime) {
            let totalMillis = endTime.toMillis() - startTime.toMillis();
            let breakStart: Timestamp | null = null;
            events.forEach(e => {
                if (e.type === 'pausa') breakStart = e.timestamp;
                if (e.type === 'fine_pausa' && breakStart) {
                    totalMillis -= (e.timestamp.toMillis() - breakStart.toMillis());
                    breakStart = null;
                }
            });
            workDuration = totalMillis / (1000 * 60); // duration in minutes
        }
        return { status, workDuration };
    };

    const handleConfirmApprove = async () => {
        if (!firestore || !shiftToApprove || !operator) return;
    
        const approvedOvertimeHours = parseFloat(overtimeHours) || 0;
        const batch = writeBatch(firestore);
        
        shiftToApprove.events.forEach(event => {
            if (event.status === 'sospesa') {
                const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
                batch.update(docRef, { status: 'confermata', viewedByOperator: false });
            }
        });
    
        if (approvedOvertimeHours > 0) {
            const shiftDate = shiftToApprove.events[0].timestamp.toDate();
            const overtimeRequest = {
                userId: operator.id,
                type: 'straordinario' as const,
                status: 'approvato' as const,
                startDate: Timestamp.fromDate(shiftDate),
                endDate: Timestamp.fromDate(shiftDate),
                hours: approvedOvertimeHours,
                reason: 'Straordinario approvato da turno',
                createdAt: serverTimestamp(),
                viewedByOperator: false,
            };
            const newRequestRef = doc(collection(firestore, `app-users/${operator.id}/requests`));
            batch.set(newRequestRef, overtimeRequest);
        }
    
        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno e straordinari approvati.' });
        } catch (err) {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile approvare il turno.', variant: 'destructive' });
        } finally {
            setIsApproveOvertimeOpen(false);
            setShiftToApprove(null);
            setOvertimeHours("0");
        }
    };
    
     const handleRejectShift = async (shiftToReject: Shift) => {
        if (!firestore || !operator) return;
        const batch = writeBatch(firestore);
        shiftToReject.events.forEach(event => {
             if (event.status === 'sospesa') {
                const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
                batch.update(docRef, { status: 'rifiutata', viewedByOperator: false });
            }
        });
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno rifiutato.' });
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile rifiutare il turno.', variant: 'destructive' });
        });
    };

    const handleDeleteShift = async () => {
        if (!firestore || !shiftToDelete || !operator) return;
        const batch = writeBatch(firestore);
        shiftToDelete.events.forEach(event => {
            const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
            batch.delete(docRef);
        });
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno eliminato.' });
            setIsDetailOpen(false);
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile eliminare il turno.', variant: 'destructive' });
        });
        setIsConfirmingDelete(false);
        setShiftToDelete(null);
    };

    const handleOpenEditDialog = (shift: Shift) => {
        setEditingShift(shift);
        const times = { entrata: '', uscita: '', pausa: '', fine_pausa: '' };
        shift.events.forEach(e => {
            times[e.type] = format(e.timestamp.toDate(), 'HH:mm');
        });
        setEditShiftTimes(times);
        setIsEditShiftOpen(true);
    };

    const handleEditShift = async () => {
        if (!firestore || !editingShift || !editShiftTimes.entrata || !editShiftTimes.uscita || !operator) {
            toast({ title: 'Dati mancanti', description: 'Entrata e Uscita sono obbligatorie.', variant: 'destructive' });
            return;
        }

        const batch = writeBatch(firestore);
        const shiftDate = editingShift.events[0].timestamp.toDate();

        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(shiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };
        
        const newEventsMap: Partial<Record<Timbratura['type'], { timestamp: Timestamp }>> = {};
        for (const type of ['entrata', 'uscita', 'pausa', 'fine_pausa'] as const) {
            const time = editShiftTimes[type];
            if (time) {
                const timestamp = createTimestamp(time);
                if (!timestamp) {
                    toast({ title: 'Orario non valido', description: `L'orario per '${type}' non è valido.`, variant: 'destructive' });
                    return;
                }
                newEventsMap[type] = { timestamp };
            }
        }
        
        // Update or delete existing events
        for (const event of editingShift.events) {
            const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
            if (newEventsMap[event.type]) {
                batch.update(docRef, { timestamp: newEventsMap[event.type]!.timestamp, viewedByOperator: false });
                delete newEventsMap[event.type];
            } else {
                batch.delete(docRef);
            }
        }

        // Add new events (e.g. adding a break to a shift that didn't have one)
        for (const type in newEventsMap) {
            const eventType = type as Timbratura['type'];
            const newDocRef = doc(collection(firestore, `app-users/${operator.id}/timbrature`));
            batch.set(newDocRef, {
                userId: operator.id,
                type: eventType,
                timestamp: newEventsMap[eventType]!.timestamp,
                status: 'confermata',
                viewedByOperator: false,
            });
        }
        
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno aggiornato con successo.' });
            setIsEditShiftOpen(false);
            setEditingShift(null);
            // Close detail view as well, as data is now stale.
            setIsDetailOpen(false);
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile aggiornare il turno.', variant: 'destructive' });
        });
    };
    
    const handleConfirmDeleteTimbratura = async () => {
        if (!firestore || !deletingTimbratura || !operator) return;
        const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, deletingTimbratura.id);
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Timbratura eliminata.' });
            setIsDeleteTimbraturaDialogOpen(false);
            setDeletingTimbratura(null);
            // After deleting a part of the shift, we close the detail dialog
            // because the parent component will re-calculate the shift groups.
            setIsDetailOpen(false); 
        }).catch(err => {
            toast({ title: 'Errore', description: 'Impossibile eliminare la timbratura.', variant: 'destructive' });
        });
    };
    
    const handleOpenDetailDialog = (shift: Shift) => {
        setDetailShift(shift);
        setIsDetailOpen(true);
    }
    
    const calculateOvertimeWithTolerance = (shift: Shift | null): number => {
        if (!shift || !operator?.workSchedule) return 0;

        const shiftDate = shift.events[0]?.timestamp.toDate();
        if (!shiftDate) return 0;
        
        const dayOfWeek = getDayFns(shiftDate);
        const dayName = dayIndexToName[dayOfWeek];
        
        const contractualHours = operator.workSchedule[dayName] || 0;
        const contractualMinutes = contractualHours * 60;
        const totalMinutes = shift.workDuration;
        
        if (totalMinutes <= contractualMinutes) return 0;
        
        const overtimeMinutes = totalMinutes - contractualMinutes;
        
        if (overtimeMinutes < 45) return 0;
        
        const hours = Math.floor(overtimeMinutes / 60);
        const remainingMinutes = overtimeMinutes % 60;

        if (remainingMinutes >= 45) {
            return hours + 1;
        }

        return hours;
    };

    const formatMinutes = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const handleOpenOvertimeDialog = (shift: Shift) => {
        const overtimeValue = calculateOvertimeWithTolerance(shift);
        setOvertimeHours(String(overtimeValue));
        setShiftToApprove(shift);
        setIsApproveOvertimeOpen(true);
    }
    
    if (isLoading || !operator) return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    
    const formatTime = (date: Timestamp | undefined) => date ? format(date.toDate(), 'p', { locale: it }) : '--:--';
    const formatDate = (date: Timestamp | undefined) => date ? format(date.toDate(), 'PPP', { locale: it }) : 'N/D';

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Approvazione Turni di {operator.username}</CardTitle>
                    <CardDescription>Conferma o rifiuta i turni di lavoro in sospeso.</CardDescription>
                </CardHeader>
                <CardContent>
                    {shifts.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Nessun turno in attesa di approvazione.</p>
                    ) : (
                        <div className="border rounded-lg overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data Turno</TableHead>
                                        <TableHead>Inizio</TableHead>
                                        <TableHead>Fine</TableHead>
                                        <TableHead>Durata</TableHead>
                                        <TableHead>Stato</TableHead>
                                        <TableHead className="text-right">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shifts.map((shift, index) => {
                                        const startTime = shift.events[0]?.timestamp;
                                        const endTime = shift.events.find(e => e.type === 'uscita')?.timestamp;
                                        return (
                                            <TableRow key={index}>
                                                <TableCell>{formatDate(startTime)}</TableCell>
                                                <TableCell>{formatTime(startTime)}</TableCell>
                                                <TableCell>{formatTime(endTime)}</TableCell>
                                                <TableCell>{formatMinutes(shift.workDuration)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={
                                                        shift.status === 'in_sospeso' ? 'default'
                                                        : shift.status === 'confermato' ? 'secondary'
                                                        : 'outline'
                                                    } className={cn(shift.status === 'in_sospeso' && 'bg-yellow-500 text-white')}>
                                                    {shift.status.replace('_', ' ')}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                <div className="flex justify-end items-center">
                                                        {shift.status === 'in_sospeso' && (
                                                            <>
                                                                <Button variant="ghost" size="icon" onClick={() => handleOpenOvertimeDialog(shift)}>
                                                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" onClick={() => handleRejectShift(shift)}>
                                                                    <XCircle className="h-5 w-5 text-red-500" />
                                                                </Button>
                                                            </>
                                                        )}
                                                        <Button variant="ghost" size="icon" onClick={() => handleOpenDetailDialog(shift)}>
                                                            <Eye className="h-5 w-5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Sei sicuro?</AlertDialogTitle><AlertDialogDescription>Questa azione eliminerà tutte le timbrature di questo turno in modo permanente. L'azione non può essere annullata.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => setShiftToDelete(null)}>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleDeleteShift}>Elimina Turno</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
             <ResponsiveDialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <ResponsiveDialogContent className="sm:max-w-3xl">
                    <ResponsiveDialogHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <ResponsiveDialogTitle>Dettaglio Turno</ResponsiveDialogTitle>
                                {detailShift?.events[0]?.timestamp && <ResponsiveDialogDescription>Turno del {formatDate(detailShift.events[0].timestamp)}</ResponsiveDialogDescription>}
                            </div>
                            {detailShift && detailShift.status !== 'in_corso' && operator && (
                                <div className="flex flex-col items-end gap-1 text-xs">
                                     <Badge variant="outline">
                                        <Clock className="h-3 w-3 mr-1.5" />
                                        Durata: {formatMinutes(detailShift.workDuration)}
                                     </Badge>
                                     <Badge variant="secondary">
                                        <Plus className="h-3 w-3 mr-1.5" />
                                        Straordinari: {`${calculateOvertimeWithTolerance(detailShift)}h`}
                                     </Badge>
                                </div>
                            )}
                        </div>
                    </ResponsiveDialogHeader>

                    <div className="overflow-x-auto my-4 max-h-80 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="whitespace-nowrap">Orario</TableHead>
                                    <TableHead className="whitespace-nowrap">Evento</TableHead>
                                    <TableHead className="whitespace-nowrap">Stato</TableHead>
                                    <TableHead className="whitespace-nowrap">Posizione</TableHead>
                                    <TableHead className="text-right whitespace-nowrap w-[120px]">Azioni</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detailShift?.events.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell className="whitespace-nowrap">{formatTime(t.timestamp)}</TableCell>
                                        <TableCell className="capitalize whitespace-nowrap">{t.type.replace('_', ' ')}</TableCell>
                                        <TableCell className="whitespace-nowrap"><Badge variant={t.status === 'confermata' ? 'secondary' : t.status === 'rifiutata' ? 'destructive' : 'default'}>{t.status}</Badge></TableCell>
                                        <TableCell className="whitespace-nowrap">
                                           {t.latitude && t.longitude ? (
                                                <a href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                                    <MapPin className="h-4 w-4"/> Mappa
                                                </a>
                                            ) : (
                                                <span>Manuale</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            <Button variant="ghost" size="icon" onClick={() => { setDeletingTimbratura(t); setIsDeleteTimbraturaDialogOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <ResponsiveDialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 pt-4">
                        <ResponsiveDialogClose asChild><Button variant="outline">Chiudi</Button></ResponsiveDialogClose>
                        {detailShift && (
                          <>
                            <Button variant="destructive" onClick={() => { setShiftToDelete(detailShift); setIsConfirmingDelete(true); }}><Trash2 className="mr-2 h-4 w-4"/> Elimina Turno</Button>
                            <Button onClick={() => handleOpenEditDialog(detailShift)}><Pencil className="mr-2 h-4 w-4" /> Modifica Turno</Button>
                          </>
                        )}
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

            <ResponsiveDialog open={isEditShiftOpen} onOpenChange={setIsEditShiftOpen}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader><ResponsiveDialogTitle>Modifica Turno</ResponsiveDialogTitle></ResponsiveDialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-entrata">Entrata*</Label>
                                <Input id="edit-entrata" type="time" value={editShiftTimes.entrata} onChange={e => setEditShiftTimes(p => ({...p, entrata: e.target.value}))} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-uscita">Uscita*</Label>
                                <Input id="edit-uscita" type="time" value={editShiftTimes.uscita} onChange={e => setEditShiftTimes(p => ({...p, uscita: e.target.value}))} required />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-pausa">Inizio Pausa (Opz.)</Label>
                                <Input id="edit-pausa" type="time" value={editShiftTimes.pausa} onChange={e => setEditShiftTimes(p => ({...p, pausa: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-fine-pausa">Fine Pausa (Opz.)</Label>
                                <Input id="edit-fine-pausa" type="time" value={editShiftTimes.fine_pausa} onChange={e => setEditShiftTimes(p => ({...p, fine_pausa: e.target.value}))} />
                            </div>
                        </div>
                    </div>
                    <ResponsiveDialogFooter>
                        <Button variant="outline" onClick={() => setIsEditShiftOpen(false)}>Annulla</Button>
                        <Button onClick={handleEditShift}>Salva Modifiche</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

            <AlertDialog open={isApproveOvertimeOpen} onOpenChange={setIsApproveOvertimeOpen}>
                <AlertDialogContent>
                     <AlertDialogHeader>
                        <AlertDialogTitle>Approva Turno e Straordinari</AlertDialogTitle>
                        <AlertDialogDescription>Conferma le ore di straordinario da assegnare. Il valore è pre-calcolato con la regola di arrotondamento (scatta dopo 45 min).</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                        <Label htmlFor="overtime-hours" className="text-sm font-medium">Ore di Straordinario Approvate</Label>
                        <Input id="overtime-hours" type="number" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} step="1" min="0" />
                        <p className="text-xs text-muted-foreground mt-2">Puoi modificare il valore calcolato prima di approvare.</p>
                    </div>
                     <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmApprove}>Approva</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isDeleteTimbraturaDialogOpen} onOpenChange={setIsDeleteTimbraturaDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Eliminare questa timbratura?</AlertDialogTitle><AlertDialogDescription>L'azione è permanente e non può essere annullata.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => setDeletingTimbratura(null)}>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDeleteTimbratura}>Elimina</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
