'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Loader2, User, CheckCircle, XCircle, MapPin, Trash2, Eye, Pencil, AlertCircle, Circle, Clock, Briefcase, Plus, PlusCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Unlock, Coffee, MinusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter, ResponsiveDialogClose } from '@/components/ui/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, set, getDay as getDayFns, isSameDay, addDays, subDays, startOfDay, endOfDay, parse } from 'date-fns';
import { it } from 'date-fns/locale';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';


type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
    startTime?: string; // "HH:mm"
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
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    latitude?: number;
    longitude?: number;
    isOvertime?: boolean;
    isAuto?: boolean;
    shiftId?: string;
};

type Shift = {
    id: string; // Composite ID based on events
    events: Timbratura[];
    status: 'in_sospeso' | 'in_corso' | 'confermato' | 'rifiutato';
    workDuration: number; // total work minutes
    breakDuration: number; // total break minutes
    isOnLeaveDay?: boolean; // Flag for shifts on leave days
    isOvertime: boolean;
};

type StraordinarioEvent = {
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
};

type StraordinarioShift = {
    id: string;
    events: StraordinarioEvent[];
    status: 'in_corso' | 'in_attesa_di_approvazione' | 'approvato' | 'rifiutato';
    date: Timestamp;
};

type UnlockRequest = {
    id: string;
    startDate: Timestamp;
    type: 'sblocco_timbratura';
}

type ManualBreak = { start: string; end: string; };

type ApprovalContext = {
    shift: Shift;
    ordinaryHours: string;
    overtimeHours: string;
    leaveHours: string;
    createLeaveRequest: boolean;
    manualBreak?: ManualBreak;
} | null;

const ITEMS_PER_PAGE = 5;

export default function ShiftApprovalPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const params = useParams();
    const operatorId = params.operatorId as string;
    const [operator, setOperator] = useState<Operator | null>(null);

    const [allShifts, setAllShifts] = useState<Shift[]>([]);
    const [overtimeShifts, setOvertimeShifts] = useState<StraordinarioShift[]>([]);
    const [bookedShiftDays, setBookedShiftDays] = useState<Date[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    
    const [detailShift, setDetailShift] = useState<Shift | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [isEditShiftOpen, setIsEditShiftOpen] = useState(false);

    const [detailOvertimeShift, setDetailOvertimeShift] = useState<StraordinarioShift | null>(null);
    const [isDetailOvertimeOpen, setIsDetailOvertimeOpen] = useState(false);
    const [overtimeShiftToDelete, setOvertimeShiftToDelete] = useState<StraordinarioShift | null>(null);
    const [editingOvertimeShift, setEditingOvertimeShift] = useState<StraordinarioShift | null>(null);
    const [isEditOvertimeOpen, setIsEditOvertimeOpen] = useState(false);

    const [isConfirmingOvertimeDelete, setIsConfirmingOvertimeDelete] = useState(false);
    const [editShiftTimes, setEditShiftTimes] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    
    const [deletingTimbratura, setDeletingTimbratura] = useState<Timbratura | null>(null);
    const [isDeleteTimbraturaDialogOpen, setIsDeleteTimbraturaDialogOpen] = useState(false);
    
    // State for break dialogs
    const [shiftForBreak, setShiftForBreak] = useState<Shift | null>(null);
    const [isMissingBreakConfirmOpen, setIsMissingBreakConfirmOpen] = useState(false);
    const [isAddBreakDialogOpen, setIsAddBreakDialogOpen] = useState(false);
    const [breakTimes, setBreakTimes] = useState<{ start: string, end: string }>({ start: '', end: '' });

    const [approvalContext, setApprovalContext] = useState<ApprovalContext>(null);
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);


    const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
    const [newShiftDate, setNewShiftDate] = useState<Date | undefined>(new Date());
    const [newShiftTimes, setNewShiftTimes] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    
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
        if (!firestore || !operatorId || !operator) return;
        
        const allClockingsQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`));
        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`));
        const overtimeQuery = query(collection(firestore, `app-users/${operatorId}/straordinari`), orderBy('date', 'desc'));

        const unsubClockings = onSnapshot(allClockingsQuery, async (clockingSnapshot) => {
            const allClockings: Timbratura[] = [];
            clockingSnapshot.forEach(doc => {
                allClockings.push({ id: doc.id, ...doc.data() } as Timbratura);
            });
            allClockings.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            const requestSnapshot = await getDocs(requestsQuery);
            const leaveDays = new Set<string>();
            
            requestSnapshot.forEach(doc => {
                const req = doc.data();
                if (req.type === 'ferie' || req.type === 'malattia' && req.status === 'approvato') {
                    for(let d = req.startDate.toDate(); d <= req.endDate.toDate(); d.setDate(d.getDate() + 1)) {
                        leaveDays.add(format(d, 'yyyy-MM-dd'));
                    }
                }
            });
            
            const shiftsByDay: { [key: string]: Timbratura[] } = {};
            const shiftsByManualId: { [key: string]: Timbratura[] } = {};

            for (const event of allClockings) {
                if (event.shiftId) { // Group by manual shiftId first
                    if (!shiftsByManualId[event.shiftId]) shiftsByManualId[event.shiftId] = [];
                    shiftsByManualId[event.shiftId].push(event);
                } else { // Then group by day for automatic shifts
                    const dayString = format(event.timestamp.toDate(), 'yyyy-MM-dd');
                    if (!shiftsByDay[dayString]) shiftsByDay[dayString] = [];
                    shiftsByDay[dayString].push(event);
                }
            }

            const groupedShifts: Shift[] = [];
            
            // Process manual shifts
            for (const shiftId in shiftsByManualId) {
                const events = shiftsByManualId[shiftId];
                const processed = processShift(events, leaveDays);
                groupedShifts.push({ id: shiftId, ...processed });
            }

            // Process automatic shifts day by day
            for (const day in shiftsByDay) {
                const dayEvents = shiftsByDay[day];
                let currentShiftEvents: Timbratura[] = [];
                for (const event of dayEvents) {
                    currentShiftEvents.push(event);
                    if (event.type === 'uscita') {
                        const shiftId = currentShiftEvents.map(e => e.id).sort().join('-');
                        const processed = processShift(currentShiftEvents, leaveDays);
                        groupedShifts.push({ id: shiftId, ...processed });
                        currentShiftEvents = [];
                    }
                }
                // Handle incomplete shifts for the day
                if (currentShiftEvents.length > 0) {
                    const shiftId = currentShiftEvents.map(e => e.id).sort().join('-');
                    const processed = processShift(currentShiftEvents, leaveDays);
                    groupedShifts.push({ id: shiftId, ...processed });
                }
            }
            
            groupedShifts.sort((a,b) => {
                const dateA = a.events[0]?.timestamp.toMillis() || 0;
                const dateB = b.events[0]?.timestamp.toMillis() || 0;
                return dateB - dateA;
            })

            setAllShifts(groupedShifts);
            setBookedShiftDays(groupedShifts.map(s => startOfDay(s.events[0].timestamp.toDate())));
            setIsLoading(false);

        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le timbrature.', variant: 'destructive' });
            setIsLoading(false);
        });
        
        const unsubOvertime = onSnapshot(overtimeQuery, (snapshot) => {
            const shifts = snapshot.docs.map(d => ({id: d.id, ...d.data() } as StraordinarioShift));
            setOvertimeShifts(shifts);
        }, error => {
             console.error("Error fetching overtime shifts: ", error);
        });

        return () => {
            unsubClockings();
            unsubOvertime();
        }
    }, [firestore, operatorId, toast, operator]);

    const { pendingShifts } = useMemo(() => {
        const pending = allShifts.filter(s => s.status === 'in_sospeso' || s.status === 'in_corso');
        return { pendingShifts: pending };
    }, [allShifts]);

    const { pendingOvertimeShifts } = useMemo(() => {
        const pending = overtimeShifts.filter(s => s.status === 'in_attesa_di_approvazione');
        return { pendingOvertimeShifts: pending };
    }, [overtimeShifts]);

    const historicalShifts = useMemo(() => {
        const approvedShifts = allShifts
            .filter(s => s.status === 'confermato' || s.status === 'rifiutato')
            .sort((a, b) => {
                const dateA = a.events[0]?.timestamp.toMillis() || 0;
                const dateB = b.events[0]?.timestamp.toMillis() || 0;
                return dateB - dateA;
            });
    
        return approvedShifts;
    }, [allShifts]);

    const processShift = (events: Timbratura[], leaveDays: Set<string>): Omit<Shift, 'id'> => {
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

        const { workDuration, breakDuration } = calculateShiftDurations(events);
        
        const startTime = events.find(e => e.type === 'entrata')?.timestamp;
        const shiftDateStr = startTime ? format(startTime.toDate(), 'yyyy-MM-dd') : '';
        const isOnLeaveDay = leaveDays.has(shiftDateStr);
        const isOvertime = events.find(e => e.type === 'entrata')?.isOvertime ?? false;

        return { events, status, workDuration, breakDuration, isOnLeaveDay, isOvertime };
    };

    const handleConfirmApprove = async () => {
        if (!firestore || !approvalContext || !operator) return;
    
        const { shift, ordinaryHours, overtimeHours, leaveHours, createLeaveRequest, manualBreak } = approvalContext;
        const approvedOvertime = parseFloat(overtimeHours) || 0;
        const approvedLeave = createLeaveRequest ? (parseFloat(leaveHours) || 0) : 0;
    
        const batch = writeBatch(firestore);
        const timbratureRef = collection(firestore, `app-users/${operator.id}/timbrature`);
        
        shift.events.forEach(event => {
            if (event.status === 'sospesa') {
                const docRef = doc(timbratureRef, event.id);
                batch.update(docRef, { status: 'confermata', viewedByOperator: false });
            }
        });
        
        if (manualBreak && manualBreak.start && manualBreak.end) {
            const shiftId = shift.events[0]?.shiftId || shift.id;
            const shiftDate = shift.events[0].timestamp.toDate();

            const createTimestamp = (time: string): Timestamp => {
                const [hours, minutes] = time.split(':').map(Number);
                return Timestamp.fromDate(set(shiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
            };

            const breakStartRef = doc(timbratureRef);
            batch.set(breakStartRef, {
                userId: operator.id, type: 'pausa', timestamp: createTimestamp(manualBreak.start),
                status: 'confermata', viewedByOperator: false, shiftId, isAuto: true
            });
            const breakEndRef = doc(timbratureRef);
            batch.set(breakEndRef, {
                userId: operator.id, type: 'fine_pausa', timestamp: createTimestamp(manualBreak.end),
                status: 'confermata', viewedByOperator: false, shiftId, isAuto: true
            });
        }
    
        const shiftDate = shift.events[0].timestamp.toDate();
    
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
                associatedShiftId: shift.id, // Link to the shift
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
            setApprovalContext(null);
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
            if (!event.isAuto) {
                const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
                batch.delete(docRef);
            }
        });

        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno eliminato.' });
        } catch (err) {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile eliminare il turno.', variant: 'destructive' });
        } finally {
            setIsDetailOpen(false);
            setShiftToDelete(null);
            setIsConfirmingDelete(false);
        }
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
        
        if ((editShiftTimes.pausa && !editShiftTimes.fine_pausa) || (!editShiftTimes.pausa && editShiftTimes.fine_pausa)) {
             toast({ title: 'Pausa incompleta', description: 'Devi inserire sia l\'inizio che la fine della pausa.', variant: 'destructive' });
             return;
        }

        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operator.id}/timbrature`);
        const shiftDate = editingShift.events[0].timestamp.toDate();
        const shiftId = editingShift.id; 

        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(shiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };
        
        const newEventData: Partial<Record<Timbratura['type'], Timestamp>> = {};
        for (const type of ['entrata', 'uscita', 'pausa', 'fine_pausa'] as const) {
            const time = editShiftTimes[type];
            if (time) {
                const timestamp = createTimestamp(time);
                if (!timestamp) {
                    toast({ title: 'Orario non valido', description: `L'orario per '${type}' non è valido.`, variant: 'destructive' });
                    return;
                }
                newEventData[type] = timestamp;
            }
        }

        const existingEvents = new Map(editingShift.events.map(e => [e.type, e]));

        for (const type of ['entrata', 'uscita', 'pausa', 'fine_pausa'] as const) {
            const existingEvent = existingEvents.get(type);
            const newTimestamp = newEventData[type];

            if (newTimestamp && existingEvent) {
                const docRef = doc(timbratureCollectionRef, existingEvent.id);
                batch.update(docRef, { timestamp: newTimestamp, viewedByOperator: false });
            } else if (newTimestamp && !existingEvent) {
                const newDocRef = doc(timbratureCollectionRef);
                batch.set(newDocRef, {
                    userId: operator.id,
                    type: type,
                    timestamp: newTimestamp,
                    status: 'sospesa',
                    viewedByOperator: false,
                    isOvertime: editingShift.isOvertime,
                    shiftId: shiftId 
                });
            } else if (!newTimestamp && existingEvent) {
                const docRef = doc(timbratureCollectionRef, existingEvent.id);
                batch.delete(docRef);
            }
        }
        
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno aggiornato con successo.' });
            setIsEditShiftOpen(false);
            setEditingShift(null);
            setIsDetailOpen(false);
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile aggiornare il turno.', variant: 'destructive' });
        });
    };
    
    const handleConfirmDeleteTimbratura = async () => {
        if (!firestore || !deletingTimbratura || !operator) return;
        if (deletingTimbratura.isAuto) {
            toast({ title: 'Azione non permessa', description: 'Non puoi eliminare una timbratura automatica.', variant: 'destructive'});
            return;
        }
        const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, deletingTimbratura.id);
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Timbratura eliminata.' });
            setIsDeleteTimbraturaDialogOpen(false);
            setDeletingTimbratura(null);
            setIsDetailOpen(false); 
        }).catch(err => {
            toast({ title: 'Errore', description: 'Impossibile eliminare la timbratura.', variant: 'destructive' });
        });
    };

    const handleOpenDetailDialog = (shift: Shift) => {
        setDetailShift(shift);
        setIsDetailOpen(true);
    }
    
    const calculateShiftDurations = (events: Timbratura[]): { workDuration: number, breakDuration: number, calculationStart: Date | null } => {
        if (!events || events.length === 0 || !operator) {
            return { workDuration: 0, breakDuration: 0, calculationStart: null };
        }

        const clockInEvent = events.find(e => e.type === 'entrata');
        const clockOutEvent = events.find(e => e.type === 'uscita');

        if (!clockInEvent) {
             return { workDuration: 0, breakDuration: 0, calculationStart: null };
        }

        const clockInTime = clockInEvent.timestamp.toDate();
        const shiftDate = clockInEvent.timestamp.toDate();
        const dayName = dayIndexToName[getDayFns(shiftDate)];
        const schedule = operator.workSchedule[dayName];
        
        let calculationStart = clockInTime;
        
        if (schedule?.startTime) {
            const [contractualHours, contractualMinutes] = schedule.startTime.split(':').map(Number);
            const contractualStart = set(shiftDate, { hours: contractualHours, minutes: contractualMinutes, seconds: 0, milliseconds: 0 });
            
            if (calculationStart < contractualStart) {
                calculationStart = contractualStart;
            } else {
                const minutesDifference = (calculationStart.getTime() - contractualStart.getTime()) / 60000;
                if (minutesDifference <= 15) { 
                    calculationStart = contractualStart;
                } else {
                    const nextHalfHour = set(calculationStart, { seconds: 0, milliseconds: 0 });
                    if (nextHalfHour.getMinutes() > 0 && nextHalfHour.getMinutes() <= 30) {
                        nextHalfHour.setMinutes(30);
                    } else if (nextHalfHour.getMinutes() > 30) {
                        nextHalfHour.setHours(nextHalfHour.getHours() + 1, 0);
                    }
                    calculationStart = nextHalfHour;
                }
            }
        }
        
        let totalMillis = clockOutEvent ? clockOutEvent.timestamp.toMillis() - calculationStart.getTime() : 0;
        
        let breakDurationMillis = 0;
        let breakStartTs: Timestamp | null = null;
        for (const e of events) {
            if (e.type === 'pausa') breakStartTs = e.timestamp;
            if (e.type === 'fine_pausa' && breakStartTs) {
                breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
                breakStartTs = null;
            }
        }
        
        let workDuration = totalMillis > 0 ? (totalMillis / (1000 * 60)) : 0;
        const breakDuration = breakDurationMillis > 0 ? breakDurationMillis / (1000 * 60) : 0;

        // If any break is registered, subtract 1 hour
        if (breakDuration > 0) {
             workDuration = workDuration - 60;
        }

        return { workDuration: Math.max(0, workDuration), breakDuration, calculationStart };
    };

    const getContractualHoursForShift = (shift: Shift | null): number => {
        if (!shift || !operator?.workSchedule) return 0;
        const shiftDate = shift.events[0]?.timestamp.toDate();
        if (!shiftDate) return 0;
        const dayOfWeek = getDayFns(shiftDate);
        const dayName = dayIndexToName[dayOfWeek];
        return operator.workSchedule[dayName]?.totalHours || 0;
    };
    
    const roundOrdinaryHours = (minutes: number): number => {
        if (minutes <= 0) return 0;
        const totalHalfHours = Math.floor(minutes / 30);
        const remainingMinutes = minutes % 30;
        return (totalHalfHours / 2) + (remainingMinutes >= 25 ? 0.5 : 0);
    };

    const roundOvertimeHours = (minutes: number): number => {
        if (minutes <= 0) return 0;
        const totalHours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return totalHours + (remainingMinutes >= 50 ? 1 : 0);
    };

    const calculateHours = (shift: Shift, manualBreak?: ManualBreak): { ordinary: number, overtime: number, leave: number, worked: number, break: number } => {
        if (!operator?.workSchedule) return { ordinary: 0, overtime: 0, leave: 0, worked: 0, break: 0 };
    
        let { workDuration: totalMinutesWorked, breakDuration: breakMinutes, calculationStart } = calculateShiftDurations(shift.events);
    
        if (!calculationStart) return { ordinary: 0, overtime: 0, leave: 0, worked: 0, break: 0 };
    
        const clockOutEvent = shift.events.find(e => e.type === 'uscita');
        if (!clockOutEvent) return { ordinary: 0, overtime: 0, leave: 0, worked: 0, break: 0 };
    
        let totalMillis = clockOutEvent.timestamp.toMillis() - calculationStart.getTime();
        let breakDurationMillis = 0;
    
        if (manualBreak && manualBreak.start && manualBreak.end) {
            const start = parse(manualBreak.start, 'HH:mm', new Date());
            const end = parse(manualBreak.end, 'HH:mm', new Date());
            breakDurationMillis = (end.getTime() - start.getTime());
        } else {
            let breakStartTs: Timestamp | null = null;
            for (const e of shift.events) {
                if (e.type === 'pausa') breakStartTs = e.timestamp;
                if (e.type === 'fine_pausa' && breakStartTs) {
                    breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
                    breakStartTs = null;
                }
            }
        }
    
        if (breakDurationMillis > 0) {
            totalMillis -= 60 * 60 * 1000; // Subtract 1 hour in milliseconds
        }
    
        totalMinutesWorked = totalMillis > 0 ? totalMillis / (1000 * 60) : 0;
        
        if (shift.isOvertime) {
            return {
                ordinary: 0,
                overtime: roundOvertimeHours(totalMinutesWorked),
                leave: 0,
                worked: totalMinutesWorked,
                break: breakDurationMillis / (1000 * 60)
            };
        }
    
        const contractualHours = getContractualHoursForShift(shift);
        const contractualMinutes = contractualHours * 60;
            
        const ordinaryMinutes = Math.min(totalMinutesWorked, contractualMinutes);
        const ordinaryHours = roundOrdinaryHours(ordinaryMinutes);
    
        const overtimeMinutes = totalMinutesWorked > contractualMinutes ? totalMinutesWorked - contractualMinutes : 0;
        const overtimeHours = roundOvertimeHours(overtimeMinutes);
    
        const leaveMinutes = contractualMinutes > totalMinutesWorked ? contractualMinutes - totalMinutesWorked : 0;
        const leaveHours = roundOrdinaryHours(leaveMinutes);
    
        return { 
            ordinary: ordinaryHours, 
            overtime: overtimeHours, 
            leave: leaveHours,
            worked: totalMinutesWorked,
            break: breakDurationMillis / (1000 * 60)
        };
    };
    
    const handleApprovalProcess = (shift: Shift) => {
        if (!operator || !shift.events[0]) return;

        const hasBreak = shift.events.some(e => e.type === 'pausa');
        const dayName = dayIndexToName[getDayFns(shift.events[0].timestamp.toDate())];
        const mandatoryBreakMinutes = operator.workSchedule[dayName]?.breakMinutes || 0;

        if (isSameDay(shift.events[0].timestamp.toDate(), new Date()) && !shift.events.some(e=> e.type === 'uscita')){
             toast({ title: 'Turno in corso', description: 'Non puoi approvare un turno non ancora terminato.', variant: 'destructive'});
             return;
        }

        if (!hasBreak && mandatoryBreakMinutes > 0) {
            setShiftForBreak(shift);
            setIsMissingBreakConfirmOpen(true);
        } else {
            handleOpenApproveDialog(shift);
        }
    };
    
    const handleApproveWithoutBreak = () => {
        if (shiftForBreak) {
            handleOpenApproveDialog(shiftForBreak);
        }
        setIsMissingBreakConfirmOpen(false);
        setShiftForBreak(null);
    };

    const handleOpenAddBreakDialog = () => {
        if (!shiftForBreak || !operator) return;

        const shiftDate = shiftForBreak.events[0].timestamp.toDate();
        const dayName = dayIndexToName[getDayFns(shiftDate)];
        const mandatoryBreakMinutes = operator.workSchedule[dayName]?.breakMinutes || 0;

        const existingBreakStart = shiftForBreak.events.find(e => e.type === 'pausa');
        
        let prefilledStart = '12:30';
        let prefilledEnd = '13:30'; // Default if 60 mins

        if (existingBreakStart) {
            prefilledStart = format(existingBreakStart.timestamp.toDate(), 'HH:mm');
            const endTime = new Date(existingBreakStart.timestamp.toDate().getTime() + mandatoryBreakMinutes * 60000);
            prefilledEnd = format(endTime, 'HH:mm');
        } else if (mandatoryBreakMinutes) {
            const startTime = set(shiftDate, { hours: 12, minutes: 30 });
            const endTime = new Date(startTime.getTime() + mandatoryBreakMinutes * 60000);
            prefilledEnd = format(endTime, 'HH:mm');
        }

        setBreakTimes({ start: prefilledStart, end: prefilledEnd });
        setIsAddBreakDialogOpen(true);
        setIsMissingBreakConfirmOpen(false);
    };

    const handleAddBreakAndOpenApproval = () => {
        if (!shiftForBreak) return;
        handleOpenApproveDialog(shiftForBreak, breakTimes);
        setIsAddBreakDialogOpen(false);
        setShiftForBreak(null);
    };


    const handleOpenApproveDialog = (shift: Shift, manualBreak?: ManualBreak) => {
        const { ordinary, overtime, leave } = calculateHours(shift, manualBreak);
        setApprovalContext({
            shift: shift,
            ordinaryHours: String(ordinary),
            overtimeHours: String(overtime),
            leaveHours: String(leave),
            manualBreak: manualBreak,
            createLeaveRequest: false
        });
        setIsApproveDialogOpen(true);
    }
    
    const handleApproveUnlock = async (unlockRequest: UnlockRequest) => {
        if (!firestore || !operatorId) return;

        const dayToUnlock = unlockRequest.startDate.toDate();

        try {
            await runTransaction(firestore, async (transaction) => {
                const requestsQuery = query(
                    collection(firestore, `app-users/${operatorId}/requests`),
                    where('status', '==', 'approvato'),
                    where('type', 'in', ['ferie', 'malattia'])
                );
                const requestsSnapshot = await getDocs(requestsQuery);

                let leaveRequestToModify: {id: string, data: any} | null = null;
                requestsSnapshot.forEach(doc => {
                    const req = doc.data();
                    const startDate = req.startDate.toDate();
                    const endDate = req.endDate.toDate();
                    if (isSameDay(dayToUnlock, startDate) || isSameDay(dayToUnlock, endDate) || (dayToUnlock > startDate && dayToUnlock < endDate)) {
                        leaveRequestToModify = { id: doc.id, data: req };
                    }
                });

                if (leaveRequestToModify) {
                    const leaveReqRef = doc(firestore, `app-users/${operatorId}/requests`, leaveRequestToModify.id);
                    const { startDate, endDate } = leaveRequestToModify.data;

                    if (isSameDay(startDate.toDate(), endDate.toDate())) {
                        transaction.delete(leaveReqRef);
                    } else if (isSameDay(dayToUnlock, startDate.toDate())) {
                        transaction.update(leaveReqRef, { startDate: Timestamp.fromDate(addDays(startDate.toDate(), 1)) });
                    } else if (isSameDay(dayToUnlock, endDate.toDate())) {
                        transaction.update(leaveReqRef, { endDate: Timestamp.fromDate(subDays(endDate.toDate(), 1)) });
                    } else {
                        transaction.update(leaveReqRef, { endDate: Timestamp.fromDate(subDays(dayToUnlock, 1)) });
                        const newRequestRef = doc(collection(firestore, `app-users/${operatorId}/requests`));
                        const { id, ...restOfRequest } = leaveRequestToModify.data;
                        transaction.set(newRequestRef, {
                            ...restOfRequest,
                            startDate: Timestamp.fromDate(addDays(dayToUnlock, 1)),
                            endDate: endDate,
                            createdAt: serverTimestamp(),
                            viewedByOperator: false,
                        });
                    }
                }
                
                const unlockRequestRef = doc(firestore, `app-users/${operatorId}/requests`, unlockRequest.id);
                transaction.update(unlockRequestRef, { status: 'approvato', viewedByOperator: false });
            });
            toast({ title: 'Successo', description: "Sblocco approvato. L'operatore ora può timbrare." });
        } catch (error) {
            console.error("Error approving unlock request:", error);
            toast({ title: 'Errore', description: 'Impossibile approvare lo sblocco.', variant: 'destructive' });
        }
    };


    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const handleAddManualShift = async () => {
        if (!firestore || !operatorId || !newShiftDate || !newShiftTimes.entrata || !newShiftTimes.uscita || !operator) {
            toast({ title: 'Dati mancanti', description: 'Data, Entrata e Uscita sono obbligatorie.', variant: 'destructive'});
            return;
        }
    
        const createTimestamp = (time: string): Timestamp => {
            const [hours, minutes] = time.split(':').map(Number);
            return Timestamp.fromDate(set(newShiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };
        
        const dayName = dayIndexToName[getDayFns(newShiftDate)];
        const isWorkDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
        const isOvertime = !isWorkDay;
        
        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operatorId}/timbrature`);
        
        const manualShiftId = doc(timbratureCollectionRef).id;
    
        const events: { type: Timbratura['type'], time: string }[] = [
            { type: 'entrata', time: newShiftTimes.entrata },
            { type: 'uscita', time: newShiftTimes.uscita },
            { type: 'pausa', time: newShiftTimes.pausa },
            { type: 'fine_pausa', time: newShiftTimes.fine_pausa },
        ];
    
        for (const event of events) {
            if (event.time) {
                const newDocRef = doc(timbratureCollectionRef);
                batch.set(newDocRef, {
                    userId: operatorId, 
                    type: event.type, 
                    timestamp: createTimestamp(event.time),
                    status: 'sospesa' as const, 
                    viewedByOperator: false, 
                    isOvertime,
                    shiftId: manualShiftId
                });
            }
        }
        try {
            await batch.commit();
            toast({ title: 'Successo', description: 'Turno manuale aggiunto. Ora è in attesa di approvazione.' });
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile aggiungere il turno manuale.', variant: 'destructive'});
        }
        
        setIsAddShiftOpen(false);
        setNewShiftTimes({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    };
    
    if (isLoading || !operator) return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    
    const formatTime = (date: Timestamp | undefined | null) => date ? format(date.toDate(), 'p', { locale: it }) : '--:--';
    const formatDate = (date: Timestamp | undefined) => date ? format(date.toDate(), 'PPP', { locale: it }) : 'N/D';
    
    const totalPages = Math.ceil(historicalShifts.length / ITEMS_PER_PAGE);
    const paginatedApprovedShifts = historicalShifts.slice(
        currentPage * ITEMS_PER_PAGE,
        (currentPage + 1) * ITEMS_PER_PAGE
    );
    
    const handleOvertimeShiftAction = async (shift: StraordinarioShift, action: 'approve' | 'reject') => {
        if (!firestore || !operatorId || !operator) return;
    
        const shiftRef = doc(firestore, `app-users/${operatorId}/straordinari`, shift.id);
    
        if (action === 'reject') {
            await updateDoc(shiftRef, { status: 'rifiutato' });
            toast({ title: 'Successo', description: `Turno straordinario rifiutato.` });
            setIsDetailOvertimeOpen(false);
            return;
        }
    
        const workMinutes = calculateOvertimeShiftMinutes(shift);
        const overtimeHours = roundOvertimeHours(workMinutes);
    
        const batch = writeBatch(firestore);
    
        const timbratureCollectionRef = collection(firestore, `app-users/${operatorId}/timbrature`);
        shift.events.forEach(event => {
            const newTimbraturaRef = doc(timbratureCollectionRef);
            batch.set(newTimbraturaRef, {
                userId: operatorId,
                type: event.type,
                timestamp: event.timestamp,
                status: 'confermata',
                viewedByOperator: false,
                latitude: null,
                longitude: null,
                isOvertime: true
            });
        });
    
        if (overtimeHours > 0) {
             const overtimeRequest = {
                userId: operator.id,
                type: 'straordinario' as const,
                status: 'approvato' as const,
                startDate: shift.date,
                endDate: shift.date,
                hours: overtimeHours,
                reason: 'Straordinario da giorno non lavorativo approvato',
                createdAt: serverTimestamp(),
                viewedByOperator: false,
            };
            const newRequestRef = doc(collection(firestore, `app-users/${operatorId}/requests`));
            batch.set(newRequestRef, overtimeRequest);
        }
    
        batch.delete(shiftRef);
    
        try {
            await batch.commit();
            toast({ title: 'Successo', description: `Turno straordinario approvato e registrato.` });
        } catch (error) {
             toast({ title: 'Errore', description: 'Impossibile approvare il turno.', variant: 'destructive' });
        } finally {
            setIsDetailOvertimeOpen(false);
        }
    };
    
    const calculateOvertimeShiftMinutes = (shift: StraordinarioShift) => {
        let workDuration = 0;
        const startTime = shift.events.find(e => e.type === 'entrata')?.timestamp;
        const endTime = shift.events.find(e => e.type === 'uscita')?.timestamp;

        if (startTime && endTime) {
            let totalMillis = endTime.toMillis() - startTime.toMillis();
            let breakStart: Timestamp | null = null;
            shift.events.forEach(e => {
                if (e.type === 'pausa') breakStart = e.timestamp;
                if (e.type === 'fine_pausa' && breakStart) {
                    totalMillis -= (e.timestamp.toMillis() - breakStart.toMillis());
                    breakStart = null;
                }
            });
            workDuration = totalMillis / (1000 * 60);
        }
        return workDuration;
    };
    
    const calculateOvertimeShiftHours = (shift: StraordinarioShift) => {
        const workMinutes = calculateOvertimeShiftMinutes(shift);
        return roundOvertimeHours(workMinutes);
    }
    
    const handleDeleteOvertimeShift = async () => {
        if (!firestore || !overtimeShiftToDelete || !operator) return;
        const docRef = doc(firestore, `app-users/${operator.id}/straordinari`, overtimeShiftToDelete.id);
        
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Turno straordinario eliminato.' });
        }).catch(err => {
            toast({ title: 'Errore', description: 'Impossibile eliminare il turno.', variant: 'destructive' });
        });
        
        setIsConfirmingOvertimeDelete(false);
        setOvertimeShiftToDelete(null);
        setIsDetailOvertimeOpen(false);
    };

    const handleOpenEditOvertimeDialog = (shift: StraordinarioShift) => {
        setEditingOvertimeShift(shift);
        const times = { entrata: '', uscita: '', pausa: '', fine_pausa: '' };
        shift.events.forEach(e => {
            times[e.type] = format(e.timestamp.toDate(), 'HH:mm');
        });
        setEditShiftTimes(times);
        setIsEditOvertimeOpen(true);
    };

    const handleEditOvertimeShift = async () => {
        if (!firestore || !editingOvertimeShift || !editShiftTimes.entrata || !editShiftTimes.uscita || !operator) {
            toast({ title: 'Dati mancanti', description: 'Entrata e Uscita sono obbligatorie.', variant: 'destructive' });
            return;
        }

        const shiftDate = editingOvertimeShift.date.toDate();
        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(shiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };

        const newEvents: StraordinarioEvent[] = [];
        for (const type of ['entrata', 'pausa', 'fine_pausa', 'uscita'] as const) {
            const time = editShiftTimes[type];
            if (time) {
                const timestamp = createTimestamp(time);
                if (!timestamp) {
                    toast({ title: 'Orario non valido', description: `L'orario per '${type}' non è valido.`, variant: 'destructive' });
                    return;
                }
                newEvents.push({ type, timestamp });
            }
        }
        
        newEvents.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
        
        const docRef = doc(firestore, `app-users/${operator.id}/straordinari`, editingOvertimeShift.id);
        await updateDoc(docRef, { events: newEvents }).then(() => {
            toast({ title: 'Successo', description: 'Turno straordinario aggiornato.' });
            setIsEditOvertimeOpen(false);
            setEditingOvertimeShift(null);
            setIsDetailOvertimeOpen(false);
        }).catch(err => {
            toast({ title: 'Errore', description: 'Impossibile aggiornare il turno.', variant: 'destructive' });
        });
    }

    const getAdjustedStartTime = (shift: Shift): Date | null => {
        if (!operator) return null;
        const { calculationStart } = calculateShiftDurations(shift.events);
        return calculationStart;
    }

    return (
        <div className="space-y-6">

            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                         <h1 className="text-3xl font-bold tracking-tight">{operator.firstName} {operator.lastName}</h1>
                        <p className="text-muted-foreground">Gestione Turni (Codice: {operator.username})</p>
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
                    <CardTitle>Turni Straordinari da Approvare</CardTitle>
                    <CardDescription>Approva o rifiuta i turni svolti in giorni non lavorativi.</CardDescription>
                </CardHeader>
                <CardContent>
                     {pendingOvertimeShifts.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Nessun turno straordinario in attesa di approvazione.</p>
                     ) : (
                        <div className="border rounded-lg overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Inizio</TableHead>
                                        <TableHead>Fine</TableHead>
                                        <TableHead className="text-right">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingOvertimeShifts.map((shift) => (
                                        <TableRow key={shift.id}>
                                            <TableCell>{formatDate(shift.date)}</TableCell>
                                            <TableCell>{formatTime(shift.events.find(e => e.type === 'entrata')?.timestamp)}</TableCell>
                                            <TableCell>{formatTime(shift.events.find(e => e.type === 'uscita')?.timestamp)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => { setDetailOvertimeShift(shift); setIsDetailOvertimeOpen(true);}}>
                                                    <Eye className="h-5 w-5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
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
                     {historicalShifts.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Nessun turno approvato.</p>
                    ) : (
                        <div className="border rounded-lg overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Inizio</TableHead>
                                        <TableHead>Fine</TableHead>
                                        <TableHead>Intervallo Pausa</TableHead>
                                        <TableHead>Durata</TableHead>
                                        <TableHead>Stato</TableHead>
                                        <TableHead className="text-right">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedApprovedShifts.map((shift, index) => {
                                        const startTime = shift.events[0]?.timestamp;
                                        const endTime = shift.events.find(e => e.type === 'uscita')?.timestamp;
                                        const adjustedStartTime = getAdjustedStartTime(shift);
                                        const breakStartTime = shift.events.find(e => e.type === 'pausa')?.timestamp;
                                        const breakEndTime = shift.events.find(e => e.type === 'fine_pausa')?.timestamp;
                                        return (
                                            <TableRow key={index}>
                                                <TableCell>{formatDate(startTime)}</TableCell>
                                                <TableCell>{adjustedStartTime ? format(adjustedStartTime, 'p', { locale: it }) : formatTime(startTime)}</TableCell>
                                                <TableCell>{formatTime(endTime)}</TableCell>
                                                <TableCell>
                                                    {breakStartTime && breakEndTime 
                                                        ? `${formatTime(breakStartTime)} - ${formatTime(breakEndTime)}` 
                                                        : '--:--'}
                                                </TableCell>
                                                <TableCell>{formatMinutes(shift.workDuration)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={shift.status === 'confermato' ? 'secondary' : 'destructive'}>
                                                        {shift.status.charAt(0).toUpperCase() + shift.status.slice(1).replace('_', ' ')}
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
                        <ResponsiveDialogDescription>Seleziona il giorno e inserisci gli orari del turno. Il sistema capirà se è ordinario o straordinario.</ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                           <Label>Giorno del turno</Label>
                           <Calendar 
                                mode="single" 
                                selected={newShiftDate} 
                                onSelect={(date) => {
                                  if (date) {
                                      setNewShiftDate(date);
                                  }
                                }}
                                className="rounded-md border" 
                                disabled={[(date) => date > new Date() && !isSameDay(date, new Date()), ...bookedShiftDays]}
                                locale={it}
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
            
            <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà le timbrature per questo turno in modo permanente. L'azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteShift}>
                            Elimina
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isConfirmingOvertimeDelete} onOpenChange={setIsConfirmingOvertimeDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Sei sicuro?</AlertDialogTitle><AlertDialogDescription>Questa azione eliminerà questo turno straordinario in modo permanente. L'azione non può essere annullata.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => setOvertimeShiftToDelete(null)}>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleDeleteOvertimeShift}>Elimina Turno</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
             <ResponsiveDialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <ResponsiveDialogContent className="sm:max-w-3xl">
                    <ResponsiveDialogHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                 <ResponsiveDialogTitle>Dettaglio Turno per {operator.firstName}</ResponsiveDialogTitle>
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

                     {detailShift && detailShift.status !== 'in_corso' && operator && (() => {
                        const { ordinary, overtime, leave, worked, break: breakDuration } = calculateHours(detailShift);
                        const label = overtime > 0 ? "Straordinari" : "Permessi";
                        const value = overtime > 0 ? `${overtime}h` : `${leave}h`;

                        return (
                             <div className="grid grid-cols-4 gap-2 text-center my-4">
                                <div className="space-y-1 rounded-md border p-2">
                                    <p className="text-xs font-medium text-muted-foreground">Ore Previste</p>
                                    <p className="text-lg font-bold">{getContractualHoursForShift(detailShift)}h</p>
                                </div>
                                <div className="space-y-1 rounded-md border p-2">
                                    <p className="text-xs font-medium text-muted-foreground">Ore Approvate</p>
                                    <p className="text-lg font-bold">{ordinary}h</p>
                                </div>
                                <div className="space-y-1 rounded-md border p-2">
                                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                                    <p className="text-lg font-bold">{value}</p>
                                </div>
                                <div className="space-y-1 rounded-md border p-2">
                                    <p className="text-xs font-medium text-muted-foreground">Ore Effettive</p>
                                    <p className="text-lg font-bold">{formatMinutes(worked)}</p>
                                </div>
                            </div>
                        );
                    })()}


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
                                {(() => {
                                    if (!detailShift) return null;
                                    
                                    const { calculationStart } = calculateShiftDurations(detailShift.events);
                                    let displayEvents = [...detailShift.events];

                                    // Create a virtual event for the calculated start time
                                    const entrataIndex = displayEvents.findIndex(e => e.type === 'entrata');
                                    if (entrataIndex !== -1 && calculationStart) {
                                        const originalEntrata = displayEvents[entrataIndex];
                                        const virtualEntrata = {
                                            ...originalEntrata,
                                            id: `virtual-${originalEntrata.id}`,
                                            timestamp: Timestamp.fromDate(calculationStart),
                                        };
                                        displayEvents[entrataIndex] = virtualEntrata;
                                    }
                                    
                                    displayEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                                    return displayEvents.map(t => (
                                        <TableRow key={t.id}>
                                            <TableCell className={cn("whitespace-nowrap", t.isAuto && "text-red-500")}>{format(t.timestamp.toDate(), 'HH:mm:ss')}</TableCell>
                                            <TableCell className={cn("capitalize whitespace-nowrap", t.isAuto && "text-red-500")}>{t.type.replace('_', ' ')}</TableCell>
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
                                    ));
                                })()}
                            </TableBody>
                        </Table>
                    </div>

                    <ResponsiveDialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Chiudi</Button>
                        <Button variant="outline" onClick={() => handleOpenEditDialog(detailShift!)}><Pencil className="mr-2 h-4 w-4" /> Modifica</Button>
                        {detailShift && detailShift.status === 'in_sospeso' && (
                          <>
                            <Button variant="destructive" onClick={() => handleRejectShift(detailShift)}>
                                <XCircle className="mr-2 h-4 w-4"/> Rifiuta Turno
                            </Button>
                            <Button onClick={() => handleApprovalProcess(detailShift)}>
                                <CheckCircle className="mr-2 h-4 w-4"/> Approva Turno
                            </Button>
                          </>
                        )}
                        {detailShift && detailShift.status !== 'in_sospeso' && (
                          <>
                            <Button variant="destructive" onClick={() => { setShiftToDelete(detailShift); setIsConfirmingDelete(true); }}><Trash2 className="mr-2 h-4 w-4"/> Elimina</Button>
                          </>
                        )}
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>
            
            <ResponsiveDialog open={isDetailOvertimeOpen} onOpenChange={setIsDetailOvertimeOpen}>
                <ResponsiveDialogContent className="sm:max-w-3xl">
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Dettaglio Turno Straordinario per {operator.firstName}</ResponsiveDialogTitle>
                        {detailOvertimeShift?.date && <ResponsiveDialogDescription>Turno del {formatDate(detailOvertimeShift.date)}</ResponsiveDialogDescription>}
                    </ResponsiveDialogHeader>
                    {detailOvertimeShift && (
                        <div className="grid grid-cols-2 gap-4 text-center my-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Ore Totali Lavorate</p>
                                <p className="text-2xl font-bold">{formatMinutes(calculateOvertimeShiftMinutes(detailOvertimeShift))}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Straordinario Calcolato</p>
                                <p className="text-2xl font-bold">{calculateOvertimeShiftHours(detailOvertimeShift)}h</p>
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto mt-2 max-h-80 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Orario</TableHead>
                                    <TableHead>Evento</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detailOvertimeShift?.events.map((e, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{formatTime(e.timestamp)}</TableCell>
                                        <TableCell className="capitalize">{e.type.replace('_', ' ')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                     <ResponsiveDialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setIsDetailOvertimeOpen(false)}>Chiudi</Button>
                         {detailOvertimeShift && detailOvertimeShift.status === 'in_attesa_di_approvazione' && (
                            <>
                               <Button variant="destructive" onClick={() => handleOvertimeShiftAction(detailOvertimeShift, 'reject')}>
                                  <XCircle className="mr-2 h-4 w-4"/> Rifiuta
                               </Button>
                               <Button onClick={() => handleOvertimeShiftAction(detailOvertimeShift, 'approve')}>
                                  <CheckCircle className="mr-2 h-4 w-4"/> Approva
                               </Button>
                            </>
                         )}
                         {detailOvertimeShift && (
                            <>
                                <Button variant="destructive" onClick={() => { setOvertimeShiftToDelete(detailOvertimeShift); setIsConfirmingOvertimeDelete(true); }}><Trash2 className="mr-2 h-4 w-4"/> Elimina</Button>
                                <Button variant="outline" onClick={() => handleOpenEditOvertimeDialog(detailOvertimeShift)}><Pencil className="mr-2 h-4 w-4"/> Modifica</Button>
                            </>
                         )}
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

            <ResponsiveDialog open={isEditShiftOpen || isEditOvertimeOpen} onOpenChange={isEditShiftOpen ? setIsEditShiftOpen : setIsEditOvertimeOpen}>
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
                        <Button variant="outline" onClick={() => { setIsEditShiftOpen(false); setIsEditOvertimeOpen(false); }}>Annulla</Button>
                        <Button onClick={isEditShiftOpen ? handleEditShift : handleEditOvertimeShift}>Salva Modifiche</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

            <AlertDialog open={isApproveDialogOpen} onOpenChange={(open) => { if (!open) setApprovalContext(null); setIsApproveDialogOpen(open); }}>
                <AlertDialogContent>
                     <AlertDialogHeader>
                        <AlertDialogTitle>Riepilogo e Approvazione Turno</AlertDialogTitle>
                        <AlertDialogDescription>Verifica e modifica le ore calcolate prima di approvare il turno. Le ore verranno registrate come richieste separate.</AlertDialogDescription>
                    </AlertDialogHeader>
                    {approvalContext && (
                        <div className="py-4 space-y-4">
                            <div>
                                <Label htmlFor="ordinary-hours">Ore Ordinarie Lavorate</Label>
                                <Input id="ordinary-hours" type="number" value={approvalContext.ordinaryHours} onChange={(e) => setApprovalContext(p => p ? {...p, ordinaryHours: e.target.value} : null)} step="0.5" min="0" />
                                <p className="text-xs text-muted-foreground mt-1">Le ore di lavoro che rientrano nel contratto.</p>
                            </div>
                            <div>
                                <Label htmlFor="overtime-hours">Ore di Straordinario</Label>
                                <Input id="overtime-hours" type="number" value={approvalContext.overtimeHours} onChange={(e) => setApprovalContext(p => p ? {...p, overtimeHours: e.target.value} : null)} step="1" min="0" />
                                <p className="text-xs text-muted-foreground mt-1">Calcolato con scatto al 50° minuto. Modifica se necessario.</p>
                            </div>
                            {parseFloat(approvalContext.leaveHours) > 0 && (
                                <div>
                                    <Label htmlFor="leave-hours">Ore di Permesso (Ammanco Ore)</Label>
                                    <Input id="leave-hours" type="number" value={approvalContext.leaveHours} onChange={(e) => setApprovalContext(p => p ? {...p, leaveHours: e.target.value} : null)} step="0.5" min="0" />
                                    <div className="flex items-center space-x-2 mt-2">
                                        <Checkbox id="include-leave" checked={approvalContext.createLeaveRequest} onCheckedChange={(checked) => setApprovalContext(p => p ? {...p, createLeaveRequest: !!checked} : null)} />
                                        <Label htmlFor="include-leave" className="text-sm font-normal">
                                            Crea richiesta di permesso per queste ore
                                        </Label>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                     <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmApprove}>Approva e Registra</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={isMissingBreakConfirmOpen} onOpenChange={setIsMissingBreakConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Pausa Mancante</AlertDialogTitle>
                        <AlertDialogDescription>Nessuna pausa registrata per questo turno. Vuoi aggiungerla manualmente?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={handleApproveWithoutBreak}>No, approva senza</Button>
                        <Button onClick={handleOpenAddBreakDialog}>Sì, aggiungi</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <ResponsiveDialog open={isAddBreakDialogOpen} onOpenChange={setIsAddBreakDialogOpen}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Aggiungi Pausa Manuale</ResponsiveDialogTitle>
                        <ResponsiveDialogDescription>Inserisci gli orari di inizio e fine della pausa. I campi sono pre-compilati ma modificabili.</ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="break-start">Inizio Pausa</Label>
                            <Input id="break-start" type="time" value={breakTimes.start} onChange={e => setBreakTimes(p => ({...p, start: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="break-end">Fine Pausa</Label>
                            <Input id="break-end" type="time" value={breakTimes.end} onChange={e => setBreakTimes(p => ({...p, end: e.target.value}))} />
                        </div>
                    </div>
                    <ResponsiveDialogFooter>
                        <Button variant="outline" onClick={() => setIsAddBreakDialogOpen(false)}>Annulla</Button>
                        <Button onClick={handleAddBreakAndOpenApproval}>Aggiungi Pausa e Approva</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>


            <AlertDialog open={isDeleteTimbraturaDialogOpen} onOpenChange={setIsDeleteTimbraturaDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Eliminare questa timbratura?</AlertDialogTitle><AlertDialogDescription>L'azione è permanente e non può essere annullata.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => setDeletingTimbratura(null)}>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDeleteTimbratura}>Elimina</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
