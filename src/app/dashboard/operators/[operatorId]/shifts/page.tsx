'use client';
import React, { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Loader2, User, CheckCircle, XCircle, MapPin, Trash2, Eye, Pencil, AlertCircle, Circle, Clock, Briefcase, Plus, PlusCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter, ResponsiveDialogClose } from '@/components/ui/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, set, getDay as getDayFns, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';

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
    status: 'in_sospeso' | 'in_corso' | 'confermato' | 'rifiutato';
    workDuration: number; // total work minutes
    isOnLeaveDay?: boolean; // Flag for shifts on leave days
};

type ApprovalData = {
    shiftToApprove: Shift | null;
    overtimeHours: string;
    leaveHours: string;
};

const ITEMS_PER_PAGE = 5;

export default function ShiftApprovalPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const params = useParams();
    const operatorId = params.operatorId as string;
    const [operator, setOperator] = useState<Operator | null>(null);

    const [allShifts, setAllShifts] = useState<Shift[]>([]);

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

    const [approvalData, setApprovalData] = useState<ApprovalData>({ shiftToApprove: null, overtimeHours: "0", leaveHours: "0"});
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);

    const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
    const [newShiftDate, setNewShiftDate] = useState<Date | undefined>(new Date());
    const [newShiftTimes, setNewShiftTimes] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    const [isNonWorkDayConfirmOpen, setIsNonWorkDayConfirmOpen] = useState(false);
    
    const [currentPage, setCurrentPage] = useState(0);

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
        
        const allClockingsQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), orderBy('timestamp', 'asc'));
        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('status', '==', 'approvato'));

        const unsubClockings = onSnapshot(allClockingsQuery, async (clockingSnapshot) => {
            const allClockings = clockingSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));
            
            const requestSnapshot = await getDocs(requestsQuery);
            const leaveDays = new Set<string>();
            requestSnapshot.forEach(doc => {
                const req = doc.data();
                if (req.type === 'ferie' || req.type === 'malattia') {
                    for(let d = req.startDate.toDate(); d <= req.endDate.toDate(); d.setDate(d.getDate() + 1)) {
                        leaveDays.add(format(d, 'yyyy-MM-dd'));
                    }
                }
            });


            const groupedShifts: Shift[] = [];
            let currentShiftEvents: Timbratura[] = [];

            for (const event of allClockings) {
                if (event.type === 'entrata' && currentShiftEvents.length > 0) {
                    const processed = processShift(currentShiftEvents, leaveDays);
                    groupedShifts.push({ events: currentShiftEvents, ...processed });
                    currentShiftEvents = [event];
                } else {
                    currentShiftEvents.push(event);
                    if (event.type === 'uscita') {
                        const processed = processShift(currentShiftEvents, leaveDays);
                        groupedShifts.push({ events: currentShiftEvents, ...processed });
                        currentShiftEvents = [];
                    }
                }
            }

            if (currentShiftEvents.length > 0) {
                const processed = processShift(currentShiftEvents, leaveDays);
                groupedShifts.push({ events: currentShiftEvents, ...processed });
            }
            
            setAllShifts(groupedShifts.reverse());
            setIsLoading(false);

        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le timbrature.', variant: 'destructive' });
            setIsLoading(false);
        });

        return () => unsubClockings();
    }, [firestore, operatorId, toast]);

    const { pendingShifts, approvedShifts } = useMemo(() => {
        const pending = allShifts.filter(s => s.status === 'in_sospeso' || s.status === 'in_corso');
        const approved = allShifts.filter(s => s.status === 'confermato' || s.status === 'rifiutato');
        return { pendingShifts: pending, approvedShifts: approved };
    }, [allShifts]);

    const processShift = (events: Timbratura[], leaveDays: Set<string>): { status: Shift['status'], workDuration: number, isOnLeaveDay: boolean } => {
        const hasPending = events.some(e => e.status === 'sospesa');
        const hasRejected = events.some(e => e.status === 'rifiutata');
        const isComplete = events.some(e => e.type === 'uscita');
        
        let status: Shift['status'];
        if (hasRejected) {
            status = 'rifiutato';
        } else if (!isComplete) {
            status = 'in_corso';
        } else if (hasPending) {
            status = 'in_sospeso';
        } else {
            status = 'confermato';
        }

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
        
        const shiftDateStr = startTime ? format(startTime.toDate(), 'yyyy-MM-dd') : '';
        const isOnLeaveDay = leaveDays.has(shiftDateStr);

        return { status, workDuration, isOnLeaveDay };
    };

    const handleConfirmApprove = async () => {
        const { shiftToApprove, overtimeHours, leaveHours } = approvalData;
        if (!firestore || !shiftToApprove || !operator) return;
    
        const approvedOvertime = parseFloat(overtimeHours) || 0;
        const approvedLeave = parseFloat(leaveHours) || 0;

        const batch = writeBatch(firestore);
        
        shiftToApprove.events.forEach(event => {
            if (event.status === 'sospesa') {
                const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
                batch.update(docRef, { status: 'confermata', viewedByOperator: false });
            }
        });
    
        const shiftDate = shiftToApprove.events[0].timestamp.toDate();

        if (approvedOvertime > 0) {
            const overtimeRequest = {
                userId: operator.id,
                type: 'straordinario' as const,
                status: 'approvato' as const,
                startDate: Timestamp.fromDate(shiftDate),
                endDate: Timestamp.fromDate(shiftDate),
                hours: approvedOvertime,
                reason: 'Straordinario approvato da turno',
                createdAt: serverTimestamp(),
                viewedByOperator: false,
            };
            const newRequestRef = doc(collection(firestore, `app-users/${operator.id}/requests`));
            batch.set(newRequestRef, overtimeRequest);
        }

        if (approvedLeave > 0) {
            const leaveRequest = {
                userId: operator.id,
                type: 'permesso' as const,
                status: 'approvato' as const,
                startDate: Timestamp.fromDate(shiftDate),
                endDate: Timestamp.fromDate(shiftDate),
                hours: approvedLeave,
                reason: 'Permesso generato da ammanco ore',
                createdAt: serverTimestamp(),
                viewedByOperator: false,
            };
            const newRequestRef = doc(collection(firestore, `app-users/${operator.id}/requests`));
            batch.set(newRequestRef, leaveRequest);
        }
    
        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno approvato e richieste registrate.' });
        } catch (err) {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile approvare il turno.', variant: 'destructive' });
        } finally {
            setIsApproveDialogOpen(false);
            setApprovalData({ shiftToApprove: null, overtimeHours: "0", leaveHours: "0"});
            setIsDetailOpen(false);
        }
    };
    
     const handleRejectShift = async (shiftToReject: Shift | null) => {
        if (!firestore || !operator || !shiftToReject) return;
        const batch = writeBatch(firestore);
        shiftToReject.events.forEach(event => {
             if (event.status === 'sospesa') {
                const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
                batch.update(docRef, { status: 'rifiutata', viewedByOperator: false });
            }
        });
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno rifiutato.' });
            setIsDetailOpen(false);
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
    
    const calculateHours = (shift: Shift | null): { overtime: number, leave: number } => {
        if (!shift || !operator?.workSchedule) return { overtime: 0, leave: 0 };

        const contractualMinutes = getContractualHoursForShift(shift) * 60;
        
        const totalMinutes = shift.workDuration;
        
        if (totalMinutes > contractualMinutes) {
            // Overtime
            const overtimeMinutes = totalMinutes - contractualMinutes;
            const overtimeHours = Math.floor(overtimeMinutes / 60);
            const remainingMinutes = overtimeMinutes % 60;
            const calculatedOvertime = overtimeHours + (remainingMinutes >= 50 ? 1 : 0);
            return { overtime: calculatedOvertime, leave: 0 };

        } else if (totalMinutes < contractualMinutes) {
            // Leave
            const leaveMinutes = contractualMinutes - totalMinutes;
            return { overtime: 0, leave: parseFloat((leaveMinutes / 60).toFixed(2)) };
        }

        return { overtime: 0, leave: 0 };
    };


    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const handleOpenApproveDialog = (shift: Shift) => {
        const { overtime, leave } = calculateHours(shift);
        setApprovalData({
            shiftToApprove: shift,
            overtimeHours: String(overtime),
            leaveHours: String(leave),
        });
        setIsApproveDialogOpen(true);
    }
    
    const getContractualHoursForShift = (shift: Shift | null): number => {
        if (!shift || !operator?.workSchedule) return 0;
        const shiftDate = shift.events[0]?.timestamp.toDate();
        if (!shiftDate) return 0;
        const dayOfWeek = getDayFns(shiftDate);
        const dayName = dayIndexToName[dayOfWeek];
        return operator.workSchedule[dayName] || 0;
    };
    
    const handleAddManualShift = async () => {
        if (!operator || !newShiftDate) return;
        
        const dayName = dayIndexToName[getDayFns(newShiftDate)];
        const contractualHours = operator.workSchedule[dayName] || 0;

        if (contractualHours <= 0) {
            setIsNonWorkDayConfirmOpen(true);
            return;
        }
        await proceedWithAddManualShift();
    }

    const proceedWithAddManualShift = async () => {
        if (!firestore || !operatorId || !newShiftDate || !newShiftTimes.entrata || !newShiftTimes.uscita) {
            toast({ title: 'Dati mancanti', description: 'Data, Entrata e Uscita sono obbligatorie.', variant: 'destructive'});
            return;
        }

        setIsNonWorkDayConfirmOpen(false);

        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if(isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(newShiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };

        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operatorId}/timbrature`);

        const events: { type: Timbratura['type'], time: string }[] = [
            { type: 'entrata', time: newShiftTimes.entrata },
            { type: 'uscita', time: newShiftTimes.uscita },
            { type: 'pausa', time: newShiftTimes.pausa },
            { type: 'fine_pausa', time: newShiftTimes.fine_pausa },
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
                    userId: operatorId,
                    type: event.type,
                    timestamp: timestamp,
                    status: 'sospesa' as const,
                    viewedByOperator: false,
                });
            }
        }
        
        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno manuale aggiunto. Ora è in attesa di approvazione.' });
            setIsAddShiftOpen(false);
            setNewShiftTimes({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile aggiungere il turno manuale.', variant: 'destructive'});
        }
    };
    
    if (isLoading || !operator) return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    
    const formatTime = (date: Timestamp | undefined) => date ? format(date.toDate(), 'p', { locale: it }) : '--:--';
    const formatDate = (date: Timestamp | undefined) => date ? format(date.toDate(), 'PPP', { locale: it }) : 'N/D';
    
    const totalPages = Math.ceil(approvedShifts.length / ITEMS_PER_PAGE);
    const paginatedApprovedShifts = approvedShifts.slice(
        currentPage * ITEMS_PER_PAGE,
        (currentPage + 1) * ITEMS_PER_PAGE
    );


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Approvazione Turni di {operator.username}</CardTitle>
                        <CardDescription>Conferma o rifiuta i turni di lavoro in sospeso.</CardDescription>
                    </div>
                    <Button onClick={() => setIsAddShiftOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi Turno Manuale
                    </Button>
                </CardHeader>
                <CardContent>
                    {pendingShifts.length === 0 ? (
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
                                    {pendingShifts.map((shift, index) => {
                                        const startTime = shift.events[0]?.timestamp;
                                        const endTime = shift.events.find(e => e.type === 'uscita')?.timestamp;
                                        return (
                                            <TableRow key={index}>
                                                <TableCell className='flex items-center gap-2'>
                                                  {shift.isOnLeaveDay && <AlertCircle className="h-5 w-5 text-yellow-500" />}
                                                  {formatDate(startTime)}
                                                </TableCell>
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
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDetailDialog(shift)}>
                                                        <Eye className="h-5 w-5" />
                                                    </Button>
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

            <Card>
                <CardHeader>
                    <CardTitle>Riepilogo Turni Approvati</CardTitle>
                    <CardDescription>Visualizza e modifica i turni già confermati.</CardDescription>
                </CardHeader>
                <CardContent>
                     {approvedShifts.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Nessun turno approvato.</p>
                    ) : (
                        <div className="border rounded-lg overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Inizio</TableHead>
                                        <TableHead>Fine</TableHead>
                                        <TableHead>Durata</TableHead>
                                        <TableHead>Stato</TableHead>
                                        <TableHead className="text-right">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedApprovedShifts.map((shift, index) => {
                                        const startTime = shift.events[0]?.timestamp;
                                        const endTime = shift.events.find(e => e.type === 'uscita')?.timestamp;
                                        return (
                                            <TableRow key={index}>
                                                <TableCell>{formatDate(startTime)}</TableCell>
                                                <TableCell>{formatTime(startTime)}</TableCell>
                                                <TableCell>{formatTime(endTime)}</TableCell>
                                                <TableCell>{formatMinutes(shift.workDuration)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={shift.status === 'confermato' ? 'secondary' : 'destructive'}>
                                                        {shift.status.charAt(0).toUpperCase() + shift.status.slice(1)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDetailDialog(shift)}>
                                                        <Eye className="h-5 w-5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
                {totalPages > 1 && (
                     <CardFooter className="flex justify-end items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                            disabled={currentPage === 0}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Prec.
                        </Button>
                        <span className="text-sm text-muted-foreground">
                           Pagina {currentPage + 1} di {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={currentPage === totalPages - 1}
                        >
                            Succ.
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </CardFooter>
                )}
            </Card>

            <ResponsiveDialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Aggiungi Turno Manuale</ResponsiveDialogTitle>
                        <ResponsiveDialogDescription>Seleziona il giorno e inserisci gli orari del turno.</ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                           <Label>Giorno del turno</Label>
                           <Calendar 
                                mode="single" 
                                selected={newShiftDate} 
                                onSelect={setNewShiftDate} 
                                className="rounded-md border" 
                                disabled={(date) => date > new Date() && !isSameDay(date, new Date())}
                           />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="manual-entrata">Entrata*</Label>
                                <Input id="manual-entrata" type="time" value={newShiftTimes.entrata} onChange={e => setNewShiftTimes(p => ({...p, entrata: e.target.value}))} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="manual-uscita">Uscita*</Label>
                                <Input id="manual-uscita" type="time" value={newShiftTimes.uscita} onChange={e => setNewShiftTimes(p => ({...p, uscita: e.target.value}))} required />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="manual-pausa">Inizio Pausa (Opz.)</Label>
                                <Input id="manual-pausa" type="time" value={newShiftTimes.pausa} onChange={e => setNewShiftTimes(p => ({...p, pausa: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="manual-fine-pausa">Fine Pausa (Opz.)</Label>
                                <Input id="manual-fine-pausa" type="time" value={newShiftTimes.fine_pausa} onChange={e => setNewShiftTimes(p => ({...p, fine_pausa: e.target.value}))} />
                            </div>
                        </div>
                    </div>
                    <ResponsiveDialogFooter>
                        <Button variant="outline" onClick={() => setIsAddShiftOpen(false)}>Annulla</Button>
                        <Button onClick={handleAddManualShift}>Salva Turno</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

            <AlertDialog open={isNonWorkDayConfirmOpen} onOpenChange={setIsNonWorkDayConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Giorno Non Lavorativo</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questo non è un giorno lavorativo assegnato. Sei sicuro di voler creare questo turno?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={proceedWithAddManualShift}>Conferma</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                             {detailShift?.isOnLeaveDay && (
                                <div className='flex items-center gap-2 text-yellow-600 bg-yellow-500/10 p-2 rounded-md'>
                                    <AlertCircle className="h-5 w-5" />
                                    <span className="text-sm font-medium">Timbrato in giorno di assenza</span>
                                </div>
                             )}
                        </div>
                    </ResponsiveDialogHeader>

                     {detailShift && detailShift.status !== 'in_corso' && operator && (
                        <div className="grid grid-cols-3 gap-4 text-center my-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Ore Previste</p>
                                <p className="text-2xl font-bold">{getContractualHoursForShift(detailShift)}h</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Ore Lavorate</p>
                                <p className="text-2xl font-bold">{formatMinutes(detailShift.workDuration)}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Straordinari</p>
                                <p className="text-2xl font-bold">{calculateHours(detailShift).overtime}h</p>
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto mt-2 max-h-80 overflow-y-auto">
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
                        <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Chiudi</Button>
                        {detailShift && detailShift.status === 'in_sospeso' && (
                          <>
                            <Button variant="destructive" onClick={() => handleRejectShift(detailShift)}>
                                <XCircle className="mr-2 h-4 w-4"/> Rifiuta Turno
                            </Button>
                            <Button onClick={() => handleOpenApproveDialog(detailShift)}>
                                <CheckCircle className="mr-2 h-4 w-4"/> Approva Turno
                            </Button>
                          </>
                        )}
                        {detailShift && (
                          <>
                            <Button variant="destructive" onClick={() => { setShiftToDelete(detailShift); setIsConfirmingDelete(true); }}><Trash2 className="mr-2 h-4 w-4"/> Elimina</Button>
                            <Button variant="outline" onClick={() => handleOpenEditDialog(detailShift)}><Pencil className="mr-2 h-4 w-4" /> Modifica</Button>
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

            <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <AlertDialogContent>
                     <AlertDialogHeader>
                        <AlertDialogTitle>Riepilogo e Approvazione Turno</AlertDialogTitle>
                        <AlertDialogDescription>Verifica e modifica le ore calcolate prima di approvare il turno. Le ore verranno registrate come richieste separate.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4 space-y-4">
                        <div>
                            <Label htmlFor="overtime-hours">Ore di Straordinario Calcolate</Label>
                            <Input id="overtime-hours" type="number" value={approvalData.overtimeHours} onChange={(e) => setApprovalData(p => ({...p, overtimeHours: e.target.value}))} step="0.5" min="0" />
                            <p className="text-xs text-muted-foreground mt-1">Calcolato con la regola dei 50min. Modifica se necessario.</p>
                        </div>
                        <div>
                             <Label htmlFor="leave-hours">Ore di Permesso (Ammanco Ore)</Label>
                             <Input id="leave-hours" type="number" value={approvalData.leaveHours} onChange={(e) => setApprovalData(p => ({...p, leaveHours: e.target.value}))} step="0.5" min="0" />
                             <p className="text-xs text-muted-foreground mt-1">Calcolato in base alle ore mancanti. Modifica se necessario.</p>
                        </div>
                    </div>
                     <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmApprove}>Approva e Registra</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isDeleteTimbraturaDialogOpen} onOpenChange={setIsDeleteTimbraturaDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Eliminare questa timbratura?</AlertDialogTitle><AlertDialogDescription>L'azione è permanente e non può essere annullata.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => setDeletingTimbratura(null)}>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDeleteTimbratura}>Elimina</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
