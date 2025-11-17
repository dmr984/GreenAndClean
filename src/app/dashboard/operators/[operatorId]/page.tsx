'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, User, ClipboardList, PackageSearch, ListChecks, Calendar, CheckCircle, XCircle, MapPin, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Trash2, Eye, Pencil, AlertCircle, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter, ResponsiveDialogClose } from '@/components/ui/responsive-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, parse, set, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval } from 'date-fns';
import { it } from 'date-fns/locale';
import { getDay as getDayFns } from 'date-fns';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Calendar as CalendarPop } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';

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
    status: 'sospesa' | 'confermata';
    latitude?: number;
    longitude?: number;
};

type Shift = {
    events: Timbratura[];
    status: 'in_sospeso' | 'in_corso' | 'confermato';
    workDuration: number; // total work minutes
};


type Request = {
    id: string; // Document ID of the request
    userId: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'in_attesa' | 'approvato' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    reason?: string;
    createdAt: Timestamp;
};

type SupplyRequest = {
    id: string;
    userId: string;
    username: string;
    productId: string;
    productName: string;
    requestedQuantity: number;
    approvedQuantity?: number;
    status: 'in_attesa' | 'approvata' | 'rifiutata';
    createdAt: any;
};

type DetailView = {
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    title: string;
    items: Request[];
} | null;

const ShiftApproval = ({ operator, setPendingCount }: { operator: Operator, setPendingCount: (count: number) => void }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
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


    useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, `app-users/${operator.id}/timbrature`), where('status', '==', 'sospesa'));
        
        const unsubscribe = onSnapshot(q, snapshot => {
            const pendingClockings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));
            
            // This is a simplified view for notification. We group all pending by day.
            const pendingDays = new Set(pendingClockings.map(c => c.timestamp.toDate().toDateString()));
            setPendingCount(pendingDays.size > 0 ? 1 : 0); // Simplified: 1 if ANY shifts are pending

            const fetchAllClockingsForPendingDays = async () => {
                if (pendingClockings.length === 0) {
                    setShifts([]);
                    setIsLoading(false);
                    return;
                }
                
                const allClockingsQuery = query(collection(firestore, `app-users/${operator.id}/timbrature`), orderBy('timestamp', 'asc'));
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
            setPendingCount(0);
        });
        return unsubscribe;
    }, [firestore, operator.id, toast, setPendingCount]);

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

    const handleApproveShift = async (shiftToApprove: Shift, approvedOvertimeHours: number) => {
        if (!firestore) return;
        const batch = writeBatch(firestore);
        
        shiftToApprove.events.forEach(event => {
            if (event.status === 'sospesa') {
                const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
                batch.update(docRef, { status: 'confermata' });
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
            };
            const newRequestRef = doc(collection(firestore, `app-users/${operator.id}/requests`));
            batch.set(newRequestRef, overtimeRequest);
        }

        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno e straordinari approvati.' });
            setIsDetailOpen(false);
            setIsApproveOvertimeOpen(false);
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile approvare il turno.', variant: 'destructive' });
        });
    };
    
     const handleRejectShift = async (shiftToReject: Shift) => {
        if (!firestore) return;
        const batch = writeBatch(firestore);
        shiftToReject.events.forEach(event => {
            const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
            batch.delete(docRef);
        });
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno rifiutato ed eliminato.' });
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile rifiutare il turno.', variant: 'destructive' });
        });
    };

    const handleDeleteShift = async () => {
        if (!firestore || !shiftToDelete) return;
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
        if (!firestore || !editingShift || !editShiftTimes.entrata || !editShiftTimes.uscita) {
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
                batch.update(docRef, { timestamp: newEventsMap[event.type]!.timestamp });
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
        if (!firestore || !deletingTimbratura) return;
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

    const calculateOvertime = (shift: Shift | null): { regular: number, overtime: number } => {
        if (!shift || !operator.workSchedule) return { regular: 0, overtime: 0 };
        const shiftDate = shift.events[0]?.timestamp.toDate();
        if (!shiftDate) return { regular: 0, overtime: 0 };

        const dayOfWeekFns = getDay(shiftDate); // date-fns: Sunday = 0, Saturday = 6
        const dayName = dayIndexToName[dayOfWeekFns];

        const contractualHours = operator.workSchedule[dayName] || 0;
        const contractualMinutes = contractualHours * 60;
        const totalMinutes = shift.workDuration;
        
        if (contractualMinutes === 0) {
            return { regular: 0, overtime: totalMinutes };
        }

        if (totalMinutes > contractualMinutes) {
            const overtimeMinutes = totalMinutes - contractualMinutes;
            return { regular: contractualMinutes, overtime: overtimeMinutes };
        }

        return { regular: totalMinutes, overtime: 0 };
    };

    const formatMinutes = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const handleOpenOvertimeDialog = (shift: Shift) => {
        const { overtime } = calculateOvertime(shift);
        const overtimeInHours = (overtime / 60).toFixed(2);
        setOvertimeHours(overtimeInHours);
        setDetailShift(shift);
        setIsApproveOvertimeOpen(true);
    }
    

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    if (shifts.length === 0) return <p className="text-sm text-muted-foreground">Nessun turno in attesa di approvazione.</p>;
    
    const formatTime = (date: Timestamp | undefined) => date ? format(date.toDate(), 'p', { locale: it }) : '--:--';
    const formatDate = (date: Timestamp | undefined) => date ? format(date.toDate(), 'PPP', { locale: it }) : 'N/D';

    return (
        <>
            <div className="border rounded-lg">
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

            <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Sei sicuro?</AlertDialogTitle><AlertDialogDescription>Questa azione eliminerà tutte le timbrature di questo turno in modo permanente. L'azione non può essere annullata.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => setShiftToDelete(null)}>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleDeleteShift}>Elimina Turno</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
             <ResponsiveDialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <ResponsiveDialogContent className="sm:max-w-3xl">
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Dettaglio Turno</ResponsiveDialogTitle>
                         {detailShift?.events[0]?.timestamp && <ResponsiveDialogDescription>Turno del {formatDate(detailShift.events[0].timestamp)}</ResponsiveDialogDescription>}
                    </ResponsiveDialogHeader>

                     {detailShift && detailShift.status !== 'in_corso' && (
                        <Card className="my-4">
                            <CardHeader className="pb-2"><CardTitle className="text-lg">Riepilogo Ore</CardTitle></CardHeader>
                            <CardContent className="text-sm">
                                <div className="grid grid-cols-3 gap-2">
                                    <div><p className="font-semibold">Durata Turno</p><p>{formatMinutes(detailShift.workDuration)}</p></div>
                                    <div><p className="font-semibold">Ore Ordinarie</p><p>{formatMinutes(calculateOvertime(detailShift).regular)}</p></div>
                                    <div className={cn(calculateOvertime(detailShift).overtime > 0 && "text-amber-600 font-bold")}><p className="font-semibold">Straordinario</p><p>{formatMinutes(calculateOvertime(detailShift).overtime)}</p></div>
                                </div>
                            </CardContent>
                        </Card>
                     )}

                    <div className="overflow-x-auto my-4 max-h-96 overflow-y-auto">
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
                                        <TableCell className="whitespace-nowrap"><Badge variant={t.status === 'confermata' ? 'secondary' : 'default'}>{t.status}</Badge></TableCell>
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
                    <ResponsiveDialogFooter className="flex-col sm:flex-row sm:justify-end gap-2">
                        <ResponsiveDialogClose asChild><Button variant="outline">Chiudi</Button></ResponsiveDialogClose>
                        {detailShift && (
                          <>
                            <Button variant="destructive" onClick={() => { setShiftToDelete(detailShift); setIsConfirmingDelete(true); }}><Trash2 className="mr-2 h-4 w-4"/> Elimina Turno</Button>
                            <Button onClick={() => handleOpenEditDialog(detailShift)}><Pencil className="mr-2 h-4 w-4" /> Modifica Turno</Button>
                            {detailShift.status === 'in_sospeso' && (
                                <Button onClick={() => handleOpenOvertimeDialog(detailShift)}><CheckCircle className="mr-2 h-4 w-4" /> Approva</Button>
                            )}
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
                        <AlertDialogDescription>Conferma le ore di straordinario da assegnare per questo turno. Puoi modificare il valore calcolato.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                        <Label htmlFor="overtime-hours" className="text-sm font-medium">Ore di Straordinario</Label>
                        <Input id="overtime-hours" type="number" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} step="0.01" min="0" />
                        <p className="text-xs text-muted-foreground mt-2">Usa il punto (.) per i decimali. Es: 1.5 per un'ora e mezza.</p>
                    </div>
                     <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={() => detailShift && handleApproveShift(detailShift, parseFloat(overtimeHours) || 0)}>Approva</AlertDialogAction>
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


const LeaveRequests = ({ operatorId, setPendingCount }: { operatorId: string, setPendingCount: (count: number) => void }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [itemToDelete, setItemToDelete] = useState<Request | null>(null);
    const [editingRequest, setEditingRequest] = useState<Request | null>(null);

    useEffect(() => {
        if (!firestore) return;
        const q = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            where('status', '==', 'in_attesa'),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            const pendingRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request));
            setRequests(pendingRequests);
            setPendingCount(snapshot.size);
            setIsLoading(false);
        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le richieste.', variant: 'destructive' });
            setIsLoading(false);
            setPendingCount(0);
        });
        return unsubscribe;
    }, [firestore, operatorId, toast, setPendingCount]);

    const handleUpdateRequestStatus = (requestId: string, newStatus: 'approvato' | 'rifiutato') => {
        if (!firestore) return;
        const docRef = doc(firestore, `app-users/${operatorId}/requests`, requestId);
        updateDoc(docRef, { status: newStatus }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile aggiornare la richiesta.', variant: 'destructive' });
        });
    };
    
    const handleDelete = async () => {
        if (!firestore || !itemToDelete) return;
        const docRef = doc(firestore, `app-users/${operatorId}/requests`, itemToDelete.id);
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Richiesta eliminata.' });
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile eliminare la richiesta.', variant: 'destructive' });
        });
        setItemToDelete(null);
    };

    const handleEditRequest = (request: Request) => {
        setEditingRequest(request);
    };
    
    const handleSaveEdit = async (editedData: Partial<Request>) => {
        if(!firestore || !editingRequest) return;
        
        const docRef = doc(firestore, `app-users/${operatorId}/requests`, editingRequest.id);
        await updateDoc(docRef, editedData).then(() => {
            toast({title: 'Successo', description: 'Richiesta aggiornata'});
            setEditingRequest(null);
        }).catch(err => {
            toast({title: 'Errore', description: 'Impossibile aggiornare la richiesta.', variant: 'destructive'});
        });
    };

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    if (requests.length === 0) return <p className="text-sm text-muted-foreground">Nessuna richiesta in attesa.</p>;

    return (
        <>
        <Table>
            <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Dal</TableHead><TableHead>Al</TableHead><TableHead>Ore</TableHead><TableHead className='text-right'>Azioni</TableHead></TableRow></TableHeader>
            <TableBody>
                {requests.map(req => (
                    <TableRow key={req.id}>
                        <TableCell className="capitalize">{req.type.replace('_', ' ')}</TableCell>
                        <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{req.hours || '-'}</TableCell>
                        <TableCell className='text-right'>
                            <div className="flex gap-2 justify-end">
                                <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req.id, 'approvato')}><CheckCircle className="h-5 w-5 text-green-500" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req.id, 'rifiutato')}><XCircle className="h-5 w-5 text-red-500" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleEditRequest(req)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setItemToDelete(req)}><Trash2 className="h-5 w-5 text-destructive" /></Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
         <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione eliminerà la richiesta in modo permanente. L'azione non può essere annullata.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {editingRequest && (
            <EditRequestDialog 
                request={editingRequest} 
                onSave={handleSaveEdit}
                onClose={() => setEditingRequest(null)}
            />
        )}
        </>
    );
};

const EditRequestDialog = ({ request, onSave, onClose }: { request: Request; onSave: (data: Partial<Request>) => void; onClose: () => void; }) => {
    const [type, setType] = useState(request.type);
    const [startDate, setStartDate] = useState(request.startDate.toDate());
    const [endDate, setEndDate] = useState(request.endDate.toDate());
    const [hours, setHours] = useState(request.hours?.toString() || '');
    const [reason, setReason] = useState(request.reason || '');

    const handleSave = () => {
        const editedData: Partial<Request> = {
            type,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(endDate),
            reason
        };
        if(type === 'permesso' || type === 'straordinario') {
            editedData.hours = parseFloat(hours) || 0;
        } else {
            delete editedData.hours;
        }
        onSave(editedData);
    };

    return (
        <ResponsiveDialog open={true} onOpenChange={onClose}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader><ResponsiveDialogTitle>Modifica Richiesta</ResponsiveDialogTitle></ResponsiveDialogHeader>
                <div className="space-y-4 py-4">
                     <div><Label>Tipo</Label><Select value={type} onValueChange={(v) => setType(v as any)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ferie">Ferie</SelectItem><SelectItem value="permesso">Permesso</SelectItem><SelectItem value="malattia">Malattia</SelectItem><SelectItem value="straordinario">Straordinario</SelectItem></SelectContent></Select></div>
                     <div><Label>Data Inizio</Label><CalendarPop mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} className="rounded-md border"/></div>
                     <div><Label>Data Fine</Label><CalendarPop mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} fromDate={startDate} className="rounded-md border"/></div>
                    {(type === 'permesso' || type === 'straordinario') && <div><Label>Ore</Label><Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} /></div>}
                    <div><Label>Motivazione</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                </div>
                <ResponsiveDialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button onClick={handleSave}>Salva Modifiche</Button></ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    );
};


const SupplyRequests = ({ operatorId, setPendingCount }: { operatorId: string, setPendingCount: (count: number) => void }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<SupplyRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<SupplyRequest | null>(null);
    const [approvedQuantity, setApprovedQuantity] = useState('');
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<SupplyRequest | null>(null);

     useEffect(() => {
        if (!firestore) return;
        const q = query(
            collection(firestore, 'supply-requests'),
            where('userId', '==', operatorId),
            where('status', '==', 'in_attesa')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            const pendingRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SupplyRequest));
            pendingRequests.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
            setRequests(pendingRequests);
            setPendingCount(snapshot.size);
            setIsLoading(false);
        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le richieste di fornitura.', variant: 'destructive' });
            setIsLoading(false);
            setPendingCount(0);
        });
        return unsubscribe;
    }, [firestore, operatorId, toast, setPendingCount]);
    
    const openApproveDialog = (request: SupplyRequest) => {
        setSelectedRequest(request);
        setApprovedQuantity(String(request.requestedQuantity));
        setIsApproveDialogOpen(true);
    };

    const handleApproveRequest = async () => {
        if (!firestore || !selectedRequest) return;
        const finalQuantity = parseInt(approvedQuantity, 10);
        if (isNaN(finalQuantity) || finalQuantity < 0) {
            toast({ title: "Quantità Invalida", variant: "destructive"});
            return;
        }

        const requestRef = doc(firestore, 'supply-requests', selectedRequest.id);
        const productRef = doc(firestore, 'products', selectedRequest.productId);
        const updatePayload = { status: 'approvata' as const, approvedQuantity: finalQuantity };

        try {
            await runTransaction(firestore, async (transaction) => {
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) throw new Error("Prodotto non trovato.");
                const currentStock = productDoc.data().quantity;
                if (currentStock < finalQuantity) throw new Error(`Scorte insufficienti: ${currentStock}.`);
                transaction.update(productRef, { quantity: currentStock - finalQuantity });
                transaction.update(requestRef, updatePayload);
            });
            toast({ title: "Successo", description: "Richiesta approvata e magazzino aggiornato." });
        } catch (error: any) {
             toast({ title: "Errore", description: error.message || "Impossibile approvare la richiesta.", variant: "destructive"});
        } finally {
            setIsApproveDialogOpen(false);
        }
    };
    
    const handleRejectRequest = async (request: SupplyRequest) => {
        if (!firestore) return;
        const requestRef = doc(firestore, 'supply-requests', request.id);
        updateDoc(requestRef, { status: 'rifiutata' as const }).catch(err => toast({ title: 'Errore', description: 'Impossibile rifiutare la richiesta.', variant: 'destructive'}));
    };

    const handleDelete = async () => {
        if (!firestore || !itemToDelete) return;
        const docRef = doc(firestore, `supply-requests`, itemToDelete.id);
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Richiesta di fornitura eliminata.' });
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile eliminare la richiesta.', variant: 'destructive' });
        });
        setItemToDelete(null);
    };

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    if (requests.length === 0) return <p className="text-sm text-muted-foreground">Nessuna richiesta di fornitura in attesa.</p>;

    return (
        <>
            <Table>
                <TableHeader><TableRow><TableHead>Prodotto</TableHead><TableHead>Qtà Rich.</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Azioni</TableHead></TableRow></TableHeader>
                <TableBody>
                    {requests.map(req => (
                        <TableRow key={req.id}>
                            <TableCell>{req.productName}</TableCell>
                            <TableCell>{req.requestedQuantity}</TableCell>
                            <TableCell>{req.createdAt?.toDate().toLocaleDateString('it-IT')}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" size="icon" onClick={() => openApproveDialog(req)}><CheckCircle className="h-5 w-5 text-green-500" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleRejectRequest(req)}><XCircle className="h-5 w-5 text-red-500" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => setItemToDelete(req)}><Trash2 className="h-5 w-5 text-destructive" /></Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Approva Richiesta</AlertDialogTitle></AlertDialogHeader>
                    <div className="grid gap-4 py-4"><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="approved-quantity" className="text-right">Quantità</Label><Input id="approved-quantity" type="number" value={approvedQuantity} onChange={(e) => setApprovedQuantity(e.target.value)} className="col-span-3"/></div></div>
                    <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleApproveRequest}>Approva</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà la richiesta di fornitura in modo permanente. L'azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

const MonthlySummary = ({ operatorId, operator }: { operatorId: string, operator: Operator }) => {
    const firestore = useFirestore();
    const router = useRouter();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [detailView, setDetailView] = useState<DetailView>(null);

    useEffect(() => {
        if (!firestore || !operatorId) return;
        setIsLoading(true);

        const startOfMonthValue = startOfMonth(currentDate);
        const endOfMonthValue = endOfMonth(currentDate);

        const requestsQuery = query(
            collection(firestore, `app-users/${operatorId}/requests`),
        );
        
        const timbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', Timestamp.fromDate(startOfMonthValue)),
            where('timestamp', '<=', Timestamp.fromDate(endOfMonthValue))
        );
        
        const unsubRequests = onSnapshot(requestsQuery, s => {
            const allRequests = s.docs.map(d => ({id: d.id, ...d.data()} as Request));
            setRequests(allRequests);
        }, () => setIsLoading(false));

        const unsubTimbrature = onSnapshot(timbratureQuery, s => {
            setTimbrature(s.docs.map(d => d.data() as Timbratura));
            setIsLoading(false);
        }, () => setIsLoading(false));

        return () => { 
            unsubRequests(); 
            unsubTimbrature(); 
        };
    }, [firestore, operatorId, currentDate]);


    const summary = useMemo(() => {
        const confirmedTimbrature = timbrature.filter(t => t.status === 'confermata');

        const dailyTimbrature = confirmedTimbrature.reduce((acc, t) => {
            const day = t.timestamp.toDate().toDateString();
            if (!acc[day]) acc[day] = [];
            acc[day].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);

        let workedDaysCount = 0;
        Object.values(dailyTimbrature).forEach(dayEvents => {
            const hasEntrata = dayEvents.some(e => e.type === 'entrata');
            const hasUscita = dayEvents.some(e => e.type === 'uscita');
            if (hasEntrata && hasUscita) {
                workedDaysCount++;
            }
        });

        const approvedRequests = requests.filter(r => r.status === 'approvato');
        let ferieDaysCount = 0;
        let malattiaDaysCount = 0;

        const periodStart = startOfMonth(currentDate);
        const periodEnd = endOfMonth(currentDate);
        
        if (operator) {
            approvedRequests.forEach(req => {
                if (req.type === 'ferie' || req.type === 'malattia') {
                    for (let day = new Date(req.startDate.toDate()); day <= req.endDate.toDate(); day.setDate(day.getDate() + 1)) {
                        if (isWithinInterval(day, { start: periodStart, end: periodEnd })) {
                            const dayName = dayIndexToName[getDay(day)];
                            const contractualHours = operator.workSchedule[dayName] || 0;
                            if (contractualHours > 0) {
                                if (req.type === 'ferie') ferieDaysCount++;
                                if (req.type === 'malattia') malattiaDaysCount++;
                            }
                        }
                    }
                }
            });
        }


        return {
            workedDays: workedDaysCount,
            overtimeHours: approvedRequests.filter(r => r.type === 'straordinario').reduce((sum, r) => sum + (r.hours || 0), 0),
            ferieDays: ferieDaysCount,
            permessoHours: approvedRequests.filter(r => r.type === 'permesso').reduce((sum, r) => sum + (r.hours || 0), 0),
            malattiaDays: malattiaDaysCount,
        };
    }, [timbrature, requests, operator, currentDate]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const handleWorkedDaysClick = () => {
        const month = currentDate.getMonth() + 1;
        const year = currentDate.getFullYear();
        router.push(`/dashboard/daily-summary?month=${month}&year=${year}&operatorId=${operatorId}`);
    };
    
    const handleSummaryCardClick = (type: DetailView['type'], title: string) => {
        if (!type) return;
        const approvedRequests = requests.filter(r => r.type === type && r.status === 'approvato');
        setDetailView({ type, title, items: approvedRequests });
    };

    const renderDetailTable = () => {
        if (!detailView || detailView.items.length === 0) {
            return <p className="text-center text-muted-foreground py-4">Nessun dato per questo mese.</p>;
        }

        const monthInterval = { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };

        if (detailView.type === 'ferie' || detailView.type === 'malattia') {
            const allDays: Date[] = [];
            detailView.items.forEach(item => {
                const interval = { start: item.startDate.toDate(), end: item.endDate.toDate() };
                const daysInInterval = eachDayOfInterval(interval);

                daysInInterval.forEach(day => {
                    if (isWithinInterval(day, monthInterval)) {
                        const dayName = dayIndexToName[getDay(day)];
                        const contractualHours = operator?.workSchedule[dayName] || 0;
                        if (contractualHours > 0) {
                            allDays.push(day);
                        }
                    }
                });
            });

            if (allDays.length === 0) {
                return <p className="text-center text-muted-foreground py-4">Nessun giorno di {detailView.type} per questo mese.</p>;
            }

            return (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Giorno</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {allDays.map((day, index) => (
                            <TableRow key={index}>
                                <TableCell>{format(day, 'PPP', { locale: it })}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            );
        }

        const filteredItems = detailView.items.filter(item => {
             const start = item.startDate.toDate();
             const end = item.endDate.toDate();
             return isWithinInterval(start, monthInterval) || isWithinInterval(end, monthInterval) || (start < monthInterval.start && end > monthInterval.end);
        });
        
        if (filteredItems.length === 0) {
            return <p className="text-center text-muted-foreground py-4">Nessun dato per questo mese.</p>;
        }

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Dal</TableHead>
                        <TableHead>Al</TableHead>
                        {(detailView.type === 'permesso' || detailView.type === 'straordinario') && <TableHead>Ore</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredItems.map(item => (
                         <TableRow key={item.id}>
                            <TableCell>{format(item.startDate.toDate(), 'PPP', { locale: it })}</TableCell>
                            <TableCell>{format(item.endDate.toDate(), 'PPP', { locale: it })}</TableCell>
                            {(detailView.type === 'permesso' || detailView.type === 'straordinario') && <TableCell>{item.hours}</TableCell>}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    };


    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    
    return (
        <>
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                <h4 className="text-lg font-semibold">{format(currentDate, 'MMMM yyyy', { locale: it })}</h4>
                <Button variant="outline" onClick={() => handleMonthChange(1)}>Succ.</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card
                  onClick={handleWorkedDaysClick}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle><Briefcase className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedDays}</div></CardContent>
                </Card>
                <Card
                  onClick={() => handleSummaryCardClick('straordinario', 'Dettaglio Straordinari')}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Straordinari (ore)</CardTitle><Plus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.overtimeHours}</div></CardContent></Card>
                <Card
                  onClick={() => handleSummaryCardClick('ferie', 'Dettaglio Ferie')}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle><Plane className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.ferieDays}</div></CardContent></Card>
                <Card
                    onClick={() => handleSummaryCardClick('permesso', 'Dettaglio Permessi')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle><UserCheck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.permessoHours}</div></CardContent></Card>
                <Card
                    onClick={() => handleSummaryCardClick('malattia', 'Dettaglio Malattia')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle><Stethoscope className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.malattiaDays}</div></CardContent></Card>
            </div>
        </div>
        <ResponsiveDialog open={!!detailView} onOpenChange={() => setDetailView(null)}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>{detailView?.title}</ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        Riepilogo delle richieste approvate per {format(currentDate, 'MMMM yyyy', { locale: it })}.
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                 <div className="py-4">
                    {renderDetailTable()}
                </div>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
        </>
    );
};

export default function OperatorDetailPage() {
    const params = useParams();
    const operatorId = Array.isArray(params.operatorId) ? params.operatorId[0] : params.operatorId;
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [accordionState, setAccordionState] = useState<string[]>([]);

    const [pendingShiftsCount, setPendingShiftsCount] = useState(0);
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
    const [pendingSupplyCount, setPendingSupplyCount] = useState(0);

    const operatorDocRef = useMemoFirebase(() => {
        if (!firestore || !operatorId) return null;
        return doc(firestore, 'app-users', operatorId);
    }, [firestore, operatorId]);
    
    useEffect(() => {
        if (!operatorDocRef) return;
        getDoc(operatorDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            }
            setIsLoading(false);
        });
    }, [operatorDocRef]);


    if (isLoading || isUserLoading) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground">Accesso Negato.</div>;
    }

    if (!operator) {
        return <div className="text-center text-muted-foreground">Operatore non trovato.</div>;
    }

    const getAvatarFallback = (username: string) => {
        const parts = username.split(' ');
        if (parts.length > 1 && parts[0] && parts[1]) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return username.substring(0, 2).toUpperCase();
    };
    
    const formatWorkSchedule = (schedule?: WorkSchedule) => {
        if (!schedule) return 'Nessun programma impostato.';
        const dayMapping: Record<DayOfWeek, string> = { monday: 'Lun', tuesday: 'Mar', wednesday: 'Mer', thursday: 'Gio', friday: 'Ven', saturday: 'Sab', sunday: 'Dom' };
        
        const scheduleString = dayIndexToName
            .filter(day => schedule[day] && schedule[day]! > 0)
            .map(day => `${dayMapping[day]}: ${schedule[day]}h`)
            .join(' | ');

        return scheduleString || 'Nessun giorno lavorativo impostato.';
    };

    const AccordionTriggerWithBadge = ({ children, count }: { children: React.ReactNode, count: number }) => (
        <div className="flex items-center gap-3">
            {children}
            {count > 0 && <Badge variant="destructive" className="flex h-5 w-5 items-center justify-center rounded-full p-0">{count > 9 ? '9+' : count}</Badge>}
        </div>
    );
    
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-xl">{getAvatarFallback(operator.username)}</AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{operator.username}</h1>
                    <p className="text-muted-foreground">{formatWorkSchedule(operator.workSchedule)}</p>
                </div>
            </div>

            <Accordion type="multiple" className="w-full space-y-4" value={accordionState} onValueChange={setAccordionState}>
                 <Card>
                    <AccordionItem value="item-1" className="border-b-0">
                        <AccordionTrigger className="p-6" onClick={() => pendingShiftsCount > 0 && setPendingShiftsCount(0)}>
                           <AccordionTriggerWithBadge count={pendingShiftsCount}>
                                <ListChecks className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Approvazione Turni e Straordinari</h3>
                            </AccordionTriggerWithBadge>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                            <ShiftApproval operator={operator} setPendingCount={setPendingShiftsCount} />
                        </AccordionContent>
                    </AccordionItem>
                </Card>
                 <Card>
                    <AccordionItem value="item-2" className="border-b-0">
                        <AccordionTrigger className="p-6" onClick={() => pendingLeaveCount > 0 && setPendingLeaveCount(0)}>
                            <AccordionTriggerWithBadge count={pendingLeaveCount}>
                                <ClipboardList className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Gestione Richieste Ferie/Permessi</h3>
                            </AccordionTriggerWithBadge>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                           <LeaveRequests operatorId={operator.id} setPendingCount={setPendingLeaveCount} />
                        </AccordionContent>
                    </AccordionItem>
                </Card>
                 <Card>
                    <AccordionItem value="item-3" className="border-b-0">
                        <AccordionTrigger className="p-6" onClick={() => pendingSupplyCount > 0 && setPendingSupplyCount(0)}>
                             <AccordionTriggerWithBadge count={pendingSupplyCount}>
                                <PackageSearch className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Gestione Richieste Forniture</h3>
                            </AccordionTriggerWithBadge>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                           <SupplyRequests operatorId={operator.id} setPendingCount={setPendingSupplyCount} />
                        </AccordionContent>
                    </AccordionItem>
                </Card>
                 <Card>
                    <AccordionItem value="item-4" className="border-b-0">
                        <AccordionTrigger className="p-6">
                             <div className="flex items-center gap-3">
                                <Calendar className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Riepilogo Mensile</h3>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                           <MonthlySummary operatorId={operator.id} operator={operator}/>
                        </AccordionContent>
                    </AccordionItem>
                </Card>
            </Accordion>
        </div>
    );
}
