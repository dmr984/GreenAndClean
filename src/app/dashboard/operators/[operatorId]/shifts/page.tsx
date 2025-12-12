

'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Loader2, User, CheckCircle, XCircle, MapPin, Trash2, Eye, Pencil, AlertCircle, Circle, Clock, Briefcase, Plus, PlusCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Unlock, Coffee, MinusCircle, Info } from 'lucide-react';
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
import { isPublicHoliday } from '@/lib/holidays';
import { roundOrdinaryHours, roundOvertimeHours, calculateShiftDetails, calculateHours } from '@/lib/calculations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekDayLabels: Record<DayOfWeek, string> = { monday: 'Lunedì', tuesday: 'Martedì', wednesday: 'Mercoledì', thursday: 'Giovedì', friday: 'Venerdì', saturday: 'Sabato', sunday: 'Domenica' };


type DailySchedule = {
    totalHours?: number;
    startTime?: string; // "HH:mm"
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
    overtimeCalculation?: 'hourly' | 'half_hourly';
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
    ignoreContractualStart?: boolean;
    makeupOfDay?: DayOfWeek;
};

type Shift = {
    id: string; // Composite ID based on events
    date: Date;
    events: Timbratura[];
    status: 'in_sospeso' | 'in_corso' | 'confermato' | 'rifiutato';
    workDuration: number; // total work minutes
    breakDuration: number; // total break minutes
    isOnLeaveDay?: boolean; // Flag for shifts on leave days
    isOvertime: boolean;
    ignoreContractualStart?: boolean;
};

type StraordinarioEvent = {
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    latitude?: number;
    longitude?: number;
};

type StraordinarioShift = {
    id: string;
    events: StraordinarioEvent[];
    status: 'in_corso' | 'in_attesa_di_approvazione' | 'approvato' | 'rifiutato';
    date: Timestamp;
};

type CombinedShiftHistoryItem = (Shift | StraordinarioShift) & { type: 'regular' | 'overtime' };


type UnlockRequest = {
    id: string;
    startDate: Timestamp;
    type: 'sblocco_timbratura';
}

type ManualBreak = { start: string; end: string; };

type ApprovalContext = {
    shift: Shift | StraordinarioShift;
    ordinaryHours: string;
    overtimeHours: string;
    leaveHours?: string;
    createLeaveRequest?: boolean;
    manualBreak?: ManualBreak;
    isOvertimeShift: boolean;
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
    const [editIgnoreContractual, setEditIgnoreContractual] = useState(false);
    const [deletingTimbratura, setDeletingTimbratura] = useState<Timbratura | null>(null);
    const [isDeleteTimbraturaDialogOpen, setIsDeleteTimbraturaDialogOpen] = useState(false);
    const [shiftForBreak, setShiftForBreak] = useState<Shift | null>(null);
    const [isMissingBreakConfirmOpen, setIsMissingBreakConfirmOpen] = useState(false);
    const [isAddBreakDialogOpen, setIsAddBreakDialogOpen] = useState(false);
    const [breakTimes, setBreakTimes] = useState<{ start: string, end: string }>({ start: '', end: '' });
    const [approvalContext, setApprovalContext] = useState<ApprovalContext>(null);
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
    const [newShiftDate, setNewShiftDate] = useState<Date | undefined>(new Date());
    const [newShiftTimes, setNewShiftTimes] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    const [newShiftIgnoreContractual, setNewShiftIgnoreContractual] = useState(false);
    const [newShiftIsMakeup, setNewShiftIsMakeup] = useState(false);
    const [newShiftMakeupDay, setNewShiftMakeupDay] = useState<DayOfWeek | ''>('');
    const [currentPage, setCurrentPage] = useState(0);
    const [overtimeShiftForBreak, setOvertimeShiftForBreak] = useState<StraordinarioShift | null>(null);
    const [isOvertimeMissingBreakConfirmOpen, setIsOvertimeMissingBreakConfirmOpen] = useState(false);
    const [isOvertimeAddBreakDialogOpen, setIsOvertimeAddBreakDialogOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isConfirmingNoLeave, setIsConfirmingNoLeave] = useState(false);


    const contractualStartTime = useMemo(() => {
        if (!newShiftDate || !operator?.workSchedule) return null;
        const dayName = dayIndexToName[getDayFns(newShiftDate)];
        return operator.workSchedule[dayName]?.startTime || null;
    }, [newShiftDate, operator]);
    
    const getShiftDurations = (events: (Timbratura | StraordinarioEvent)[]): { workDuration: number, breakDuration: number } => {
        if (!Array.isArray(events) || events.length < 2) {
            return { workDuration: 0, breakDuration: 0 };
        }

        const clockInEvent = events.find(e => e.type === 'entrata');
        const clockOutEvent = events.find(e => e.type === 'uscita');

        if (!clockInEvent || !clockOutEvent) {
             return { workDuration: 0, breakDuration: 0 };
        }
        
        let totalMillis = clockOutEvent.timestamp.toMillis() - clockInEvent.timestamp.toMillis();
        
        let breakDurationMillis = 0;
        let breakStartTs: Timestamp | null = null;
        for (const e of events) {
            if (e.type === 'pausa') breakStartTs = e.timestamp;
            if (e.type === 'fine_pausa' && breakStartTs) {
                breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
                breakStartTs = null;
            }
        }
        
        totalMillis -= breakDurationMillis;

        const workDuration = totalMillis > 0 ? Math.round(totalMillis / (1000 * 60)) : 0;
        const breakDuration = breakDurationMillis > 0 ? breakDurationMillis / (1000 * 60) : 0;

        return { workDuration, breakDuration };
    };

    const processShift = (events: Timbratura[], leaveDays: Set<string>): Omit<Shift, 'id'> | null => {
        const startTime = events.find(e => e.type === 'entrata')?.timestamp;
        
        // Safety check: if there's no clock-in event, we can't process this as a shift.
        if (!startTime) {
            return null;
        }

        const isComplete = events.some(e => e.type === 'uscita');
        const hasPending = events.some(e => e.status === 'sospesa');
        const allConfirmed = events.every(e => e.status === 'confermata');
    
        let status: Shift['status'];
        if (allConfirmed) {
            status = 'confermato';
        } else if (hasPending && isComplete) {
            status = 'in_sospeso';
        } else if (!isComplete) {
            status = 'in_corso';
        } else {
            status = 'in_sospeso'; 
        }

        const { workDuration, breakDuration } = getShiftDurations(events);
        
        const shiftDateStr = format(startTime.toDate(), 'yyyy-MM-dd');
        const isOnLeaveDay = leaveDays.has(shiftDateStr);
        const clockInEvent = events.find(e => e.type === 'entrata');
        const isOvertime = clockInEvent?.isOvertime ?? false;
        const ignoreContractualStart = clockInEvent?.ignoreContractualStart ?? false;

        return { date: startTime.toDate(), events, status, workDuration, breakDuration, isOnLeaveDay, isOvertime, ignoreContractualStart };
    };

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
                if (event.shiftId) { 
                    if (!shiftsByManualId[event.shiftId]) shiftsByManualId[event.shiftId] = [];
                    shiftsByManualId[event.shiftId].push(event);
                } else { 
                    const dayString = format(event.timestamp.toDate(), 'yyyy-MM-dd');
                    if (!shiftsByDay[dayString]) shiftsByDay[dayString] = [];
                    shiftsByDay[dayString].push(event);
                }
            }

            const groupedShifts: Shift[] = [];
            
            for (const shiftId in shiftsByManualId) {
                const events = shiftsByManualId[shiftId];
                const processed = processShift(events, leaveDays);
                if (processed) {
                    groupedShifts.push({ id: shiftId, ...processed });
                }
            }

            for (const day in shiftsByDay) {
                const dayEvents = shiftsByDay[day];
                let currentShiftEvents: Timbratura[] = [];
                for (const event of dayEvents) {
                    currentShiftEvents.push(event);
                    if (event.type === 'uscita') {
                        const shiftId = currentShiftEvents.map(e => e.id).sort().join('-');
                        const processed = processShift(currentShiftEvents, leaveDays);
                        if (processed) {
                            groupedShifts.push({ id: shiftId, ...processed });
                        }
                        currentShiftEvents = [];
                    }
                }
                if (currentShiftEvents.length > 0) {
                    const shiftId = currentShiftEvents.map(e => e.id).sort().join('-');
                    const processed = processShift(currentShiftEvents, leaveDays);
                    if (processed) {
                        groupedShifts.push({ id: shiftId, ...processed });
                    }
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

    const historicalShifts: CombinedShiftHistoryItem[] = useMemo(() => {
        const approvedRegularShifts = allShifts
            .filter(s => s.status === 'confermato' || s.status === 'rifiutato')
            .map(s => ({ ...s, type: 'regular' as const }));
    
        const historicalOvertimeShifts = overtimeShifts
            .filter(s => s.status === 'approvato' || s.status === 'rifiutato')
            .map(s => ({ ...s, type: 'overtime' as const }));
    
        const combined = [...approvedRegularShifts, ...historicalOvertimeShifts];
    
        combined.sort((a, b) => {
            const dateA = a.type === 'regular' ? a.events[0]?.timestamp.toMillis() : (a as StraordinarioShift).date.toMillis();
            const dateB = b.type === 'regular' ? b.events[0]?.timestamp.toMillis() : (b as StraordinarioShift).date.toMillis();
            return (dateB || 0) - (dateA || 0);
        });
    
        return combined;
    }, [allShifts, overtimeShifts]);

    if (isLoading || !operator) return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    
    const handleConfirmApprove = async () => {
        setIsConfirmingNoLeave(false);
        await proceedWithApproval();
    };

    const proceedWithApproval = async () => {
        if (!approvalContext || !firestore || !operator) return;
        const { shift, isOvertimeShift } = approvalContext;
    
        if (isOvertimeShift) {
            await handleOvertimeShiftAction(shift as StraordinarioShift, 'approve', approvalContext.manualBreak);
        } else {
            await handleRegularShiftApproval();
        }
    };
    
    const handleApprovalClick = () => {
        if (!approvalContext) return;
        const { leaveHours, createLeaveRequest } = approvalContext;
        const hasLeaveHours = parseFloat(leaveHours || '0') > 0;

        if (hasLeaveHours && !createLeaveRequest) {
            setIsConfirmingNoLeave(true);
        } else {
            proceedWithApproval();
        }
    };
    
    const handleRegularShiftApproval = async () => {
        if (!approvalContext || approvalContext.isOvertimeShift || !firestore || !operator) return;
    
        const { shift, ordinaryHours, overtimeHours, leaveHours, createLeaveRequest, manualBreak } = approvalContext;
        const regularShift = shift as Shift;
        const approvedOvertime = parseFloat(overtimeHours) || 0;
        const approvedLeave = (createLeaveRequest && leaveHours) ? (parseFloat(leaveHours) || 0) : 0;
    
        const batch = writeBatch(firestore);
        const timbratureRef = collection(firestore, `app-users/${operator.id}/timbrature`);
        
        regularShift.events.forEach(event => {
            if (event.status === 'sospesa') {
                const docRef = doc(timbratureRef, event.id);
                batch.update(docRef, { status: 'confermata', viewedByOperator: false });
            }
        });
        
        if (manualBreak && manualBreak.start && manualBreak.end) {
            const shiftId = regularShift.events[0]?.shiftId || regularShift.id;
            const shiftDate = regularShift.events[0].timestamp.toDate();

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
    
        const shiftDate = regularShift.events[0].timestamp.toDate();
    
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
                associatedShiftId: regularShift.id,
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
            const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
            batch.delete(docRef);
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
            if (times[e.type] === '') { 
               times[e.type] = format(e.timestamp.toDate(), 'HH:mm');
            }
        });
        setEditShiftTimes(times);
        setEditIgnoreContractual(shift.ignoreContractualStart || false);
        setIsEditShiftOpen(true);
    };

    const handleEditShift = async () => {
        if (!firestore || !editingShift || !editShiftTimes.entrata || !operator) {
            toast({ title: 'Dati mancanti', description: 'L\'orario di entrata è obbligatorio.', variant: 'destructive' });
            return;
        }
    
        if ((editShiftTimes.pausa && !editShiftTimes.fine_pausa) || (!editShiftTimes.pausa && editShiftTimes.fine_pausa)) {
             toast({ title: 'Pausa incompleta', description: 'Devi inserire sia l\'inizio che la fine della pausa.', variant: 'destructive' });
             return;
        }
    
        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operator.id}/timbrature`);
        const shiftDate = editingShift.events[0].timestamp.toDate();
        
        const shiftId = editingShift.events.find(e => e.shiftId)?.shiftId || editingShift.id;
    
        const createTimestamp = (time: string): Timestamp | null => {
            if (!time) return null;
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return null;
            return Timestamp.fromDate(set(shiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };
        
        const newEventData: Partial<Record<Timbratura['type'], { timestamp: Timestamp, id?: string }>> = {};
        for (const type of ['entrata', 'uscita', 'pausa', 'fine_pausa'] as const) {
            const time = editShiftTimes[type];
            if (time) {
                const timestamp = createTimestamp(time);
                if (!timestamp) {
                    toast({ title: 'Orario non valido', description: `L'orario per '${type}' non è valido.`, variant: 'destructive' });
                    return;
                }
                const existingEvent = editingShift.events.find(e => e.type === type);
                newEventData[type] = { timestamp, id: existingEvent?.id };
            }
        }
        
        const isApprovedShift = editingShift.status === 'confermato';
        let newEventsForState: Timbratura[] = [...editingShift.events];
    
        for (const type of ['entrata', 'uscita', 'pausa', 'fine_pausa'] as const) {
            const existingEvent = editingShift.events.find(e => e.type === type);
            const newEventDetails = newEventData[type];
    
            if (newEventDetails && existingEvent) { 
                const docRef = doc(timbratureCollectionRef, existingEvent.id);
                const updatePayload: any = { 
                    timestamp: newEventDetails.timestamp, 
                    viewedByOperator: false, 
                    shiftId: shiftId 
                };
                if (type === 'entrata') {
                    updatePayload.ignoreContractualStart = editIgnoreContractual;
                }
                batch.update(docRef, updatePayload);
                newEventsForState = newEventsForState.map(e => e.id === existingEvent.id ? { ...e, ...updatePayload, timestamp: newEventDetails.timestamp } : e);
    
            } else if (newEventDetails && !existingEvent) { 
                const newDocRef = doc(timbratureCollectionRef);
                const finalStatus = isApprovedShift ? 'confermata' : 'sospesa';
                 const newEventPayload: Omit<Timbratura, 'id'> = {
                    userId: operator.id,
                    type: type,
                    timestamp: newEventDetails.timestamp,
                    status: finalStatus,
                    viewedByOperator: false,
                    isOvertime: editingShift.isOvertime,
                    shiftId: shiftId, 
                    isAuto: true,
                    ...(type === 'entrata' && { ignoreContractualStart: editIgnoreContractual })
                };
                batch.set(newDocRef, newEventPayload);
                newEventsForState.push({ ...newEventPayload, id: newDocRef.id });
    
            } else if (!newEventDetails && existingEvent) { 
                const docRef = doc(timbratureCollectionRef, existingEvent.id);
                batch.delete(docRef);
                newEventsForState = newEventsForState.filter(e => e.id !== existingEvent.id);
            }
        }
        
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno aggiornato con successo.' });
            setIsEditShiftOpen(false);
            setEditingShift(null);
            
            if (detailShift) {
                const newProcessedShift = processShift(newEventsForState, new Set());
                if (newProcessedShift) {
                  setDetailShift(prev => prev ? ({ ...prev, ...newProcessedShift, events: newEventsForState }) : null);
                } else {
                  setIsDetailOpen(false);
                }
            }
            
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

    const handleOpenDetailDialog = async (shift: CombinedShiftHistoryItem) => {
        if (!firestore || !operatorId) return;
        if (shift.type === 'regular') {
            const shiftId = shift.id;
            const shiftDate = shift.events[0].timestamp.toDate();
            const startOfShiftDay = startOfDay(shiftDate);
            const endOfShiftDay = endOfDay(shiftDate);
    
            const timbratureQuery = query(
                collection(firestore, `app-users/${operatorId}/timbrature`),
                where('timestamp', '>=', startOfShiftDay),
                where('timestamp', '<=', endOfShiftDay)
            );
    
            try {
                const dayEventsSnapshot = await getDocs(timbratureQuery);
                const allDayEvents = dayEventsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));
                
                const shiftEvents = allDayEvents.filter(e => {
                     // If shiftId exists on the event, it must match.
                    if (e.shiftId) {
                        return e.shiftId === shiftId;
                    }
                    // Fallback for older data: check if event id is in the original shift's events.
                    // This covers shifts created before the shiftId property was introduced.
                    return shift.events.some(se => se.id === e.id);
                });

                if(shiftEvents.length > 0) {
                    const processedShift = processShift(shiftEvents, new Set());
                    if (processedShift) {
                        setDetailShift({ ...shift, ...processedShift, events: shiftEvents.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis()) });
                    } else {
                        setDetailShift(shift);
                    }
                } else {
                    setDetailShift(shift);
                }
            } catch (error) {
                console.error("Error fetching shift details:", error);
                toast({ title: "Errore", description: "Impossibile caricare i dettagli del turno.", variant: "destructive" });
                setDetailShift(shift);
            }
    
            setIsDetailOpen(true);
        } else {
            setDetailOvertimeShift(shift);
            setIsDetailOvertimeOpen(true);
        }
    }
    
    const getContractualHoursForShift = (shift: Shift | null): number => {
        if (!shift || !operator?.workSchedule) return 0;
        
        const clockInEvent = shift.events.find(e => e.type === 'entrata');
        if(!clockInEvent) return 0;

        const dayToUse = clockInEvent.makeupOfDay || dayIndexToName[getDayFns(clockInEvent.timestamp.toDate())];

        return operator.workSchedule[dayToUse]?.totalHours || 0;
    };
    
    
    const handleApprovalProcess = (shift: Shift) => {
        if (!operator || !shift.events[0]) return;

        const hasBreak = shift.events.some(e => e.type === 'pausa');
        
        const clockInEvent = shift.events.find(e => e.type === 'entrata');
        const dayToUse = clockInEvent?.makeupOfDay || dayIndexToName[getDayFns(shift.events[0].timestamp.toDate())];
        const dailySchedule = operator.workSchedule[dayToUse];
        const mandatoryBreakMinutes = dailySchedule?.breakMinutes || 0;

        if (isSameDay(shift.events[0].timestamp.toDate(), new Date()) && !shift.events.some(e=> e.type === 'uscita')){
             toast({ title: 'Turno in corso', description: 'Non puoi approvare un turno non ancora terminato.', variant: 'destructive'});
             return;
        }

        if (!hasBreak && mandatoryBreakMinutes > 0) {
            setShiftForBreak(shift);
            setIsMissingBreakConfirmOpen(true);
        } else {
            handleOpenApproveDialog(shift, false);
        }
    };
    
    const handleApproveWithoutBreak = () => {
        if (shiftForBreak) {
            handleOpenApproveDialog(shiftForBreak, false);
        }
        setIsMissingBreakConfirmOpen(false);
        setShiftForBreak(null);
    };

    const handleOpenAddBreakDialog = () => {
        if (!shiftForBreak || !operator) return;

        const shiftDate = shiftForBreak.events[0].timestamp.toDate();
        const clockInEvent = shiftForBreak.events.find(e => e.type === 'entrata');
        const dayToUse = clockInEvent?.makeupOfDay || dayIndexToName[getDayFns(shiftDate)];
        const mandatoryBreakMinutes = operator.workSchedule[dayToUse]?.breakMinutes || 0;

        const existingBreakStart = shiftForBreak.events.find(e => e.type === 'pausa');
        
        let prefilledStart = '12:30';
        let prefilledEnd = '13:30'; 

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

    const handleAddBreakAndReload = async () => {
        if (!shiftForBreak || !firestore || !operator || !breakTimes.start || !breakTimes.end) return;
    
        const batch = writeBatch(firestore);
        const timbratureRef = collection(firestore, `app-users/${operator.id}/timbrature`);
        
        const shiftId = shiftForBreak.events.find(e => e.shiftId)?.shiftId || shiftForBreak.id;
        const shiftDate = shiftForBreak.events[0].timestamp.toDate();
    
        const createTimestamp = (time: string): Timestamp => {
            const [hours, minutes] = time.split(':').map(Number);
            return Timestamp.fromDate(set(shiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };
    
        const breakStartRef = doc(timbratureRef);
        const breakStartData: Omit<Timbratura, 'id'> = {
            userId: operator.id, type: 'pausa', timestamp: createTimestamp(breakTimes.start),
            status: 'confermata', viewedByOperator: false, shiftId, isAuto: true
        };
        batch.set(breakStartRef, breakStartData);
    
        const breakEndRef = doc(timbratureRef);
        const breakEndData: Omit<Timbratura, 'id'> = {
            userId: operator.id, type: 'fine_pausa', timestamp: createTimestamp(breakTimes.end),
            status: 'confermata', viewedByOperator: false, shiftId, isAuto: true
        };
        batch.set(breakEndRef, breakEndData);
    
        try {
            await batch.commit();
            toast({ title: 'Pausa Aggiunta', description: 'La pausa è stata aggiunta. Puoi approvare il turno.' });
            
            const updatedEvents = [
                ...shiftForBreak.events,
                { ...breakStartData, id: breakStartRef.id } as Timbratura,
                { ...breakEndData, id: breakEndRef.id } as Timbratura
            ].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    
            setDetailShift(prev => prev ? ({ ...prev, events: updatedEvents }) : null);
    
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile aggiungere la pausa.', variant: 'destructive' });
        } finally {
            setIsAddBreakDialogOpen(false);
            setShiftForBreak(null);
            setBreakTimes({ start: '', end: '' });
        }
    };


    const handleOpenApproveDialog = (shift: Shift | StraordinarioShift, isOvertimeShift: boolean, manualBreak?: ManualBreak) => {
        if (!operator) return;
    
        let ordinary = 0, overtime = 0, leave = 0;
    
        if (isOvertimeShift) {
            const overtimeShift = shift as StraordinarioShift;
            const workedMinutes = calculateOvertimeShiftMinutes(overtimeShift, manualBreak);
            overtime = roundOvertimeHours(workedMinutes, operator?.overtimeCalculation);
        } else {
            const regularShift = shift as Shift;
            const clockInEvent = regularShift.events.find(e => e.type === 'entrata');
            const dayToUse = clockInEvent?.makeupOfDay || dayIndexToName[getDayFns(regularShift.date)];
            const schedule = operator.workSchedule[dayToUse];
            const ignoreContractualStart = regularShift.ignoreContractualStart || false;
            
            const hoursResult = calculateHours(regularShift, schedule, ignoreContractualStart, operator.overtimeCalculation);
            ordinary = hoursResult.ordinary;
            overtime = hoursResult.overtime;
            leave = hoursResult.leave;
        }
    
        setApprovalContext({
            shift: shift,
            ordinaryHours: String(ordinary),
            overtimeHours: String(overtime),
            leaveHours: String(leave),
            manualBreak: manualBreak,
            createLeaveRequest: false, // Default to false
            isOvertimeShift: isOvertimeShift
        });
        setIsApproveDialogOpen(true);
    };
    
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

        const dayName = dayIndexToName[getDayFns(newShiftDate)];
        const schedule = operator.workSchedule[dayName];
        
        if (!newShiftIgnoreContractual && schedule?.startTime) {
            const [contractualHours, contractualMinutes] = schedule.startTime.split(':').map(Number);
            const contractualStart = set(newShiftDate, { hours: contractualHours, minutes: contractualMinutes, seconds: 0, milliseconds: 0 });
            
            const [entryHours, entryMinutes] = newShiftTimes.entrata.split(':').map(Number);
            const entryTime = set(newShiftDate, { hours: entryHours, minutes: entryMinutes, seconds: 0, milliseconds: 0 });

            const twoHoursBefore = new Date(contractualStart.getTime() - 120 * 60000);

            if (entryTime < twoHoursBefore) {
                 toast({ 
                    title: 'Orario non valido', 
                    description: `L'orario di entrata è prima delle ${format(twoHoursBefore, 'HH:mm')}. Seleziona 'Ignora orario di inizio contrattuale' per forzare.`, 
                    variant: 'destructive',
                    duration: 7000
                });
                return;
            }
        }
    
        const createTimestamp = (time: string): Timestamp => {
            const [hours, minutes] = time.split(':').map(Number);
            return Timestamp.fromDate(set(newShiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };
        
        const isWorkDay = (schedule?.totalHours || 0) > 0 && !isPublicHoliday(newShiftDate);
        const isOvertime = !isWorkDay && !newShiftIsMakeup;
        
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
                const eventPayload: Omit<Timbratura, 'id'> = {
                    userId: operatorId, 
                    type: event.type, 
                    timestamp: createTimestamp(event.time),
                    status: 'sospesa' as const, 
                    viewedByOperator: false, 
                    isOvertime,
                    shiftId: manualShiftId,
                };
                if (event.type === 'entrata') {
                    eventPayload.ignoreContractualStart = newShiftIgnoreContractual;
                    if(newShiftIsMakeup && newShiftMakeupDay) {
                        eventPayload.makeupOfDay = newShiftMakeupDay;
                    }
                }
                batch.set(newDocRef, eventPayload);
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
        setNewShiftIgnoreContractual(false);
        setNewShiftIsMakeup(false);
        setNewShiftMakeupDay('');
    };
    
    
    const formatTime = (date: Timestamp | undefined | null) => date ? format(date.toDate(), 'p', { locale: it }) : '--:--';
    const formatDate = (date: Timestamp | undefined | Date) => date ? format(date instanceof Date ? date : date.toDate(), 'PPP', { locale: it }) : 'N/D';
    
    const totalPages = Math.ceil(historicalShifts.length / ITEMS_PER_PAGE);
    const paginatedApprovedShifts = historicalShifts.slice(
        currentPage * ITEMS_PER_PAGE,
        (currentPage + 1) * ITEMS_PER_PAGE
    );
    
    const handleOvertimeShiftApprovalProcess = (shift: StraordinarioShift) => {
        if (!operator) return;

        const hasBreak = shift.events.some(e => e.type === 'pausa');
        
        if (isSameDay(shift.date.toDate(), new Date()) && !shift.events.some(e=> e.type === 'uscita')){
             toast({ title: 'Turno in corso', description: 'Non puoi approvare un turno non ancora terminato.', variant: 'destructive'});
             return;
        }
        
        handleOpenApproveDialog(shift, true);
    };
    
    const handleOvertimeShiftAction = async (shift: StraordinarioShift, action: 'approve' | 'reject', manualBreak?: ManualBreak) => {
        if (!firestore || !operatorId || !operator) return;

        const shiftRef = doc(firestore, `app-users/${operatorId}/straordinari`, shift.id);

        if (action === 'reject') {
            await updateDoc(shiftRef, { status: 'rifiutato' });
            toast({ title: 'Successo', description: `Turno straordinario rifiutato.` });
            setIsDetailOvertimeOpen(false);
            return;
        }

        if (!approvalContext) return;

        const approvedOvertime = parseFloat(approvalContext.overtimeHours) || 0;
        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operatorId}/timbrature`);
        
        let eventsToProcess = [...shift.events];
        if (manualBreak && manualBreak.start && manualBreak.end) {
             const createTimestamp = (time: string): Timestamp => {
                const [hours, minutes] = time.split(':').map(Number);
                return Timestamp.fromDate(set(shift.date.toDate(), { hours, minutes, seconds: 0, milliseconds: 0 }));
            };
            eventsToProcess.push({ type: 'pausa', timestamp: createTimestamp(manualBreak.start), latitude: 0, longitude: 0 });
            eventsToProcess.push({ type: 'fine_pausa', timestamp: createTimestamp(manualBreak.end), latitude: 0, longitude: 0 });
        }
        
        eventsToProcess.forEach(event => {
            const newTimbraturaRef = doc(timbratureCollectionRef);
            batch.set(newTimbraturaRef, {
                userId: operatorId,
                type: event.type,
                timestamp: event.timestamp,
                status: 'confermata',
                viewedByOperator: false,
                latitude: event.latitude ?? null,
                longitude: event.longitude ?? null,
                isOvertime: true
            });
        });
    
        if (approvedOvertime > 0) {
             const overtimeRequest = {
                userId: operator.id,
                type: 'straordinario' as const,
                status: 'approvato' as const,
                startDate: shift.date,
                endDate: shift.date,
                hours: approvedOvertime,
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
            setIsApproveDialogOpen(false);
            setApprovalContext(null);
            setIsDetailOvertimeOpen(false);
        }
    };
    
    const calculateOvertimeShiftMinutes = (shift: StraordinarioShift, manualBreak?: ManualBreak) => {
        let { workDuration } = getShiftDurations(shift.events);

        if (manualBreak && manualBreak.start && manualBreak.end) {
             const startTime = shift.events.find(e => e.type === 'entrata')?.timestamp;
             const endTime = shift.events.find(e => e.type === 'uscita')?.timestamp;

             if (startTime && endTime) {
                let totalMillis = endTime.toMillis() - startTime.toMillis();
                const breakStart = parse(manualBreak.start, 'HH:mm', new Date());
                const breakEnd = parse(manualBreak.end, 'HH:mm', new Date());
                totalMillis -= (breakEnd.getTime() - breakStart.getTime());
                workDuration = totalMillis > 0 ? totalMillis / (1000 * 60) : 0;
            }
        }
        return workDuration;
    };
    
    const calculateOvertimeShiftHours = (shift: StraordinarioShift, manualBreak?: ManualBreak) => {
        const workMinutes = calculateOvertimeShiftMinutes(shift, manualBreak);
        return roundOvertimeHours(workMinutes, operator?.overtimeCalculation);
    }
    
    const handleDeleteOvertimeShift = async () => {
        if (!firestore || !overtimeShiftToDelete || !operator) return;
        const docRef = doc(firestore, `app-users/${operator.id}/straordinari`, overtimeShiftToDelete.id);
        
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Turno straordinario eliminato.' });
        }).catch((error: any) => {
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
                newEvents.push({ type, timestamp, latitude: 0, longitude: 0 }); 
            }
        }
        
        newEvents.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
        
        const docRef = doc(firestore, `app-users/${operator.id}/straordinari`, editingOvertimeShift.id);
        await updateDoc(docRef, { events: newEvents }).then(() => {
            toast({ title: 'Successo', description: 'Turno straordinario aggiornato.' });
            setIsEditOvertimeOpen(false);
            setEditingOvertimeShift(null);
            
            setDetailOvertimeShift(prev => prev ? ({ ...prev, events: newEvents }) : null);

        }).catch(err => {
            toast({ title: 'Errore', description: 'Impossibile aggiornare il turno.', variant: 'destructive' });
        });
    }
    
    const handleApproveOvertimeWithoutBreak = () => {
        if (overtimeShiftForBreak) {
            handleOpenApproveDialog(overtimeShiftForBreak, true);
        }
        setIsOvertimeMissingBreakConfirmOpen(false);
        setOvertimeShiftForBreak(null);
    };

    const handleAddOvertimeBreak = () => {
        if (!overtimeShiftForBreak) return;
        setBreakTimes({ start: '', end: '' });
        setIsOvertimeAddBreakDialogOpen(true);
        setIsOvertimeMissingBreakConfirmOpen(false);
    };
    
    const handleConfirmAddOvertimeBreak = () => {
        if (!overtimeShiftForBreak || !breakTimes.start || !breakTimes.end) return;
        handleOpenApproveDialog(overtimeShiftForBreak, true, breakTimes);
        setIsOvertimeAddBreakDialogOpen(false);
        setOvertimeShiftForBreak(null);
        setBreakTimes({ start: '', end: '' });
    };


    const getAdjustedStartTime = (shift: Shift): { display: string; calculationStart: Date | null } => {
        if (!operator || !shift?.events?.length) return { display: '--:--', calculationStart: null };
        const clockInEvent = shift.events.find(e => e.type === 'entrata');
        if (!clockInEvent) return { display: '--:--', calculationStart: null };
        
        const dayToUse = clockInEvent.makeupOfDay || dayIndexToName[getDayFns(clockInEvent.timestamp.toDate())];
        const schedule = operator.workSchedule[dayToUse];
        const ignoreContractualStart = shift.ignoreContractualStart || false;
        
        const { calculationStart } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart);
        const originalTime = format(clockInEvent.timestamp.toDate(), 'HH:mm:ss');
        
        if (calculationStart && Math.abs(calculationStart.getTime() - clockInEvent.timestamp.toDate().getTime()) > 1000) {
           return { display: `${originalTime} (${format(calculationStart, 'HH:mm')})`, calculationStart };
        }

        return { display: originalTime, calculationStart };
    }
    
    const getAdjustedEndTime = (shift: Shift): { display: string; calculationEnd: Date | null } => {
        if (!operator || !shift?.events?.length) return { display: '--:--', calculationEnd: null };
    
        const clockOutEvent = shift.events.find(e => e.type === 'uscita');
        if (!clockOutEvent) return { display: '--:--', calculationEnd: null };
    
        const originalTime = format(clockOutEvent.timestamp.toDate(), 'HH:mm:ss');
        
        const clockInEvent = shift.events.find(e => e.type === 'entrata');
        const dayToUse = clockInEvent?.makeupOfDay || dayIndexToName[getDayFns(shift.date)];
        const schedule = operator.workSchedule[dayToUse];
        const ignoreContractualStart = shift.ignoreContractualStart || false;
        
        const { ordinary, overtime } = calculateHours(shift, schedule, ignoreContractualStart, operator.overtimeCalculation);
        const { calculationStart, breakMinutes } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart);
    
        if (!calculationStart) {
            return { display: originalTime, calculationEnd: clockOutEvent.timestamp.toDate() };
        }
    
        const totalCalculatedMinutes = (ordinary + overtime) * 60;
        const totalCalculatedMillis = totalCalculatedMinutes * 60000;
        const breakMillis = breakMinutes * 60000;
    
        const calculatedEndTime = new Date(calculationStart.getTime() + totalCalculatedMillis + breakMillis);
    
        if (Math.abs(calculatedEndTime.getTime() - clockOutEvent.timestamp.toDate().getTime()) > 60000) {
             return { display: `${originalTime} (${format(calculatedEndTime, 'HH:mm')})`, calculationEnd: calculatedEndTime };
        }
        
        return { display: originalTime, calculationEnd: clockOutEvent.timestamp.toDate() };
    };
    
    const getAdjustedOvertimeTimes = (shift: StraordinarioShift) => {
        const startTimeEvent = shift.events.find(e => e.type === 'entrata');
        if (!startTimeEvent) return { start: '--:--', end: '--:--' };
        
        const dayName = dayIndexToName[getDayFns(startTimeEvent.timestamp.toDate())];
        const schedule = operator?.workSchedule[dayName];
        
        const { calculationStart, calculationEnd } = calculateShiftDetails(shift.events as Timbratura[], schedule, true);
        const originalStartTime = format(startTimeEvent.timestamp.toDate(), 'HH:mm:ss');
        
        const startDisplay = calculationStart && Math.abs(calculationStart.getTime() - startTimeEvent.timestamp.toDate().getTime()) > 1000
            ? `${originalStartTime} (${format(calculationStart, 'HH:mm')})`
            : originalStartTime;

        const endTimeEvent = shift.events.find(e => e.type === 'uscita');
        if (!endTimeEvent) return { start: startDisplay, end: '--:--'};
        
        const originalEndTime = format(endTimeEvent.timestamp.toDate(), 'HH:mm:ss');
        const endDisplay = calculationEnd && Math.abs(calculationEnd.getTime() - endTimeEvent.timestamp.toDate().getTime()) > 60000
            ? `${originalEndTime} (${format(calculationEnd, 'HH:mm')})`
            : originalEndTime;

        return {
            start: startDisplay,
            end: endDisplay
        };
    };

    return (
        <div className="space-y-6">

            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className='flex items-center gap-2'>
                           <h1 className="text-3xl font-bold tracking-tight">{operator.firstName} {operator.lastName}</h1>
                           <Button variant="ghost" size="icon" onClick={() => setIsHelpOpen(true)}><Info className="h-5 w-5"/></Button>
                         </div>
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
                                                <TableCell className='flex items-center gap-2 whitespace-nowrap'>
                                                  {shift.isOnLeaveDay && <AlertCircle className="h-5 w-5 text-yellow-500" />}
                                                  {formatDate(startTime)}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">{formatTime(startTime)}</TableCell>
                                                <TableCell className="whitespace-nowrap">{formatTime(endTime)}</TableCell>
                                                <TableCell className="whitespace-nowrap">{formatMinutes(shift.workDuration)}</TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    <Badge variant={
                                                        shift.status === 'in_sospeso' ? 'default'
                                                        : shift.status === 'confermato' ? 'secondary'
                                                        : 'outline'
                                                    } className={cn(
                                                        shift.status === 'in_sospeso' && 'bg-yellow-500 text-white',
                                                        shift.status === 'in_corso' && 'bg-blue-500 text-white'
                                                        )}>
                                                    {shift.status.replace('_', ' ')}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDetailDialog({ ...shift, type: 'regular' })}>
                                                        <Eye className="h-5 w-5" />
                                                    </Button>
                                                     <Button variant="ghost" size="icon" onClick={() => { setShiftToDelete(shift); setIsConfirmingDelete(true); }}>
                                                        <Trash2 className="h-5 w-5 text-destructive" />
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
                                            <TableCell className="whitespace-nowrap">{formatDate(shift.date)}</TableCell>
                                            <TableCell className="whitespace-nowrap">{formatTime(shift.events.find(e => e.type === 'entrata')?.timestamp)}</TableCell>
                                            <TableCell className="whitespace-nowrap">{formatTime(shift.events.find(e => e.type === 'uscita')?.timestamp)}</TableCell>
                                            <TableCell className="text-right whitespace-nowrap">
                                                <Button variant="ghost" size="icon" onClick={() => handleOpenDetailDialog({ ...shift, type: 'overtime' })}>
                                                    <Eye className="h-5 w-5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => { setOvertimeShiftToDelete(shift); setIsConfirmingOvertimeDelete(true); }}>
                                                    <Trash2 className="h-5 w-5 text-destructive" />
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
                                        <TableHead className="whitespace-nowrap">Data</TableHead>
                                        <TableHead className="whitespace-nowrap">Tipo</TableHead>
                                        <TableHead className="whitespace-nowrap">Inizio</TableHead>
                                        <TableHead className="whitespace-nowrap">Fine</TableHead>
                                        <TableHead className="whitespace-nowrap">Durata</TableHead>
                                        <TableHead className="whitespace-nowrap">Stato</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedApprovedShifts.map((shift, index) => {
                                        const isRegular = shift.type === 'regular';
                                        const displayShift = shift as Shift; 
                                        const displayOvertime = shift as StraordinarioShift;

                                        const startTime = isRegular ? displayShift.events[0]?.timestamp : displayOvertime.events.find(e => e.type === 'entrata')?.timestamp;
                                        const endTime = isRegular ? displayShift.events.find(e => e.type === 'uscita')?.timestamp : displayOvertime.events.find(e => e.type === 'uscita')?.timestamp;
                                        const duration = isRegular ? displayShift.workDuration : calculateOvertimeShiftMinutes(displayOvertime);
                                        const date = isRegular ? startTime : displayOvertime.date;

                                        return (
                                            <TableRow key={`${shift.id}-${index}`}>
                                                <TableCell className="whitespace-nowrap">{formatDate(date)}</TableCell>
                                                <TableCell className='whitespace-nowrap'>
                                                    {isRegular ? <Badge variant="secondary">Ordinario</Badge> : <Badge className="bg-amber-500 text-white">Straordinario</Badge>}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">{formatTime(startTime)}</TableCell>
                                                <TableCell className="whitespace-nowrap">{formatTime(endTime)}</TableCell>
                                                <TableCell className="whitespace-nowrap">{formatMinutes(duration)}</TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    <Badge variant={shift.status === 'confermato' || shift.status === 'approvato' ? 'secondary' : 'destructive'}>
                                                        {shift.status.charAt(0).toUpperCase() + shift.status.slice(1).replace('_', ' ')}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
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
                           {newShiftDate && (
                                <p className="text-sm text-muted-foreground pt-2">
                                    {contractualStartTime 
                                        ? `Inizio turno previsto: ${contractualStartTime}`
                                        : "Nessun orario di inizio specifico previsto per questo giorno."
                                    }
                                </p>
                           )}
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
                        <Separator/>
                         <div className="flex items-center space-x-2">
                            <Checkbox id="add-ignore-contractual" checked={newShiftIgnoreContractual} onCheckedChange={(checked) => setNewShiftIgnoreContractual(!!checked)} />
                            <Label htmlFor="add-ignore-contractual" className="text-sm font-normal">
                                Ignora orario di inizio contrattuale
                            </Label>
                        </div>
                         <div className="flex items-center space-x-2">
                            <Checkbox id="add-is-makeup" checked={newShiftIsMakeup} onCheckedChange={(checked) => setNewShiftIsMakeup(!!checked)} />
                            <Label htmlFor="add-is-makeup" className="text-sm font-normal">
                                Questo turno è un recupero
                            </Label>
                        </div>
                        {newShiftIsMakeup && (
                            <div className="space-y-2">
                                <Label>Recupero di:</Label>
                                 <Select value={newShiftMakeupDay} onValueChange={v => setNewShiftMakeupDay(v as DayOfWeek)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleziona il giorno da recuperare" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(weekDayLabels).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
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
                    <ResponsiveDialogHeader className="pb-2">
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

                     {detailShift && operator && (() => {
                        const clockInEvent = detailShift.events.find(e => e.type === 'entrata');
                        const dayToUse = clockInEvent?.makeupOfDay || dayIndexToName[getDayFns(detailShift.date)];
                        const schedule = operator.workSchedule[dayToUse];
                        const ignoreContractualStart = detailShift.ignoreContractualStart || false;
                        
                        const { ordinary, overtime, leave, worked, break: breakDuration } = calculateHours(detailShift, schedule, ignoreContractualStart, operator.overtimeCalculation);
                        
                        let mainResultLabel = 'Straordinari';
                        let mainResultValue = `${overtime}h`;

                        if (overtime === 0 && leave > 0) {
                            mainResultLabel = 'Permessi';
                            mainResultValue = `${leave}h`;
                        } else if (overtime > 0 && leave > 0) {
                             mainResultValue = `${overtime}h (Perm: ${leave}h)`;
                        }

                        return (
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center my-2">
                                <div className="space-y-1 rounded-md border p-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">Ore Previste</p>
                                    <p className="text-lg font-bold">{getContractualHoursForShift(detailShift)}h</p>
                                </div>
                                <div className="space-y-1 rounded-md border p-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">Ore Ordinarie</p>
                                    <p className="text-lg font-bold">{isNaN(ordinary) ? '0h' : `${ordinary}h`}</p>
                                </div>
                                <div className="space-y-1 rounded-md border p-1.5">
                                     <p className="text-xs font-medium text-muted-foreground">{mainResultLabel}</p>
                                    <p className="text-lg font-bold">{isNaN(overtime) ? '0h' : mainResultValue}</p>
                                </div>
                                <div className="space-y-1 rounded-md border p-1.5">
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
                                    
                                    const displayEvents = [...detailShift.events].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                                    return displayEvents.map(t => {
                                        const { display: displayStart } = getAdjustedStartTime(detailShift);
                                        const { display: displayEnd } = getAdjustedEndTime(detailShift);
                                        const isEntrata = t.type === 'entrata';
                                        const isUscita = t.type === 'uscita';
                                        
                                        return (
                                        <TableRow key={t.id}>
                                            <TableCell className={cn("whitespace-nowrap", t.isAuto && "text-muted-foreground italic")}>
                                               <div className='flex flex-col'>
                                                  <span>
                                                     {isEntrata ? displayStart : (isUscita ? displayEnd : format(t.timestamp.toDate(), 'HH:mm:ss'))}
                                                  </span>
                                               </div>
                                            </TableCell>
                                            <TableCell className={cn("capitalize whitespace-nowrap", t.isAuto && "text-muted-foreground italic")}>{t.type.replace('_', ' ')}</TableCell>
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
                                    )});
                                })()}
                            </TableBody>
                        </Table>
                    </div>

                    <ResponsiveDialogFooter className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                        {(detailShift?.status === 'in_sospeso' || detailShift?.status === 'in_corso') ? (
                             <>
                               <Button variant="destructive" className="w-full sm:col-span-1" onClick={() => handleRejectShift(detailShift)}>
                                  <XCircle className="mr-2 h-4 w-4"/> Rifiuta
                               </Button>
                                <Button variant="outline" className="w-full sm:col-span-1" onClick={() => handleOpenEditDialog(detailShift!)}>
                                    <Pencil className="mr-2 h-4 w-4" /> Modifica
                                </Button>
                               <Button className="w-full sm:col-span-1" onClick={() => handleApprovalProcess(detailShift)}>
                                  <CheckCircle className="mr-2 h-4 w-4"/> Approva
                               </Button>
                            </>
                        ) : (
                             <>
                                <Button variant="destructive" className="w-full sm:col-span-1" onClick={() => { setShiftToDelete(detailShift); setIsConfirmingDelete(true); }}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Elimina
                                </Button>
                                <Button className="w-full sm:col-span-1" variant="outline" onClick={() => handleOpenEditDialog(detailShift!)}>
                                    <Pencil className="mr-2 h-4 w-4" /> Modifica
                                </Button>
                                <ResponsiveDialogClose asChild>
                                    <Button className="w-full sm:col-span-1" variant="outline">Chiudi</Button>
                                </ResponsiveDialogClose>
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
                                    <TableHead>Posizione</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detailOvertimeShift?.events.map((e, i) => {
                                      const adjustedTimes = getAdjustedOvertimeTimes(detailOvertimeShift);
                                      const isEntrata = e.type === 'entrata';
                                      const isUscita = e.type === 'uscita';
                                      const displayTime = isEntrata ? adjustedTimes.start : (isUscita ? adjustedTimes.end : formatTime(e.timestamp));
                                    return (
                                    <TableRow key={i}>
                                        <TableCell><span className='italic'>{displayTime}</span></TableCell>
                                        <TableCell className="capitalize">{e.type.replace('_', ' ')}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                           {e.latitude && e.longitude ? (
                                                <a href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                                    <MapPin className="h-4 w-4"/> Mappa
                                                </a>
                                            ) : (
                                                <span>N/D</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )})}
                            </TableBody>
                        </Table>
                    </div>
                     <ResponsiveDialogFooter className="grid grid-cols-2 gap-2 mt-4 sm:flex">
                        <Button className="w-full" variant="outline" onClick={() => setIsDetailOvertimeOpen(false)}>Chiudi</Button>
                         {detailOvertimeShift && detailOvertimeShift.status === 'in_attesa_di_approvazione' && (
                            <>
                               <Button variant="destructive" className="w-full" onClick={() => handleOvertimeShiftAction(detailOvertimeShift, 'reject')}>
                                  <XCircle className="mr-2 h-4 w-4"/> Rifiuta
                               </Button>
                               <Button className="w-full" onClick={() => handleOvertimeShiftApprovalProcess(detailOvertimeShift)}>
                                  <CheckCircle className="mr-2 h-4 w-4"/> Approva
                               </Button>
                            </>
                         )}
                         {detailOvertimeShift && (
                            <>
                                <Button variant="destructive" className="w-full" onClick={() => { setOvertimeShiftToDelete(detailOvertimeShift); setIsConfirmingOvertimeDelete(true); }}><Trash2 className="mr-2 h-4 w-4"/> Elimina</Button>
                                <Button variant="outline" className="w-full" onClick={() => handleOpenEditOvertimeDialog(detailOvertimeShift)}><Pencil className="mr-2 h-4 w-4"/> Modifica</Button>
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
                                <Input id="edit-uscita" type="time" value={editShiftTimes.uscita} onChange={e => setEditShiftTimes(p => ({...p, uscita: e.target.value}))} required={isEditOvertimeOpen} />
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
                        {isEditShiftOpen && (
                             <div className="flex items-center space-x-2">
                                <Checkbox id="edit-ignore-contractual" checked={editIgnoreContractual} onCheckedChange={(checked) => setEditIgnoreContractual(!!checked)} />
                                <Label htmlFor="edit-ignore-contractual" className="text-sm font-normal">
                                    Ignora orario di inizio contrattuale
                                </Label>
                            </div>
                        )}
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
                            {!approvalContext.isOvertimeShift && (
                                <div>
                                    <Label htmlFor="ordinary-hours">Ore Ordinarie Lavorate</Label>
                                    <Input id="ordinary-hours" type="number" value={approvalContext.ordinaryHours} onChange={(e) => setApprovalContext(p => p ? {...p, ordinaryHours: e.target.value} : null)} step="0.5" min="0" />
                                    <p className="text-xs text-muted-foreground mt-1">Le ore di lavoro che rientrano nel contratto.</p>
                                </div>
                            )}
                            <div>
                                <Label htmlFor="overtime-hours">Ore di Straordinario</Label>
                                <Input id="overtime-hours" type="number" value={approvalContext.overtimeHours} onChange={(e) => setApprovalContext(p => p ? {...p, overtimeHours: e.target.value} : null)} step="0.5" min="0" />
                                <p className="text-xs text-muted-foreground mt-1">Le ore che superano il monte ore giornaliero.</p>
                            </div>
                            {!approvalContext.isOvertimeShift && (
                                <div>
                                    <Label htmlFor="leave-hours">Ore di Permesso (Ammanco Ore)</Label>
                                    <Input id="leave-hours" type="number" value={approvalContext.leaveHours} onChange={(e) => setApprovalContext(p => p ? {...p, leaveHours: e.target.value} : null)} step="0.5" min="0" />
                                    <p className="text-xs text-muted-foreground mt-1">Le ore mancanti rispetto al monte ore giornaliero.</p>
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
                        <AlertDialogAction onClick={handleApprovalClick}>Approva e Registra</AlertDialogAction>
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

             <AlertDialog open={isConfirmingNoLeave} onOpenChange={setIsConfirmingNoLeave}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Conferma Approvazione</AlertDialogTitle>
                        <AlertDialogDescription>Ci sono ore di ammanco per questo turno. Sei sicuro di voler approvare senza creare una richiesta di permesso?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmApprove}>Conferma</AlertDialogAction>
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
                        <Button onClick={handleAddBreakAndReload}>Aggiungi Pausa</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

             <AlertDialog open={isOvertimeMissingBreakConfirmOpen} onOpenChange={setIsOvertimeMissingBreakConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Pausa Mancante (Straordinario)</AlertDialogTitle>
                        <AlertDialogDescription>Nessuna pausa registrata per questo turno straordinario. Vuoi aggiungerla manualmente?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={handleApproveOvertimeWithoutBreak}>No, approva senza</Button>
                        <Button onClick={handleAddOvertimeBreak}>Sì, aggiungi</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

             <ResponsiveDialog open={isOvertimeAddBreakDialogOpen} onOpenChange={setIsOvertimeAddBreakDialogOpen}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Aggiungi Pausa Manuale (Straordinario)</ResponsiveDialogTitle>
                        <ResponsiveDialogDescription>Inserisci gli orari di inizio e fine della pausa.</ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="overtime-break-start">Inizio Pausa</Label>
                            <Input id="overtime-break-start" type="time" value={breakTimes.start} onChange={e => setBreakTimes(p => ({...p, start: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="overtime-break-end">Fine Pausa</Label>
                            <Input id="overtime-break-end" type="time" value={breakTimes.end} onChange={e => setBreakTimes(p => ({...p, end: e.target.value}))} />
                        </div>
                    </div>
                    <ResponsiveDialogFooter>
                        <Button variant="outline" onClick={() => setIsOvertimeAddBreakDialogOpen(false)}>Annulla</Button>
                        <Button onClick={handleConfirmAddOvertimeBreak}>Aggiungi e Approva</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>


            <AlertDialog open={isDeleteTimbraturaDialogOpen} onOpenChange={setIsDeleteTimbraturaDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Eliminare questa timbratura?</AlertDialogTitle><AlertDialogDescription>L'azione è permanente e non può essere annullata.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => setDeletingTimbratura(null)}>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDeleteTimbratura}>Elimina</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <ResponsiveDialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Guida alla Gestione Turni</ResponsiveDialogTitle>
                        <ResponsiveDialogDescription>
                            Come approvare, modificare e calcolare i turni degli operatori.
                        </ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                    <div className="py-4 space-y-4 text-sm">
                        <div>
                            <h4 className="font-semibold mb-1">Approvazione Turni</h4>
                            <p className="text-muted-foreground">
                                I turni in stato "sospeso" richiedono la tua attenzione. Puoi approvarli o rifiutarli. L'approvazione converte le timbrature in ore lavorate (ordinarie e straordinarie) e crea richieste di permesso se necessario.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Gestione Pause</h4>
                            <p className="text-muted-foreground">
                               Se per un turno è prevista una pausa obbligatoria ma non è stata registrata, il sistema ti chiederà se vuoi aggiungerla manually prima di approvare.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Calcolo Ore</h4>
                            <p className="text-muted-foreground">
                                Il sistema arrotonda gli orari per calcolare le ore: le ore ordinarie scattano ogni mezz'ora e gli straordinari ogni ora intera. Nel dettaglio del turno, puoi vedere gli orari di riferimento usati per il calcolo tra parentesi.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Modifica e Aggiunta Manuale</h4>
                             <p className="text-muted-foreground">
                                Puoi modificare qualsiasi timbratura di un turno o aggiungere un intero turno manualmente in caso di dimenticanze o errori da parte dell'operatore.
                            </p>
                        </div>
                    </div>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

        </div>
    );
};
