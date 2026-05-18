

'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch, addDoc, serverTimestamp, getDocs, setDoc } from 'firebase/firestore';
import { Loader2, User, CheckCircle, XCircle, MapPin, Trash2, Eye, Pencil, AlertCircle, Circle, Clock, Briefcase, Plus, PlusCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Unlock, Coffee, MinusCircle, Info, FileText, Wand2, Download, Printer, RefreshCw, Archive, Share2, Wallet, Plane, UserCheck, Stethoscope, AlertTriangle, Euro } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter, ResponsiveDialogClose } from '@/components/ui/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent as NoteDialogContent, DialogHeader as NoteDialogHeader, DialogTitle as NoteDialogTitle, DialogDescription as NoteDialogDescription, DialogFooter as NoteDialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, set, getDay as getDayFns, isSameDay, addDays, subDays, startOfDay, endOfDay, parse, addMonths, subMonths, startOfMonth, endOfMonth, isSunday } from 'date-fns';
import { it } from 'date-fns/locale';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { isPublicHoliday } from '@/lib/holidays';
import { roundOrdinaryHours, roundOvertimeHours, calculateShiftDetails, calculateHours, calculatePureOvertime, processMonthlyData, type DailyDetail, type MonthlySummary } from '@/lib/calculations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateDetailedOperatorPdf } from '@/lib/pdf-utility';
import { Switch } from '@/components/ui/switch';
import { FirestorePermissionError, errorEmitter } from '@/firebase';


type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekDayLabels: Record<DayOfWeek, string> = { monday: 'Lunedì', tuesday: 'Martedì', wednesday: 'Mercoledì', thursday: 'Giovedì', friday: 'Venerdì', saturday: 'Sabato', sunday: 'Domenica' };

type DailyNote = {
    note: string;
    date: string;
}

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
    entryTolerance?: number;
    ordinaryHalfHourTrigger?: number;
    ordinaryHourTrigger?: number;
    scheduleType?: 'daily' | 'monthly';
    monthlyContractualHours?: number;
    overtimeHalfHourTrigger?: number;
    overtimeHourTrigger?: number;
};

type Timbratura = {
    id: string;
    userId: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    latitude?: number;
    longitude?: number;
    isOvertime?: boolean;
    isAuto?: boolean;
    shiftId?: string;
    ignoreContractualStart?: boolean;
    makeupOfDay?: string; // ISO date string 'YYYY-MM-DD'
    approvedOrdinaryHours?: number;
    approvedOvertimeHours?: number;
    approvedLeaveHours?: number;
    createLeaveRequest?: boolean;
    viewedByOperator: boolean;
    suggestedTime?: string;
    originalTime?: string | null;
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
    makeupOfDay?: string; // ISO date string 'YYYY-MM-DD'
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
    approvedHours?: number;
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
    ignoreContractualStart: boolean;
    makeupOfDay: string; // New field for makeup day
} | null;

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    associatedShiftId?: string;
    dailyCosts?: { [date: string]: number };
};

type AddRequestContext = {
    date: Date;
    type: 'ferie' | 'permesso' | 'malattia';
    hours?: string;
    reason?: string;
} | null;

const ITEMS_PER_PAGE = 5;

const SummaryCard = ({ title, value, icon: Icon, subtext, className, actionButton }: { title: string, value: string | number, icon: React.ElementType, subtext?: string, className?: string, actionButton?: React.ReactNode }) => (
    <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <div className='flex items-center gap-1'>
                 {actionButton}
                <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
        </CardContent>
    </Card>
);

const InfoBox = ({ label, value }: { label: string, value: string }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
    </div>
);

export default function ShiftApprovalPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const params = useParams();
    const router = useRouter();
    const operatorId = params.operatorId as string;
    
    const [operator, setOperator] = useState<Operator | null>(null);
    const [allShifts, setAllShifts] = useState<Shift[]>([]);
    const [overtimeShifts, setOvertimeShifts] = useState<StraordinarioShift[]>([]);
    const [approvedRequests, setApprovedRequests] = useState<Request[]>([]);
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
    const [editMakeupDay, setEditMakeupDay] = useState('');
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
    const [isMultiSelect, setIsMultiSelect] = useState(false);
    const [multipleShiftDates, setMultipleShiftDates] = useState<Date[]>([]);
    const [newShiftTimes, setNewShiftTimes] = useState({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
    const [newShiftIgnoreContractual, setNewShiftIgnoreContractual] = useState(false);
    const [newShiftIsMakeup, setNewShiftIsMakeup] = useState(false);
    const [newShiftMakeupDay, setNewShiftMakeupDay] = useState('');
    const [currentPage, setCurrentPage] = useState(0);
    const [overtimeShiftForBreak, setOvertimeShiftForBreak] = useState<StraordinarioShift | null>(null);
    const [isOvertimeMissingBreakConfirmOpen, setIsOvertimeMissingBreakConfirmOpen] = useState(false);
    const [isOvertimeAddBreakDialogOpen, setIsOvertimeAddBreakDialogOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isConfirmingNoLeave, setIsConfirmingNoLeave] = useState(false);
    const [orphanedEvents, setOrphanedEvents] = useState<Timbratura[]>([]);
    const [eventToDelete, setEventToDelete] = useState<Timbratura | null>(null);
    const [isProcessingApprove, setIsProcessingApprove] = useState(false);

    // Monthly Data States (from end-of-month)
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [isCleaning, setIsCleaning] = useState(false);
    const [isCleanConfirmOpen, setIsCleanConfirmOpen] = useState(false);
    const [addRequestContext, setAddRequestContext] = useState<AddRequestContext>(null);
    const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);


    const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);
    const [editingNote, setEditingNote] = useState<{ date: Date; currentNote: string } | null>(null);
    const [noteContent, setNoteContent] = useState('');


    const contractualStartTime = useMemo(() => {
        if (!newShiftDate || !operator?.workSchedule) return null;
        const dayName = dayIndexToName[getDayFns(newShiftDate)];
        return operator.workSchedule[dayName]?.startTime || null;
    }, [newShiftDate, operator]);
    
    const getShiftDurations = (events: (Timbratura | StraordinarioEvent)[]): { workDuration: number, breakDuration: number, workedMinutes: number } => {
        if (!Array.isArray(events) || events.length < 2) {
            return { workDuration: 0, breakDuration: 0, workedMinutes: 0 };
        }

        const clockInEvent = events.find(e => e.type === 'entrata');
        const clockOutEvent = events.find(e => e.type === 'uscita');

        if (!clockInEvent || !clockOutEvent) {
             return { workDuration: 0, breakDuration: 0, workedMinutes: 0 };
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
        
        const workedMillis = totalMillis - breakDurationMillis;

        const workDuration = totalMillis > 0 ? Math.round(totalMillis / (1000 * 60)) : 0;
        const breakDuration = breakDurationMillis > 0 ? breakDurationMillis / (1000 * 60) : 0;
        const workedMinutes = workedMillis > 0 ? Math.round(workedMillis / (1000*60)) : 0;

        return { workDuration, breakDuration, workedMinutes };
    };

    const processShift = (events: Timbratura[], leaveDays: Set<string>): Omit<Shift, 'id'> | null => {
        const startTime = events.find(e => e.type === 'entrata')?.timestamp;
        
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
        const makeupOfDay = clockInEvent?.makeupOfDay;

        return { date: startTime.toDate(), events, status, workDuration, breakDuration, isOnLeaveDay, isOvertime, ignoreContractualStart, makeupOfDay };
    };

     useEffect(() => {
        if (!firestore || !operatorId) {
             router.push('/dashboard');
             return;
        }
        const operatorDocRef = doc(firestore, 'app-users', operatorId);
        getDoc(operatorDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            } else {
                toast({title: 'Errore', description: 'Operatore non trovato.', variant: 'destructive'});
                router.push('/dashboard');
            }
        });
    }, [firestore, operatorId, router, toast]);

    useEffect(() => {
        if (!firestore || !operatorId || !operator) return;
        
        const allClockingsQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`));
        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`));
        const overtimeQuery = query(collection(firestore, `app-users/${operatorId}/straordinari`), orderBy('date', 'desc'));
        const notesQuery = query(collection(firestore, `app-users/${operatorId}/daily-notes`));
        
        const unsubNotes = onSnapshot(notesQuery, (snapshot) => {
            const notesData = snapshot.docs.map(d => ({ date: d.id, ...d.data() } as DailyNote));
            setDailyNotes(notesData);
        });

        const unsubClockings = onSnapshot(allClockingsQuery, async (clockingSnapshot) => {
            const allClockingsFromDb: Timbratura[] = [];
            clockingSnapshot.forEach(doc => {
                allClockingsFromDb.push({ id: doc.id, ...doc.data() } as Timbratura);
            });
            
            const allClockings: Timbratura[] = allClockingsFromDb.filter(event => 
                event.timestamp && typeof event.timestamp.toDate === 'function'
            );
            
            allClockings.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            const requestSnapshot = await getDocs(requestsQuery);
            const leaveDays = new Set<string>();
            
            setApprovedRequests(requestSnapshot.docs.map(d => ({ ...d.data() as Request, id: d.id })));

            requestSnapshot.forEach(doc => {
                const req = doc.data();
                if ((req.type === 'ferie' || req.type === 'malattia') && req.status === 'approvato') {
                    for(let d = req.startDate.toDate(); d <= req.endDate.toDate(); d.setDate(d.getDate() + 1)) {
                        leaveDays.add(format(d, 'yyyy-MM-dd'));
                    }
                }
            });

            // 1. Separate modern (with shiftId) and legacy (without shiftId) events
            const modernEvents = allClockings.filter(e => e.shiftId);
            const legacyEvents = allClockings.filter(e => !e.shiftId);

            // 2. Process modern events
            const shiftsById: { [id: string]: Timbratura[] } = {};
            for (const event of modernEvents) {
                if (event.shiftId) {
                    if (!shiftsById[event.shiftId]) {
                        shiftsById[event.shiftId] = [];
                    }
                    shiftsById[event.shiftId].push(event);
                }
            }
            const modernShifts: Shift[] = [];
            for (const shiftId in shiftsById) {
                const dayEvents = shiftsById[shiftId];
                const processed = processShift(dayEvents, leaveDays);
                if (processed) {
                    modernShifts.push({ id: shiftId, ...processed });
                }
            }

            // 3. Process legacy events
            const legacyShiftsByDay: { [date: string]: Timbratura[] } = {};
            for (const event of legacyEvents) {
                const dayString = format(event.timestamp.toDate(), 'yyyy-MM-dd');
                if (!legacyShiftsByDay[dayString]) {
                    legacyShiftsByDay[dayString] = [];
                }
                legacyShiftsByDay[dayString].push(event);
            }
            const legacyShifts: Shift[] = [];
            for (const dayString in legacyShiftsByDay) {
                const dayEvents = legacyShiftsByDay[dayString];
                const processed = processShift(dayEvents, leaveDays);
                if (processed) {
                    const syntheticId = `legacy-${dayString}`;
                    legacyShifts.push({ id: syntheticId, ...processed });
                }
            }

            // 4. Combine and sort
            const combinedShifts = [...modernShifts, ...legacyShifts];
            combinedShifts.sort((a,b) => {
                const dateA = a.events[0]?.timestamp.toMillis() || 0;
                const dateB = b.events[0]?.timestamp.toMillis() || 0;
                return dateB - dateA;
            });
            
            setAllShifts(combinedShifts);
            setIsLoading(false);

            // 5. Update orphan detection
            const allProcessedEventIds = new Set<string>();
            combinedShifts.forEach(shift => {
                shift.events.forEach(event => allProcessedEventIds.add(event.id));
            });

            const logicalOrphans = allClockings.filter(
                e => e.status === 'sospesa' && !allProcessedEventIds.has(e.id)
            );

            const malformedOrphans = allClockingsFromDb.filter(
                event => !event.timestamp || typeof event.timestamp.toDate !== 'function'
            );

            const allOrphans = [...malformedOrphans];
            logicalOrphans.forEach(lo => {
                if (!allOrphans.some(mo => mo.id === lo.id)) {
                    allOrphans.push(lo);
                }
            });

            setOrphanedEvents(allOrphans);

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
            unsubNotes();
        }
    }, [firestore, operatorId, toast, operator]);

    const { pendingShifts } = useMemo(() => {
        const pending = allShifts.filter(s => s.status === 'in_sospeso' || s.status === 'in_corso');
        return { pendingShifts: pending };
    }, [allShifts]);

    const { pendingOvertimeShifts } = useMemo(() => {
        const pending = overtimeShifts.filter(s => s.status === 'in_attesa_di_approvazione' || s.status === 'in_corso');
        return { pendingOvertimeShifts: pending };
    }, [overtimeShifts]);
    
    const orphanedEventsByDay = useMemo(() => {
        return orphanedEvents.reduce((acc, event) => {
            if (!event.timestamp) return acc;
            const day = startOfDay(event.timestamp.toDate()).toISOString();
            if (!acc[day]) {
                acc[day] = [];
            }
            if (!acc[day].some(e => e.id === event.id)) {
                acc[day].push(event);
            }
            return acc;
        }, {} as Record<string, Timbratura[]>);
    }, [orphanedEvents]);


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

    const monthlyDataForProcess = useMemo(() => {
        // We need to format the data as expected by processMonthlyData
        return {
            timbrature: allShifts.flatMap(s => s.events),
            requests: approvedRequests as Request[],
            dailyNotes: dailyNotes,
            straordinari: overtimeShifts
        };
    }, [allShifts, approvedRequests, dailyNotes, overtimeShifts]);

    const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator || isLoading || !currentMonth) {
            return { 
                monthlySummary: {
                    ordinaryWorkedDays: 0,
                    ordinaryHours: 0,
                    overtimeHours: 0,
                    ferieCost: 0,
                    permessoCost: 0,
                    absenceDays: 0,
                    malattiaCost: 0,
                    ferieDays: 0,
                    ferieHours: 0,
                    permessoHours: 0,
                    malattiaDays: 0,
                    festiveHours: 0,
                    estimatedTotalCost: 0,
                    expectedMonthlyHours: 0
                } as MonthlySummary, 
                dailyDetails: [] as DailyDetail[] 
            };
        }
        return processMonthlyData(currentMonth, operator, monthlyDataForProcess);
    }, [operator, currentMonth, monthlyDataForProcess, isLoading]);

    if (isLoading || !operator) return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    
    const handleConfirmApprove = () => {
        if (!approvalContext) return;
        
        // Close the confirmation dialog
        setIsConfirmingNoLeave(false);
        
        // Update the approval context: set leave hours to 0 and disable leave request
        // This allows the user to see the change in the summary dialog and click "Approva" again
        setApprovalContext(prev => prev ? ({
            ...prev,
            leaveHours: '0',
            createLeaveRequest: false
        }) : null);
    };

    const handleApprovalClick = async (context: ApprovalContext) => {
        if (!context || isProcessingApprove) return;
        setIsProcessingApprove(true);
        try {
            const { leaveHours, createLeaveRequest, isOvertimeShift } = context;
        
            if (isOvertimeShift) {
                 await handleOvertimeShiftAction(context.shift as StraordinarioShift, 'approve');
                 return;
            } else {
                const hasLeaveHours = parseFloat(leaveHours || '0') > 0;
                if (hasLeaveHours && !createLeaveRequest) {
                     setApprovalContext(context);
                     setIsConfirmingNoLeave(true); // Ask for confirmation
                     return;
                }
            }
            
            await handleRegularShiftApproval(context);
        } finally {
            setIsProcessingApprove(false);
        }
    };
    
const handleRegularShiftApproval = async (currentContext: ApprovalContext) => {
    if (!currentContext || currentContext.isOvertimeShift || !firestore || !operator) return;

    const { shift, ordinaryHours, overtimeHours, leaveHours, createLeaveRequest, manualBreak, ignoreContractualStart, makeupOfDay } = currentContext;
    const regularShift = shift as Shift;
    const approvedOrdinary = parseFloat(ordinaryHours) || 0;
    const approvedOvertime = parseFloat(overtimeHours) || 0;
    const approvedLeave = (createLeaveRequest && leaveHours) ? (parseFloat(leaveHours) || 0) : 0;

    const stableShiftId = regularShift.id;
    
    if (!stableShiftId) {
        toast({ title: 'Errore Critico', description: 'Impossibile trovare un ID stabile per il turno.', variant: 'destructive' });
        return;
    }

    const requestsRef = collection(firestore, `app-users/${operator.id}/requests`);
    const q = query(requestsRef, where('associatedShiftId', '==', stableShiftId));
    const existingRequestsSnap = await getDocs(q);

    const batch = writeBatch(firestore);
    const timbratureRef = collection(firestore, `app-users/${operator.id}/timbrature`);

    existingRequestsSnap.forEach(doc => {
        batch.delete(doc.ref);
    });
    
    const clockInEvent = regularShift.events.find(e => e.type === 'entrata');
    if (clockInEvent) {
        const clockInRef = doc(timbratureRef, clockInEvent.id);
        batch.update(clockInRef, { 
            approvedOrdinaryHours: approvedOrdinary, 
            approvedOvertimeHours: approvedOvertime 
        });
    }

    regularShift.events.forEach(event => {
        const docRef = doc(timbratureRef, event.id);
        const updateData: any = {
            status: 'confermata',
            viewedByOperator: false,
            shiftId: stableShiftId 
        };
        if (event.type === 'entrata') {
            updateData.ignoreContractualStart = ignoreContractualStart;
            if (makeupOfDay) {
                updateData.makeupOfDay = makeupOfDay;
            } else {
                // Ensure field is removed if empty
                updateData.makeupOfDay = null;
            }
        }
        batch.update(docRef, updateData);
    });
    
    if (manualBreak && manualBreak.start && manualBreak.end) {
        const shiftDate = regularShift.events[0].timestamp.toDate();

        const createTimestamp = (time: string): Timestamp => {
            const [hours, minutes] = time.split(':').map(Number);
            return Timestamp.fromDate(set(shiftDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
        };

        const breakStartRef = doc(timbratureRef);
        batch.set(breakStartRef, {
            userId: operator.id, type: 'pausa', timestamp: createTimestamp(manualBreak.start),
            status: 'confermata', viewedByOperator: false, shiftId: stableShiftId, isAuto: true
        });
        const breakEndRef = doc(timbratureRef);
        batch.set(breakEndRef, {
            userId: operator.id, type: 'fine_pausa', timestamp: createTimestamp(manualBreak.end),
            status: 'confermata', viewedByOperator: false, shiftId: stableShiftId, isAuto: true
        });
    }

    if (approvedLeave > 0) {
        const leaveRequest = {
            userId: operator.id,
            type: 'permesso' as const,
            status: 'approvato' as const,
            startDate: Timestamp.fromDate(regularShift.date),
            endDate: Timestamp.fromDate(regularShift.date),
            hours: approvedLeave,
            reason: 'Permesso generato da ammanco ore',
            createdAt: serverTimestamp(),
            viewedByOperator: false,
            associatedShiftId: stableShiftId,
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

    const handleApproveRectification = async (event: Timbratura, currentShift: Shift | null) => {
        if (!firestore || !operator || !event.suggestedTime || !currentShift) return;

        try {
            const [hours, minutes] = event.suggestedTime.split(':').map(Number);
            const eventDate = event.timestamp.toDate();
            const newDate = set(eventDate, { hours, minutes, seconds: 0, milliseconds: 0 });
            
            const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
            await updateDoc(docRef, {
                timestamp: Timestamp.fromDate(newDate),
                status: 'confermata',
                suggestedTime: null,
                originalTime: null,
                viewedByOperator: false
            });

            toast({ title: 'Successo', description: 'Rettifica applicata con successo!' });
            
            if (detailShift) {
                const updatedEvents = detailShift.events.map(e => 
                    e.id === event.id 
                        ? { ...e, timestamp: Timestamp.fromDate(newDate), status: 'confermata' as const, suggestedTime: undefined, originalTime: undefined } as Timbratura
                        : e
                );
                const processed = processShift(updatedEvents, new Set());
                if (processed) {
                    setDetailShift({ ...detailShift, ...processed, events: updatedEvents });
                }
            }
        } catch (error) {
            console.error("Error approving rectification:", error);
            toast({ title: 'Errore', description: 'Impossibile applicare la rettifica.', variant: 'destructive' });
        }
    };

    const handleRejectRectification = async (event: Timbratura, currentShift: Shift | null) => {
        if (!firestore || !operator || !currentShift) return;

        try {
            const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
            
            if (event.originalTime) {
                await updateDoc(docRef, {
                    status: 'confermata',
                    suggestedTime: null,
                    originalTime: null,
                    viewedByOperator: false
                });
                
                toast({ title: 'Successo', description: 'Richiesta di rettifica rifiutata. Ripristinato orario originale.' });
                
                if (detailShift) {
                    const updatedEvents = detailShift.events.map(e => 
                        e.id === event.id 
                            ? { ...e, status: 'confermata' as const, suggestedTime: undefined, originalTime: undefined } as Timbratura
                            : e
                    );
                    const processed = processShift(updatedEvents, new Set());
                    if (processed) {
                        setDetailShift({ ...detailShift, ...processed, events: updatedEvents });
                    }
                }
            } else {
                await deleteDoc(docRef);
                
                toast({ title: 'Successo', description: 'Richiesta di rettifica rifiutata e rimossa.' });
                
                if (detailShift) {
                    const updatedEvents = detailShift.events.filter(e => e.id !== event.id);
                    const processed = processShift(updatedEvents, new Set());
                    if (processed) {
                        setDetailShift({ ...detailShift, ...processed, events: updatedEvents });
                    } else {
                        setIsDetailOpen(false);
                    }
                }
            }
        } catch (error) {
            console.error("Error rejecting rectification:", error);
            toast({ title: 'Errore', description: 'Impossibile rifiutare la rettifica.', variant: 'destructive' });
        }
    };
    
     const handleRejectShift = async (shiftToReject: Shift | null) => {
        if (!firestore || !operator || !shiftToReject) return;
        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operator.id}/timbrature`);

        shiftToReject.events.forEach(event => {
             if (event.status === 'sospesa') {
                const docRef = doc(timbratureCollectionRef, event.id);
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
        setEditMakeupDay(shift.makeupOfDay || '');
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
        
        const shiftId = editingShift.id;
    
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
        
        let newEventsForState: Timbratura[] = [...editingShift.events];
    
        const makeupDayValue = editMakeupDay || null;

        for (const type of ['entrata', 'uscita', 'pausa', 'fine_pausa'] as const) {
            const existingEventsOfType = editingShift.events.filter(e => e.type === type);
            const existingEvent = existingEventsOfType.length > 0 ? existingEventsOfType[0] : undefined;
            const extraEventsToDelete = existingEventsOfType.slice(1);
            
            const newEventDetails = newEventData[type];
    
            const updatePayload: any = { 
                viewedByOperator: false, 
                shiftId: shiftId,
                status: 'sospesa',
                makeupOfDay: makeupDayValue,
                isAuto: false,
                suggestedTime: null
            };
            if(type === 'entrata') {
                updatePayload.ignoreContractualStart = editIgnoreContractual;
            }

            if (newEventDetails && existingEvent) { 
                updatePayload.timestamp = newEventDetails.timestamp;
                const docRef = doc(timbratureCollectionRef, existingEvent.id);
                batch.update(docRef, updatePayload);
                newEventsForState = newEventsForState.map(e => e.id === existingEvent.id ? { ...e, ...updatePayload, timestamp: newEventDetails.timestamp } : e);
    
            } else if (newEventDetails && !existingEvent) { 
                 const newDocRef = doc(timbratureCollectionRef);
                 const newEventPayload: Omit<Timbratura, 'id'> = {
                    userId: operator.id,
                    type: type,
                    timestamp: newEventDetails.timestamp,
                    ...updatePayload,
                    isOvertime: editingShift.isOvertime,
                    isAuto: true,
                };
                batch.set(newDocRef, newEventPayload);
                newEventsForState.push({ ...newEventPayload, id: newDocRef.id });
    
            } else if (!newEventDetails && existingEvent) { 
                const docRef = doc(timbratureCollectionRef, existingEvent.id);
                batch.delete(docRef);
                newEventsForState = newEventsForState.filter(e => e.id !== existingEvent.id);
            }

            // Automatically delete any duplicate events of the same type
            extraEventsToDelete.forEach(extra => {
                const docRef = doc(timbratureCollectionRef, extra.id);
                batch.delete(docRef);
                newEventsForState = newEventsForState.filter(e => e.id !== extra.id);
            });
        }
        
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno aggiornato con successo. Il turno è ora in attesa di approvazione.' });
            setIsEditShiftOpen(false);
            setEditingShift(null);
            
            if (detailShift) {
                const newProcessedShift = processShift(newEventsForState, new Set());
                if (newProcessedShift) {
                  setDetailShift(prev => prev ? ({ ...prev, ...newProcessedShift, events: newEventsForState, status: 'in_sospeso' }) : null);
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

    const handleOpenDetailDialog = async (item: CombinedShiftHistoryItem) => {
        if (!firestore || !operatorId) return;
        if (item.type === 'regular') {
            const shift = item as Shift;
            const shiftId = shift.id;
            const shiftDate = shift.events[0]?.timestamp.toDate();
            if (!shiftDate) {
                 setDetailShift(shift);
                 setIsDetailOpen(true);
                 return;
            }
    
            const timbratureQuery = query(
                collection(firestore, `app-users/${operatorId}/timbrature`),
                where('shiftId', '==', shiftId)
            );
    
            try {
                const dayEventsSnapshot = await getDocs(timbratureQuery);
                const shiftEvents = dayEventsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));
               
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
            setDetailOvertimeShift(item as StraordinarioShift);
            setIsDetailOvertimeOpen(true);
        }
    };
    
    const getContractualHoursForShift = (shift: Shift | null): number => {
        if (!shift || !operator?.workSchedule) return 0;
        
        const clockInEvent = shift.events.find(e => e.type === 'entrata');
        if(!clockInEvent) return 0;

        const makeupDayString = clockInEvent.makeupOfDay;
        const shiftDate = clockInEvent.timestamp.toDate();
        const dayToUseDate = makeupDayString ? parse(makeupDayString, 'yyyy-MM-dd', new Date()) : shiftDate;
        const dayToUse = dayIndexToName[getDayFns(dayToUseDate)];

        return operator.workSchedule[dayToUse]?.totalHours || 0;
    };
    
    
    const handleApprovalProcess = (shift: Shift) => {
        if (!operator || !shift.events[0]) return;

        const hasBreak = shift.events.some(e => e.type === 'pausa');
        
        const clockInEvent = shift.events.find(e => e.type === 'entrata');
        const dayToUseDate = clockInEvent?.makeupOfDay ? parse(clockInEvent.makeupOfDay, 'yyyy-MM-dd', new Date()) : shift.date;
        const dayToUse = dayIndexToName[getDayFns(dayToUseDate)];
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
            handleOpenApproveDialog(shift, false, undefined, shift.ignoreContractualStart || false);
        }
    };
    
    const handleApproveWithoutBreak = () => {
        if (shiftForBreak) {
            handleOpenApproveDialog(shiftForBreak, false, undefined, shiftForBreak.ignoreContractualStart || false);
        }
        setIsMissingBreakConfirmOpen(false);
        setShiftForBreak(null);
    };

    const handleOpenAddBreakDialog = () => {
        if (shiftForBreak) {
            setBreakTimes({ start: '', end: '' });
            setIsAddBreakDialogOpen(true);
            setIsMissingBreakConfirmOpen(false);
        }
    };

    const handleAddBreakAndReload = async () => {
        if (!shiftForBreak || !firestore || !operator || !breakTimes.start || !breakTimes.end || isProcessingApprove) return;
        setIsProcessingApprove(true);
    
        const batch = writeBatch(firestore);
        const timbratureRef = collection(firestore, `app-users/${operator.id}/timbrature`);
        
        const shiftId = shiftForBreak.id;

        if (!shiftId) {
            toast({ title: 'Errore', description: 'Impossibile associare la pausa al turno. ID del turno non trovato.', variant: 'destructive' });
            return;
        }

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
            setIsProcessingApprove(false);
        }
    };


    const handleOpenApproveDialog = (shift: Shift | StraordinarioShift, isOvertimeShift: boolean, manualBreak?: ManualBreak, ignoreContractualStart: boolean = false) => {
        if (!operator) return;
    
        let ordinary = 0, overtime = 0, leave = 0;
        let makeupOfDay = '';
    
        if (isOvertimeShift) {
            const overtimeShift = shift as StraordinarioShift;
            overtime = calculatePureOvertime(overtimeShift, operator, manualBreak);
        } else {
            const regularShift = shift as Shift;
            makeupOfDay = regularShift.makeupOfDay || '';
            const clockInEvent = regularShift.events.find(e => e.type === 'entrata');
            const dayToUseDate = clockInEvent?.makeupOfDay ? parse(clockInEvent.makeupOfDay, 'yyyy-MM-dd', new Date()) : regularShift.date;
            const dayToUse = dayIndexToName[getDayFns(dayToUseDate)];
            const schedule = operator.workSchedule[dayToUse];
            
            let eventsForCalc = regularShift.events;
            if (manualBreak) {
                 const createTimestamp = (time: string): Timestamp => {
                    const [h,m] = time.split(':').map(Number);
                    return Timestamp.fromDate(set(regularShift.date, { hours: h, minutes: m }));
                 }
                 eventsForCalc.push({ type: 'pausa', timestamp: createTimestamp(manualBreak.start) } as Timbratura, { type: 'fine_pausa', timestamp: createTimestamp(manualBreak.end)} as Timbratura);
            }

            const hoursResult = calculateHours(regularShift, schedule, ignoreContractualStart, operator);
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
            isOvertimeShift: isOvertimeShift,
            ignoreContractualStart: ignoreContractualStart,
            makeupOfDay: makeupOfDay,
        });
        setIsApproveDialogOpen(true);
    };

    const handleApprovalContextChange = (field: keyof NonNullable<ApprovalContext>, value: any) => {
        setApprovalContext(prev => {
            if (!prev) return null;
            const newContext = { ...prev, [field]: value };
            
            if (field === 'ignoreContractualStart' || field === 'makeupOfDay') {
                 if (!newContext.isOvertimeShift) {
                    const regularShift = newContext.shift as Shift;
                    
                    const makeupDayString = field === 'makeupOfDay' ? value : newContext.makeupOfDay;
                    const ignoreStart = field === 'ignoreContractualStart' ? value : newContext.ignoreContractualStart;

                    const dayToUseDate = makeupDayString ? parse(makeupDayString, 'yyyy-MM-dd', new Date()) : regularShift.date;
                    const dayToUse = dayIndexToName[getDayFns(dayToUseDate)];
                    const schedule = operator!.workSchedule[dayToUse];
                    
                    const hoursResult = calculateHours(regularShift, schedule, ignoreStart, operator!);

                    newContext.ordinaryHours = String(hoursResult.ordinary);
                    newContext.overtimeHours = String(hoursResult.overtime);
                    newContext.leaveHours = String(hoursResult.leave);
                 }
            }
            
            return newContext;
        });
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
                    const toModify = leaveRequestToModify as {id: string, data: any};
                    const leaveReqRef = doc(firestore, `app-users/${operatorId}/requests`, toModify.id);
                    const { startDate, endDate } = toModify.data;
                    
                    if (isSameDay(startDate.toDate(), endDate.toDate())) {
                        transaction.delete(leaveReqRef);
                    } else if (isSameDay(dayToUnlock, startDate.toDate())) {
                        transaction.update(leaveReqRef, { startDate: Timestamp.fromDate(addDays(startDate.toDate(), 1)) });
                    } else if (isSameDay(dayToUnlock, endDate.toDate())) {
                        transaction.update(leaveReqRef, { endDate: Timestamp.fromDate(subDays(endDate.toDate(), 1)) });
                    } else {
                        transaction.update(leaveReqRef, { endDate: Timestamp.fromDate(subDays(dayToUnlock, 1)) });
                        const newRequestRef = doc(collection(firestore, `app-users/${operatorId}/requests`));
                        const { id, ...restOfRequest } = toModify.data;
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
            console.error("Error in transaction:", error);
        }
    };

    // --- FINE MESE HANDLERS ---
    
    const handleMonthChange = (action: 'prev' | 'next' | 'current') => {
        if (action === 'current') {
            setCurrentMonth(new Date());
        } else {
            const offset = action === 'next' ? 1 : -1;
            setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
        }
    };
    
    const handleCleanMonth = async () => {
        if (!firestore || !operatorId || !currentMonth) return;
        setIsCleaning(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        const batch = writeBatch(firestore);

        const timbratureQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('timestamp', '>=', monthStart), where('timestamp', '<=', monthEnd));
        const timbratureSnap = await getDocs(timbratureQuery);
        timbratureSnap.forEach(doc => batch.delete(doc.ref));

        const straordinariQuery = query(collection(firestore, `app-users/${operatorId}/straordinari`), where('date', '>=', monthStart), where('date', '<=', monthEnd));
        const straordinariSnap = await getDocs(straordinariQuery);
        straordinariSnap.forEach(doc => batch.delete(doc.ref));

        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('startDate', '>=', monthStart), where('startDate', '<=', monthEnd));
        const requestsSnap = await getDocs(requestsQuery);
        requestsSnap.forEach(doc => batch.delete(doc.ref));
        
        const notesQuery = query(collection(firestore, `app-users/${operatorId}/daily-notes`), where('__name__', '>=', format(monthStart, 'yyyy-MM-dd')), where('__name__', '<=', format(monthEnd, 'yyyy-MM-dd')));
        const notesSnap = await getDocs(notesQuery);
        notesSnap.forEach(doc => batch.delete(doc.ref));

        const monthId = format(currentMonth, 'yyyy-MM');
        const overrideDocRef = doc(firestore, `app-users/${operatorId}/monthly-overrides`, monthId);
        batch.delete(overrideDocRef);

        try {
            await batch.commit();
            toast({ title: "Successo!", description: `I dati di ${format(currentMonth, 'MMMM yyyy', { locale: it })} sono stati eliminati.` });
        } catch (error) {
            console.error("Errore pulizia mese:", error);
            toast({ title: "Errore", description: "Impossibile completare la pulizia del mese.", variant: "destructive" });
        } finally {
            setIsCleaning(false);
            setIsCleanConfirmOpen(false);
        }
    };
    
    const handleOpenPrintPreview = () => {
        if (!currentMonth) return;
        const monthString = format(currentMonth, 'yyyy-MM');
        const queryParams = new URLSearchParams({ month: monthString, autoPrint: 'true' });
        window.open(`/dashboard/operators/${operatorId}/end-of-month/print?${queryParams.toString()}`, '_blank');
    };

    const handleDownloadPdf = async () => {
        if (!operator || !currentMonth || !monthlySummary) return;
        setIsDownloading(true);
        try {
            const result = await generateDetailedOperatorPdf(
                currentMonth,
                operator,
                monthlySummary,
                dailyDetails,
                {}, // visibility
                {}  // overrides
            );
            if (result) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(result.blob);
                a.download = result.fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            }
            toast({ title: 'Download completato', description: `Report scaricato correttamente.` });
        } catch (error) {
            console.error("Error downloading PDF:", error);
            toast({ title: 'Errore durante il download', variant: 'destructive' });
        } finally {
            setIsDownloading(false);
        }
    };
    

    const handleAddRequest = async () => {
        if (!firestore || !operatorId || !addRequestContext) return;

        const { date, type, hours, reason } = addRequestContext;

        const newRequestData: any = {
            userId: operatorId,
            type: type,
            status: 'approvato',
            startDate: Timestamp.fromDate(startOfDay(date)),
            endDate: Timestamp.fromDate(startOfDay(date)),
            reason: reason || "",
            createdAt: serverTimestamp(),
            viewedByOperator: false,
        };

        if (type === 'permesso') {
            if (!hours || parseFloat(hours) <= 0) {
                toast({ title: 'Ore mancanti', description: 'Per un permesso, le ore sono obbligatorie.', variant: 'destructive'});
                return;
            }
            newRequestData.hours = parseFloat(hours);
        }

        try {
            await addDoc(collection(firestore, `app-users/${operatorId}/requests`), newRequestData);
            toast({ title: 'Successo', description: 'Richiesta aggiunta e approvata.'});
        } catch (error) {
            console.error("Error adding request:", error);
            toast({ title: 'Errore', description: 'Impossibile aggiungere la richiesta.', variant: 'destructive'});
        } finally {
            setAddRequestContext(null);
        }
    };
    
    const handleDeleteRequest = async () => {
        if (!firestore || !operatorId || !requestToDelete) return;
        const requestRef = doc(firestore, `app-users/${operatorId}/requests`, requestToDelete.id);
        try {
            await deleteDoc(requestRef);
            toast({ title: 'Richiesta eliminata', description: 'La richiesta è stata rimossa con successo.' });
        } catch (error) {
            console.error('Error deleting request:', error);
            toast({ title: 'Errore', description: 'Impossibile eliminare la richiesta.', variant: 'destructive' });
        } finally {
            setRequestToDelete(null);
        }
    };

    const handleEditNoteClick = (detail: DailyDetail) => {
        let defaultText = '';
        if (!detail.shift && !detail.note) {
            const defaultTexts: Record<string, string> = {
                mancata_timbratura: 'Assenza',
                ferie: 'Giorno di Ferie',
                malattia: 'Giorno di Malattia',
                festa: 'Giorno Festivo',
                riposo: 'Giorno di Riposo'
            };
            defaultText = defaultTexts[detail.status] || '';
        }
        const currentNote = detail.note?.note || defaultText;
        setEditingNote({ date: detail.date, currentNote });
        setNoteContent(currentNote);
    };



    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const handleAddManualShift = async () => {
        const datesToProcess = isMultiSelect ? multipleShiftDates : (newShiftDate ? [newShiftDate] : []);

        if (datesToProcess.length === 0) {
            toast({ title: 'Dati mancanti', description: 'Seleziona almeno una data.', variant: 'destructive'});
            return;
        }

        // Basic time validation (on time strings)
        if (!newShiftTimes.entrata && newShiftTimes.uscita) {
            toast({ title: 'Dati mancanti', description: 'L\'orario di entrata è obbligatorio se inserisci un\'uscita.', variant: 'destructive'});
            return;
        }
        if (!newShiftTimes.entrata && !newShiftTimes.uscita) {
            toast({ title: 'Dati mancanti', description: 'Devi inserire almeno un orario di entrata o uscita.', variant: 'destructive'});
            return;
        }

        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operatorId}/timbrature`);

        for (const processingDate of datesToProcess) {
            const dayName = dayIndexToName[getDayFns(processingDate)];
            const schedule = operator.workSchedule[dayName];
            
            // Check for contractual start if not ignored
            if (!newShiftIgnoreContractual && schedule?.startTime && newShiftTimes.entrata) {
                const [contractualHours, contractualMinutes] = schedule.startTime.split(':').map(Number);
                const contractualStart = set(processingDate, { hours: contractualHours, minutes: contractualMinutes, seconds: 0, milliseconds: 0 });
                
                const [entryHours, entryMinutes] = newShiftTimes.entrata.split(':').map(Number);
                const entryTime = set(processingDate, { hours: entryHours, minutes: entryMinutes, seconds: 0, milliseconds: 0 });

                const twoHoursBefore = new Date(contractualStart.getTime() - 120 * 60000);

                if (entryTime < twoHoursBefore) {
                    toast({ 
                        title: 'Orario non valido', 
                        description: `L'orario di entrata per il giorno ${format(processingDate, 'dd/MM')} è prima delle ${format(twoHoursBefore, 'HH:mm')}. Usa 'Ignora orario' per forzare.`, 
                        variant: 'destructive',
                    });
                    continue; // Skip this day instead of aborting the whole batch? Or abort? 
                    // Let's abort to be safe and let the user fix.
                }
            }

            const createTimestamp = (time: string): Timestamp => {
                const [hours, minutes] = time.split(':').map(Number);
                return Timestamp.fromDate(set(processingDate, { hours, minutes, seconds: 0, milliseconds: 0 }));
            };
            
            const isWorkDay = (schedule?.totalHours || 0) > 0 && !isPublicHoliday(processingDate);
            const isOvertime = !isWorkDay && !newShiftIsMakeup;
            
            const manualShiftId = doc(timbratureCollectionRef).id; 
        
            const events: { type: Timbratura['type'], time: string }[] = [
                { type: 'entrata', time: newShiftTimes.entrata },
            ];
            
            if (newShiftTimes.uscita) {
                events.push({ type: 'uscita', time: newShiftTimes.uscita });
            }
            if (newShiftTimes.pausa) {
                events.push({ type: 'pausa', time: newShiftTimes.pausa });
            }
            if (newShiftTimes.fine_pausa) {
                events.push({ type: 'fine_pausa', time: newShiftTimes.fine_pausa });
            }
        
            const makeupDayValue = newShiftIsMakeup && newShiftMakeupDay ? newShiftMakeupDay : undefined;

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
                        ...(makeupDayValue && { makeupOfDay: makeupDayValue })
                    };
                    if (event.type === 'entrata') {
                        eventPayload.ignoreContractualStart = newShiftIgnoreContractual;
                    }
                    batch.set(newDocRef, eventPayload);
                }
            }
        }

        try {
            await batch.commit();
            toast({ title: 'Successo', description: `${datesToProcess.length} turni manuali aggiunti. Ora sono in attesa di approvazione.` });
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile aggiungere i turni manuali.', variant: 'destructive'});
        }
        
        setIsAddShiftOpen(false);
        setNewShiftTimes({ entrata: '', uscita: '', pausa: '', fine_pausa: '' });
        setNewShiftIgnoreContractual(false);
        setNewShiftIsMakeup(false);
        setNewShiftMakeupDay('');
        setIsMultiSelect(false);
        setMultipleShiftDates([]);
    };
    
    
    const formatDate = (date: Timestamp | undefined | Date) => date ? format(date instanceof Date ? date : date.toDate(), 'PPP', { locale: it }) : 'N/D';
    
    const totalPages = Math.ceil(historicalShifts.length / ITEMS_PER_PAGE);
    const paginatedApprovedShifts = historicalShifts.slice(
        currentPage * ITEMS_PER_PAGE,
        (currentPage + 1) * ITEMS_PER_PAGE
    );
    
    const handleOvertimeShiftApprovalProcess = (shift: StraordinarioShift) => {
        if (!operator) return;
        if (isSameDay(shift.date.toDate(), new Date()) && !shift.events.some(e => e.type === 'uscita')) {
            toast({ title: 'Turno in corso', description: 'Non puoi approvare un turno non ancora terminato.', variant: 'destructive' });
            return;
        }
        handleOpenApproveDialog(shift, true);
    };

    const handleOvertimeShiftAction = async (shift: StraordinarioShift, action: 'approve' | 'reject') => {
        if (!firestore || !operatorId || !operator) return;
    
        const shiftRef = doc(firestore, `app-users/${operatorId}/straordinari`, shift.id);
    
        if (action === 'reject') {
            await updateDoc(shiftRef, { status: 'rifiutato' });
            toast({ title: 'Successo', description: 'Turno straordinario rifiutato.' });
        } else { // approve
            const approvedOvertime = approvalContext ? parseFloat(approvalContext.overtimeHours) : 0;
            const updateData: {status: 'approvato' | 'rifiutato', approvedHours?: number} = {
                status: 'approvato',
                approvedHours: approvedOvertime,
            };

            await updateDoc(shiftRef, updateData);
            toast({ title: 'Successo', description: 'Turno straordinario approvato.' });
        }
        
        setApprovalContext(null);
        setIsApproveDialogOpen(false);
        setIsDetailOvertimeOpen(false);
    };
    
    const calculateOvertimeShiftMinutes = (shift: StraordinarioShift, manualBreak?: ManualBreak) => {
        let { workedMinutes } = calculateShiftDetails(shift.events as Timbratura[], undefined, true);
        return workedMinutes;
    };
    
    const calculateOvertimeShiftHours = (shift: StraordinarioShift, manualBreak?: ManualBreak) => {
        return calculatePureOvertime(shift, operator, manualBreak);
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
        const updatePayload: { events: StraordinarioEvent[], status: StraordinarioShift['status'] } = { 
            events: newEvents,
            status: 'in_attesa_di_approvazione', // Always require re-approval after edit
            isAuto: false
        };
        
        await updateDoc(docRef, updatePayload).then(() => {
            toast({ title: 'Successo', description: 'Turno straordinario aggiornato. Richiede nuova approvazione.' });
            setIsEditOvertimeOpen(false);
            setEditingOvertimeShift(null);
            
            setDetailOvertimeShift(prev => prev ? ({ ...prev, events: newEvents, status: updatePayload.status }) : null);

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

    const handleSaveNote = async () => {
        if (!firestore || !operatorId || !editingNote) return;
    
        const dateString = format(editingNote.date, 'yyyy-MM-dd');
        const noteRef = doc(firestore, `app-users/${operatorId}/daily-notes`, dateString);
    
        const noteData = {
            note: noteContent,
            date: dateString,
            userId: operatorId,
            updatedAt: serverTimestamp()
        };
    
        setDoc(noteRef, noteData, { merge: true })
            .then(() => {
                toast({ title: 'Nota salvata'});
                setDailyNotes(prev => {
                    const existingNoteIndex = prev.findIndex(n => n.date === dateString);
                    if (existingNoteIndex > -1) {
                        const newNotes = [...prev];
                        newNotes[existingNoteIndex] = { ...newNotes[existingNoteIndex], note: noteContent };
                        return newNotes;
                    } else {
                        return [...prev, { date: dateString, note: noteContent }];
                    }
                });
            })
            .catch(err => {
                toast({ title: 'Errore', description: 'Impossibile salvare la nota.', variant: 'destructive' });
            })
            .finally(() => {
                setEditingNote(null);
                setNoteContent('');
            });
    };

    const handleFixOrphanedShift = async (eventsToFix: Timbratura[]) => {
        if (!firestore || !operatorId || eventsToFix.length === 0) return;
    
        const batch = writeBatch(firestore);
        const timbratureCollectionRef = collection(firestore, `app-users/${operatorId}/timbrature`);
        const newShiftId = doc(timbratureCollectionRef).id;
    
        eventsToFix.forEach(event => {
            const docRef = doc(timbratureCollectionRef, event.id);
            batch.update(docRef, { shiftId: newShiftId, status: 'sospesa' });
        });
    
        try {
            await batch.commit();
            toast({
                title: "Successo!",
                description: "Turno creato dagli eventi orfani. Ora puoi approvarlo dalla lista dei turni in attesa.",
                duration: 7000
            });
        } catch (error) {
            console.error("Error fixing orphaned shift:", error);
            toast({ title: 'Errore', description: 'Impossibile creare il turno.', variant: 'destructive' });
        }
    };


    const handleDeleteOrphanedEvent = async () => {
        if (!firestore || !eventToDelete || !operatorId) return;
        const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, eventToDelete.id);
        try {
            await deleteDoc(docRef);
            toast({ title: "Successo", description: "Evento orfano eliminato." });
        } catch (error) {
            toast({ title: 'Errore', description: 'Impossibile eliminare l\'evento.', variant: 'destructive' });
            console.error("Error deleting orphaned event: ", error);
        } finally {
            setEventToDelete(null);
        }
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
            </Card>

            <Tabs defaultValue="shifts" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8">
                    <TabsTrigger value="shifts">Gestione Turni</TabsTrigger>
                    <TabsTrigger value="report">Dashboard Fine Mese</TabsTrigger>
                </TabsList>

                <TabsContent value="shifts" className="space-y-6">
                    {Object.keys(orphanedEventsByDay).length > 0 && (
                        <Card className="mb-6 border-amber-500 bg-amber-500/10">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-amber-700">
                                    <AlertCircle className="h-5 w-5" />
                                    Risolvi Timbrature Orfane
                                </CardTitle>
                                <CardDescription className="text-amber-600">
                                    Sono stati trovati eventi di timbratura non raggruppati. Puoi unirli per creare un turno valido o eliminarli singolarmente.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {Object.entries(orphanedEventsByDay).map(([dayISO, events]) => (
                                    <div key={dayISO} className="p-3 border rounded-md bg-background">
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="font-semibold">{format(new Date(dayISO), 'PPP', { locale: it })}</h4>
                                            <Button size="sm" onClick={() => handleFixOrphanedShift(events)}>
                                                <Wand2 className="mr-2 h-4 w-4" />
                                                Unisci e Crea Turno
                                            </Button>
                                        </div>
                                        <Table>
                                            <TableBody>
                                                {events.map(event => (
                                                    <TableRow key={event.id}>
                                                        <TableCell>{event.timestamp ? format(event.timestamp.toDate(), 'p', { locale: it }) : 'N/D'}</TableCell>
                                                        <TableCell className="capitalize">{event.type}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" onClick={() => setEventToDelete(event)}>
                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                    {pendingShifts.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <CheckCircle className="h-12 w-12 text-green-500 mb-4 opacity-20" />
                                <p className="text-sm text-muted-foreground text-center">Nessun turno in attesa di approvazione.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardHeader>
                                <CardTitle>Turni in Attesa</CardTitle>
                                <CardDescription>Revisiona e approva i turni registrati dall'operatore.</CardDescription>
                            </CardHeader>
                            <CardContent>
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
                                                const exitEvent = shift.events.find(e => e.type === 'uscita');
                                                const endTime = exitEvent?.timestamp;
                                                const suggestedTime = exitEvent?.suggestedTime;
                                                const isAutoVoided = shift.events.some(e => e.type === 'uscita' && e.isAuto);
                                                const isAutoEntry = shift.events.some(e => e.type === 'entrata' && e.isAuto);
                                                const entryEvent = shift.events.find(e => e.type === 'entrata');
                                                const entrySuggested = entryEvent?.suggestedTime;
                                                
                                                return (
                                                    <TableRow key={index} className={cn((isAutoVoided || isAutoEntry) && "bg-red-50 dark:bg-red-950/20")}>
                                                        <TableCell className='flex items-center gap-2 whitespace-nowrap'>
                                                          {shift.isOnLeaveDay && <AlertCircle className="h-5 w-5 text-yellow-500" />}
                                                          {(isAutoVoided || isAutoEntry) && <AlertTriangle className="h-5 w-5 text-red-600" />}
                                                          {formatDate(startTime)}
                                                          {shift.makeupOfDay && <Badge variant="outline">Recupero</Badge>}
                                                          {(isAutoVoided || isAutoEntry) && <Badge variant="destructive" className="ml-2 bg-red-600 animate-pulse">Dimenticata!</Badge>}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {entryEvent?.status === 'sospesa' && !entryEvent.originalTime ? '--:--' : (startTime ? format(startTime.toDate(), 'HH:mm') : '--:--')}
                                                            {entrySuggested && (
                                                                entryEvent?.originalTime ? (
                                                                    <span className="block text-[10px] text-orange-600 font-bold bg-orange-500/10 px-1 py-0.5 rounded mt-1">Rettifica: {entrySuggested}</span>
                                                                ) : (
                                                                    <span className="block text-[10px] text-blue-600 font-bold bg-blue-500/10 px-1 py-0.5 rounded mt-1">Dichiarato: {entrySuggested}</span>
                                                                )
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {exitEvent?.status === 'sospesa' && !exitEvent.originalTime ? '--:--' : (endTime ? format(endTime.toDate(), 'HH:mm') : '--:--')}
                                                            {suggestedTime && (
                                                                exitEvent?.originalTime ? (
                                                                    <span className="block text-[10px] text-orange-600 font-bold bg-orange-500/10 px-1 py-0.5 rounded mt-1">Rettifica: {suggestedTime}</span>
                                                                ) : (
                                                                    <span className="block text-[10px] text-blue-600 font-bold bg-blue-500/10 px-1 py-0.5 rounded mt-1">Dichiarato: {suggestedTime}</span>
                                                                )
                                                            )}
                                                        </TableCell>
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
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Turni Straordinari da Gestire</CardTitle>
                            <CardDescription>Gestisci i turni di straordinario in corso o completati.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             {pendingOvertimeShifts.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">Nessun turno straordinario in corso o in attesa di approvazione.</p>
                             ) : (
                                <div className="border rounded-lg overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Data</TableHead>
                                                <TableHead>Inizio</TableHead>
                                                <TableHead>Fine</TableHead>
                                                <TableHead>Stato</TableHead>
                                                <TableHead className="text-right">Azioni</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pendingOvertimeShifts.map((shift) => (
                                                <TableRow key={shift.id}>
                                                    <TableCell className="whitespace-nowrap">{formatDate(shift.date)}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{shift.events.find(e => e.type === 'entrata') ? format(shift.events.find(e => e.type === 'entrata')!.timestamp.toDate(), 'HH:mm') : '--:--'}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{shift.events.find(e => e.type === 'uscita') ? format(shift.events.find(e => e.type === 'uscita')!.timestamp.toDate(), 'HH:mm') : '--:--'}</TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <Badge variant={
                                                            shift.status === 'in_attesa_di_approvazione' ? 'default'
                                                            : shift.status === 'in_corso' ? 'outline'
                                                            : 'destructive'
                                                        } className={cn(
                                                            shift.status === 'in_attesa_di_approvazione' && 'bg-yellow-500 text-white',
                                                            shift.status === 'in_corso' && 'bg-blue-500 text-white'
                                                        )}>
                                                        {shift.status.replace(/_/g, ' ')}
                                                        </Badge>
                                                    </TableCell>
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
                                                <TableHead className="whitespace-nowrap">Timbrature</TableHead>
                                                <TableHead className="whitespace-nowrap">Durata Effettiva</TableHead>
                                                <TableHead className="whitespace-nowrap">Ore Contabili</TableHead>
                                                <TableHead className="whitespace-nowrap">Stato</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Azioni</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                       <TableBody>
                                            {paginatedApprovedShifts.map((shift, index) => {
                                                const isRegular = shift.type === 'regular';
                                                const date = isRegular ? (shift as Shift).date : (shift as StraordinarioShift).date;
                                                const dateObj = date instanceof Date ? date : (date as Timestamp).toDate();
                                                const note = dailyNotes.find(n => isSameDay(parse(n.date, 'yyyy-MM-dd', new Date()), dateObj));

                                                let timbratureString = '';
                                                let effectiveDurationString = '';
                                                let accountingHoursString = '';

                                                if (!operator) return null;

                                                if (isRegular) {
                                                    const regularShift = shift as Shift;
                                                    const sortedEvents = [...regularShift.events].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                                                    
                                                    const clockInEvent = sortedEvents.find(e => e.type === 'entrata');
                                                    const dayToUseDate = clockInEvent?.makeupOfDay ? parse(clockInEvent.makeupOfDay, 'yyyy-MM-dd', new Date()) : regularShift.date;
                                                    const dayToUse = dayIndexToName[getDayFns(dayToUseDate)];
                                                    const schedule = operator.workSchedule[dayToUse];
                                                    
                                                    const { ordinary, overtime, leave, worked, calculationStart, calculationEnd } = calculateHours(regularShift, schedule, regularShift.ignoreContractualStart, operator);
                                                    
                                                    effectiveDurationString = formatMinutes(worked);

                                                    timbratureString = sortedEvents.map(e => {
                                                        const originalTime = format(e.timestamp.toDate(), 'HH:mm');
                                                        let referenceTime = '';
                                                        
                                                        if (e.type === 'entrata' && calculationStart) {
                                                            referenceTime = `(${format(calculationStart, 'HH:mm')})`;
                                                        } else if (e.type === 'uscita' && calculationEnd) {
                                                            referenceTime = `(${format(calculationEnd, 'HH:mm')})`;
                                                        }
                                                        const typeFormatted = e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ');
                                                        return `${typeFormatted}: ${originalTime} ${referenceTime}`.trim();
                                                    }).join(' | ');
                                                    
                                                    const parts = [];
                                                    if (ordinary > 0) parts.push(`${ordinary}h ordinarie`);
                                                    
                                                    const associatedLeaveRequest = approvedRequests.find(r => r.associatedShiftId === regularShift.id && r.type === 'permesso');
                                                    if (associatedLeaveRequest?.hours) {
                                                         parts.push(`${associatedLeaveRequest.hours}h permesso`);
                                                    }
                                                    
                                                    if (overtime > 0) parts.push(`${overtime}h straordinarie`);

                                                    accountingHoursString = parts.length > 0 ? parts.join(', ') : '0h';

                                                } else { // Overtime shift
                                                    const overtimeShift = shift as StraordinarioShift;
                                                    const approvedHours = overtimeShift.approvedHours ?? calculatePureOvertime(overtimeShift, operator);

                                                    const sortedEvents = [...overtimeShift.events].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                                                    const shiftDate = overtimeShift.date.toDate();
                                                    const dayName = dayIndexToName[getDayFns(shiftDate)];
                                                    const schedule = operator.workSchedule[dayName];
                                                    const { calculationStart, calculationEnd } = calculateShiftDetails(overtimeShift.events as Timbratura[], schedule, false, operator);
                                                    
                                                    timbratureString = sortedEvents.map(e => {
                                                         const originalTime = format(e.timestamp.toDate(), 'HH:mm');
                                                         let referenceTime = '';
                                                         if (e.type === 'entrata' && calculationStart) {
                                                            referenceTime = `(${format(calculationStart, 'HH:mm')})`;
                                                         } else if (e.type === 'uscita' && calculationEnd) {
                                                            referenceTime = `(${format(calculationEnd, 'HH:mm')})`;
                                                         }
                                                         const typeFormatted = e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ');
                                                         return `${typeFormatted}: ${originalTime} ${referenceTime}`.trim();
                                                    }).join(' | ');
                                                    
                                                    const { workedMinutes } = getShiftDurations(overtimeShift.events);
                                                    effectiveDurationString = formatMinutes(workedMinutes);
                                                    accountingHoursString = `${approvedHours}h straordinarie`;
                                                }

                                                return (
                                                    <TableRow key={`${shift.id}-${index}`}>
                                                        <TableCell className="whitespace-nowrap">{formatDate(date)}</TableCell>
                                                        <TableCell className="text-xs max-w-[300px] truncate" title={timbratureString}>{timbratureString}</TableCell>
                                                        <TableCell className="whitespace-nowrap">{effectiveDurationString}</TableCell>
                                                        <TableCell className="whitespace-nowrap text-xs">{accountingHoursString}</TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            <Badge variant={shift.status === 'confermato' || shift.status === 'approvato' ? 'secondary' : 'destructive'}>
                                                                {shift.status.charAt(0).toUpperCase() + shift.status.slice(1).replace('_', ' ')}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right whitespace-nowrap">
                                                            <Button variant="ghost" size="icon" onClick={() => { setEditingNote({ date: dateObj, currentNote: note?.note || '' }); setNoteContent(note?.note || ''); }}>
                                                                <FileText className={cn('h-5 w-5', note ? 'text-green-500' : 'text-foreground')}/>
                                                            </Button>
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
                </TabsContent>

                <TabsContent value="report">
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight">Riepilogo Mensile</h2>
                                <p className="text-muted-foreground">Analisi delle ore e dei costi per {format(currentMonth, 'MMMM yyyy', { locale: it })}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1 bg-background border rounded-md p-1">
                                    <Button variant="ghost" size="icon" onClick={() => handleMonthChange('prev')}><ChevronLeft className="h-4 w-4" /></Button>
                                    <div className="px-3 py-1 text-sm font-medium min-w-[120px] text-center capitalize">
                                        {format(currentMonth, 'MMMM yyyy', { locale: it })}
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => handleMonthChange('next')}><ChevronRight className="h-4 w-4" /></Button>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => handleMonthChange('current')}><CalendarIcon className="mr-2 h-4 w-4" /> Oggi</Button>
                                <div className="h-8 w-px bg-border mx-1" />
                                <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={isDownloading}>
                                    {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    PDF
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleOpenPrintPreview}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    Stampa
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => setIsCleanConfirmOpen(true)}><Trash2 className="mr-2 h-4 w-4" /> Pulisci Mese</Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Card className="bg-primary/5 border-primary/20">
                                <CardHeader className="pb-2">
                                    <CardDescription className="text-xs font-semibold uppercase tracking-wider">Ore Ordinarie</CardDescription>
                                    <CardTitle className="text-2xl font-bold">{monthlySummary.ordinaryHours}h</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xs text-muted-foreground">Su {monthlySummary.expectedMonthlyHours}h previste</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-amber-500/5 border-amber-500/20">
                                <CardHeader className="pb-2">
                                    <CardDescription className="text-xs font-semibold uppercase tracking-wider">Straordinari</CardDescription>
                                    <CardTitle className="text-2xl font-bold">{monthlySummary.overtimeHours}h</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xs text-muted-foreground">Approvati questo mese</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-blue-500/5 border-blue-500/20">
                                <CardHeader className="pb-2">
                                    <CardDescription className="text-xs font-semibold uppercase tracking-wider">Permessi / Ferie</CardDescription>
                                    <CardTitle className="text-2xl font-bold">{monthlySummary.ferieHours + monthlySummary.permessoHours}h</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xs text-muted-foreground">Giustificati</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-green-500/5 border-green-500/20">
                                <CardHeader className="pb-2">
                                    <CardDescription className="text-xs font-semibold uppercase tracking-wider">Costo Stimato</CardDescription>
                                    <CardTitle className="text-2xl font-bold">€{(monthlySummary?.estimatedTotalCost || 0).toFixed(2)}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xs text-muted-foreground">Basato su ord. + stra.</div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Dettaglio Giornaliero</CardTitle>
                                        <CardDescription>Resoconto puntuale di ogni giornata del mese</CardDescription>
                                    </div>
                                    <Badge variant="outline" className="font-mono">{monthlySummary.ordinaryWorkedDays}gg Ordinari Lavorati</Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-[150px]">Data</TableHead>
                                                <TableHead>Descrizione</TableHead>
                                                <TableHead className="text-center">Ordinarie</TableHead>
                                                <TableHead className="text-center">Straordinarie</TableHead>
                                                <TableHead className="text-center">Permessi</TableHead>
                                                <TableHead className="text-right">Azioni</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dailyDetails.map((detail, idx) => {
                                                const isHoliday = isPublicHoliday(detail.date);
                                                const isWeekend = isSunday(detail.date);
                                                const isAbsence = detail.status === 'mancata_timbratura';
                                                const publicNote = detail.note?.publicNote || detail.note?.note || '';
                                                const ordinaryHours = detail.shift?.ordinaryHours || 0;
                                                const overtimeHours = detail.shift?.overtimeHours || 0;
                                                const leaveHours = detail.shift?.permissionHours || 0;

                                                return (
                                                    <TableRow key={idx} className={cn(isHoliday && "bg-orange-500/5", isWeekend && !isHoliday && "bg-muted/30")}>
                                                        <TableCell className="font-medium py-4">
                                                            <div className="flex flex-col">
                                                                <span className="capitalize">{format(detail.date, 'eeee', { locale: it })}</span>
                                                                <span className="text-xs text-muted-foreground">{format(detail.date, 'dd/MM/yyyy')}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {isHoliday && <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">Festivo</Badge>}
                                                                {isAbsence && <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Assenza</Badge>}
                                                                {publicNote && <span className="text-xs italic text-muted-foreground block w-full mt-1">"{publicNote}"</span>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {ordinaryHours > 0 ? (
                                                                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/10 border-primary/20">
                                                                    {ordinaryHours}h
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {overtimeHours > 0 ? (
                                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">
                                                                    +{overtimeHours}h
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {leaveHours > 0 ? (
                                                                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200">
                                                                    {leaveHours}h
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" onClick={() => { setEditingNote({ date: detail.date, currentNote: publicNote }); setNoteContent(publicNote); }}>
                                                                <FileText className={cn("h-4 w-4", publicNote ? "text-primary" : "text-muted-foreground")} />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            <ResponsiveDialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Aggiungi Turno Manuale</ResponsiveDialogTitle>
                        <ResponsiveDialogDescription>Seleziona il giorno e inserisci gli orari del turno. Il sistema capirà se è ordinario o straordinario.</ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="multi-select" checked={isMultiSelect} onCheckedChange={(checked) => setIsMultiSelect(!!checked)} />
                            <Label htmlFor="multi-select" className="text-sm font-semibold">Selezione Multipla</Label>
                        </div>
                        <div className="space-y-2">
                           <Label>{isMultiSelect ? 'Seleziona i giorni' : 'Giorno del turno'}</Label>
                           {isMultiSelect ? (
                                    <Calendar
                                        mode="multiple"
                                        selected={multipleShiftDates}
                                        onSelect={(dates: any) => setMultipleShiftDates(dates || [])}
                                        className="rounded-md border mx-auto"
                                        disabled={(date) => date > new Date() || date < subDays(new Date(), 90)}
                                        locale={it}
                                    />
                                ) : (
                                    <Calendar
                                        mode="single"
                                        selected={newShiftDate}
                                        onSelect={(date: any) => setNewShiftDate(date)}
                                        className="rounded-md border mx-auto"
                                        disabled={(date) => date > new Date() || date < subDays(new Date(), 90)}
                                        locale={it}
                                    />
                                )}
                           {!isMultiSelect && newShiftDate && (
                                <p className="text-sm text-muted-foreground pt-2">
                                    {contractualStartTime 
                                        ? `Inizio turno previsto: ${contractualStartTime}`
                                        : "Nessun orario di inizio specifico previsto per questo giorno."
                                    }
                                </p>
                           )}
                           {isMultiSelect && multipleShiftDates.length > 0 && (
                               <p className="text-sm text-primary font-medium pt-2">
                                   {multipleShiftDates.length} giorni selezionati
                               </p>
                           )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="manual-entrata">Entrata</Label>
                                <Input id="manual-entrata" type="time" value={newShiftTimes.entrata} onChange={e => setNewShiftTimes(p => ({...p, entrata: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="manual-uscita">Uscita</Label>
                                <Input id="manual-uscita" type="time" value={newShiftTimes.uscita} onChange={e => setNewShiftTimes(p => ({...p, uscita: e.target.value}))} />
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
                                 <Input type="date" value={newShiftMakeupDay} onChange={e => setNewShiftMakeupDay(e.target.value)} />
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

            <AlertDialog open={!!eventToDelete} onOpenChange={(open) => !open && setEventToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare questo evento orfano?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione è permanente e non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setEventToDelete(null)}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOrphanedEvent}>Elimina Evento</AlertDialogAction>
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
                                {detailShift?.events[0]?.timestamp && <ResponsiveDialogDescription>Turno del {formatDate(detailShift.events[0].timestamp)} {detailShift.makeupOfDay && `(Recupero del ${format(parse(detailShift.makeupOfDay, 'yyyy-MM-dd', new Date()), 'PPP', { locale: it })})`}</ResponsiveDialogDescription>}
                            </div>
                             <div className="flex items-center gap-2">
                                {detailShift?.isOnLeaveDay && (
                                    <div className='flex items-center gap-2 text-yellow-600 bg-yellow-500/10 p-2 rounded-md'>
                                        <AlertCircle className="h-5 w-5" />
                                        <span className="text-sm font-medium">Timbrato in giorno di assenza</span>
                                    </div>
                                )}
                                {detailShift && (
                                    <Button variant="ghost" size="icon" onClick={() => {
                                        const note = dailyNotes.find(n => isSameDay(parse(n.date, 'yyyy-MM-dd', new Date()), detailShift.date));
                                        setEditingNote({ date: detailShift.date, currentNote: note?.note || '' });
                                        setNoteContent(note?.note || '');
                                    }}>
                                        <FileText className={cn('h-5 w-5', dailyNotes.some(n => isSameDay(parse(n.date, 'yyyy-MM-dd', new Date()), detailShift.date)) ? 'text-green-500' : 'text-foreground')}/>
                                    </Button>
                                )}
                             </div>
                        </div>
                    </ResponsiveDialogHeader>

                     {detailShift && operator && (() => {
                        const clockInEvent = detailShift.events.find(e => e.type === 'entrata');
                        const dayToUseDate = clockInEvent?.makeupOfDay ? parse(clockInEvent.makeupOfDay, 'yyyy-MM-dd', new Date()) : detailShift.date;
                        const dayToUse = dayIndexToName[getDayFns(dayToUseDate)];
                        const schedule = operator.workSchedule[dayToUse];
                        
                        const { ordinary, overtime, leave, worked, calculationStart, calculationEnd } = calculateHours(detailShift, schedule, detailShift.ignoreContractualStart, operator);

                        const associatedLeaveRequest = detailShift.status === 'confermato' 
                            ? approvedRequests.find(r => r.associatedShiftId === detailShift.id && r.type === 'permesso')
                            : null;
                        
                        const finalOvertime = overtime;
                        
                        let mainResultLabel = 'Straordinari';
                        let mainResultValue = `${finalOvertime}h`;

                        const permissionHours = associatedLeaveRequest?.hours ?? leave;

                        if (finalOvertime === 0 && permissionHours > 0) {
                            mainResultLabel = 'Permessi';
                            mainResultValue = `${permissionHours}h`;
                        } else if (finalOvertime > 0 && permissionHours > 0) {
                             mainResultValue = `${finalOvertime}h (Perm: ${permissionHours}h)`;
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
                                    const { calculationStart, calculationEnd } = calculateHours(detailShift, operator.workSchedule[dayIndexToName[getDayFns(detailShift.date)]], detailShift.ignoreContractualStart, operator);

                                    return displayEvents.map(t => {
                                        const originalTime = format(t.timestamp.toDate(), 'HH:mm:ss');
                                        let referenceTime = '';

                                        if (t.type === 'entrata' && calculationStart) {
                                            referenceTime = `(${format(calculationStart, 'HH:mm')})`;
                                        } else if (t.type === 'uscita' && calculationEnd) {
                                            referenceTime = `(${format(calculationEnd, 'HH:mm')})`;
                                        }
                                        
                                        return (
                                        <TableRow key={t.id}>
                                            <TableCell className={cn("whitespace-nowrap", t.isAuto && "text-muted-foreground italic")}>
                                               <div className='flex flex-col'>
                                                  <span className="flex items-center gap-1 font-mono">
                                                     {t.status === 'sospesa' && !t.originalTime ? '--:--:--' : originalTime} {referenceTime}
                                                  </span>
                                                  {t.suggestedTime && (
                                                      t.originalTime ? (
                                                          <Badge variant="outline" className="text-[10px] h-auto px-1.5 py-0.5 border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/20 font-semibold block mt-1 w-fit">
                                                              Rettifica richiesta da {t.originalTime} a {t.suggestedTime}
                                                          </Badge>
                                                      ) : (
                                                          <Badge variant="outline" className="text-[10px] h-auto px-1.5 py-0.5 border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-950/20 font-semibold block mt-1 w-fit">
                                                              Richiesta inserimento: {t.suggestedTime}
                                                          </Badge>
                                                      )
                                                  )}
                                               </div>
                                            </TableCell>
                                            <TableCell className={cn("capitalize whitespace-nowrap", t.isAuto && "text-muted-foreground italic")}>{t.type.replace('_', ' ')}</TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <Badge variant={t.status === 'confermata' ? 'secondary' : t.status === 'rifiutata' ? 'destructive' : 'default'} className={cn(t.status === 'sospesa' && "bg-yellow-500 text-white")}>
                                                    {t.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                               {t.latitude && t.longitude ? (
                                                    <a href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                                        <MapPin className="h-4 w-4"/> Mappa
                                                    </a>
                                                ) : (
                                                    <span>Manuale</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right whitespace-nowrap flex items-center justify-end gap-1.5 h-full">
                                                {t.suggestedTime && (
                                                    <>
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-7 px-2 border-green-500 hover:bg-green-500 hover:text-white text-green-600 flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider"
                                                            onClick={() => handleApproveRectification(t, detailShift)}
                                                        >
                                                            <CheckCircle className="h-3.5 w-3.5" /> Applica
                                                        </Button>
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-7 px-2 border-red-500 hover:bg-red-500 hover:text-white text-red-600 flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider"
                                                            onClick={() => handleRejectRectification(t, detailShift)}
                                                        >
                                                            <XCircle className="h-3.5 w-3.5" /> Rifiuta
                                                        </Button>
                                                    </>
                                                )}
                                                <Button variant="ghost" size="icon" onClick={() => { setDeletingTimbratura(t); setIsDeleteTimbraturaDialogOpen(true); }}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
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
                                {detailOvertimeShift && operator && (() => {
                                    const { calculationStart, calculationEnd } = calculateShiftDetails(detailOvertimeShift.events as Timbratura[], operator.workSchedule[dayIndexToName[getDayFns(detailOvertimeShift.date.toDate())]], false, operator);

                                    return detailOvertimeShift.events.map((e, i) => {
                                        const originalTime = format(e.timestamp.toDate(), 'HH:mm:ss');
                                        let referenceTime = '';

                                        if (e.type === 'entrata' && calculationStart) {
                                            referenceTime = `(${format(calculationStart, 'HH:mm')})`;
                                        } else if (e.type === 'uscita' && calculationEnd) {
                                            referenceTime = `(${format(calculationEnd, 'HH:mm')})`;
                                        }

                                        return (
                                            <TableRow key={i}>
                                                <TableCell><span className='italic'>{`${originalTime} ${referenceTime}`.trim()}</span></TableCell>
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
                                        )
                                    });
                                })()}
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
                                {isEditShiftOpen && editingShift?.events.find(e => e.type === 'entrata')?.suggestedTime && (
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-blue-600 font-semibold italic">Suggerito: {editingShift.events.find(e => e.type === 'entrata')?.suggestedTime}</span>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-5 px-1 text-[10px] text-blue-600 hover:text-blue-700"
                                            onClick={() => setEditShiftTimes(p => ({...p, entrata: editingShift.events.find(e => e.type === 'entrata')!.suggestedTime!}))}
                                        >
                                            Usa
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-uscita">Uscita</Label>
                                <Input id="edit-uscita" type="time" value={editShiftTimes.uscita} onChange={e => setEditShiftTimes(p => ({...p, uscita: e.target.value}))} />
                                {isEditShiftOpen && editingShift?.events.find(e => e.type === 'uscita')?.suggestedTime && (
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-blue-600 font-semibold italic">Suggerito: {editingShift.events.find(e => e.type === 'uscita')?.suggestedTime}</span>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-5 px-1 text-[10px] text-blue-600 hover:text-blue-700"
                                            onClick={() => setEditShiftTimes(p => ({...p, uscita: editingShift.events.find(e => e.type === 'uscita')!.suggestedTime!}))}
                                        >
                                            Usa
                                        </Button>
                                    </div>
                                )}
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
                            <>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="edit-ignore-contractual" checked={editIgnoreContractual} onCheckedChange={(checked) => setEditIgnoreContractual(!!checked)} />
                                    <Label htmlFor="edit-ignore-contractual" className="text-sm font-normal">
                                        Ignora orario di inizio contrattuale
                                    </Label>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-makeup-day">Recupero del Giorno (Opzionale)</Label>
                                    <Input id="edit-makeup-day" type="date" value={editMakeupDay} onChange={e => setEditMakeupDay(e.target.value)} />
                                    <p className="text-xs text-muted-foreground">Lascia vuoto se non è un recupero.</p>
                                </div>
                            </>
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
                            {approvalContext.shift.events.some(e => e.isAuto) && (
                                <div className="bg-amber-100 dark:bg-amber-900/30 p-3 rounded-md border border-amber-200 flex items-start gap-2">
                                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                                    <div className="text-xs text-amber-800 dark:text-amber-200">
                                        <p className="font-bold">Attenzione: Timbrature Automatiche</p>
                                        <p>Questo turno contiene timbrature generate dal sistema. Verifica che le ore calcolate siano corrette o usa i suggerimenti dell'operatore nel dettaglio del turno prima di procedere.</p>
                                    </div>
                                </div>
                            )}
                            {!approvalContext.isOvertimeShift && (
                                <>
                                <div className="flex items-center space-x-2">
                                    <Checkbox 
                                        id="ignore-contractual" 
                                        checked={approvalContext.ignoreContractualStart} 
                                        onCheckedChange={(checked) => handleApprovalContextChange('ignoreContractualStart', !!checked)}
                                    />
                                    <Label htmlFor="ignore-contractual" className="text-sm font-normal">
                                        Ignora orario di inizio contrattuale
                                    </Label>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="approve-makeup-day">Recupero del Giorno (Opzionale)</Label>
                                    <Input id="approve-makeup-day" type="date" value={approvalContext.makeupOfDay} onChange={e => handleApprovalContextChange('makeupOfDay', e.target.value)} />
                                </div>
                                </>
                            )}
                            {!approvalContext.isOvertimeShift && (
                                <div>
                                    <Label htmlFor="ordinary-hours">Ore Ordinarie Lavorate</Label>
                                    <Input id="ordinary-hours" type="number" value={approvalContext.ordinaryHours} onChange={(e) => handleApprovalContextChange('ordinaryHours', e.target.value)} step="0.5" min="0" />
                                    <p className="text-xs text-muted-foreground mt-1">Le ore di lavoro che rientrano nel contratto.</p>
                                </div>
                            )}
                            <div>
                                <Label htmlFor="overtime-hours">Ore di Straordinario</Label>
                                <Input id="overtime-hours" type="number" value={approvalContext.overtimeHours} onChange={(e) => handleApprovalContextChange('overtimeHours', e.target.value)} step="0.5" min="0" />
                                <p className="text-xs text-muted-foreground mt-1">Le ore che superano il monte ore giornaliero.</p>
                            </div>
                            {!approvalContext.isOvertimeShift && (
                                <div>
                                    <Label htmlFor="leave-hours">Ore di Permesso (Ammanco Ore)</Label>
                                    <div className="flex gap-2 items-center">
                                        <Input id="leave-hours" type="number" className="flex-1" value={approvalContext.leaveHours} onChange={(e) => handleApprovalContextChange('leaveHours', e.target.value)} step="0.5" min="0" />
                                        <Button variant="outline" size="sm" type="button" onClick={() => {
                                            handleApprovalContextChange('leaveHours', '0');
                                            handleApprovalContextChange('createLeaveRequest', false);
                                        }}>Azzera</Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">Le ore mancanti rispetto al monte ore giornaliero.</p>
                                    <div className="flex items-center space-x-2 mt-2">
                                        <Checkbox id="include-leave" checked={approvalContext.createLeaveRequest} onCheckedChange={(checked) => handleApprovalContextChange('createLeaveRequest', !!checked)} />
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
                        <AlertDialogAction onClick={() => handleApprovalClick(approvalContext)} disabled={isProcessingApprove}>Approva e Registra</AlertDialogAction>
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
                        <ResponsiveDialogDescription>Inserisci gli orari o usa l'opzione standard.</ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="standard-break"
                                checked={breakTimes.start === '12:30' && breakTimes.end === '13:30'}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        setBreakTimes({ start: '12:30', end: '13:30' });
                                    } else {
                                        setBreakTimes({ start: '', end: '' });
                                    }
                                }}
                            />
                            <Label htmlFor="standard-break" className="text-sm font-normal cursor-pointer">
                                Applica pausa standard (12:30 - 13:30)
                            </Label>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="break-start">Inizio Pausa</Label>
                                <Input id="break-start" type="time" value={breakTimes.start} onChange={e => setBreakTimes(p => ({...p, start: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="break-end">Fine Pausa</Label>
                                <Input id="break-end" type="time" value={breakTimes.end} onChange={e => setBreakTimes(p => ({...p, end: e.target.value}))} />
                            </div>
                        </div>
                    </div>
                    <ResponsiveDialogFooter>
                        <Button variant="outline" onClick={() => setIsAddBreakDialogOpen(false)}>Annulla</Button>
                        <Button onClick={handleAddBreakAndReload} disabled={isProcessingApprove}>Aggiungi Pausa</Button>
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
                        <ResponsiveDialogDescription>Inserisci gli orari o usa l'opzione standard.</ResponsiveDialogDescription>
                    </ResponsiveDialogHeader>
                    <div className="grid gap-4 py-4">
                         <div className="flex items-center space-x-2">
                            <Checkbox
                                id="standard-break-overtime"
                                checked={breakTimes.start === '12:30' && breakTimes.end === '13:30'}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        setBreakTimes({ start: '12:30', end: '13:30' });
                                    } else {
                                        setBreakTimes({ start: '', end: '' });
                                    }
                                }}
                            />
                            <Label htmlFor="standard-break-overtime" className="text-sm font-normal cursor-pointer">
                                Applica pausa standard (12:30 - 13:30)
                            </Label>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="overtime-break-start">Inizio Pausa</Label>
                                <Input id="overtime-break-start" type="time" value={breakTimes.start} onChange={e => setBreakTimes(p => ({...p, start: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="overtime-break-end">Fine Pausa</Label>
                                <Input id="overtime-break-end" type="time" value={breakTimes.end} onChange={e => setBreakTimes(p => ({...p, end: e.target.value}))} />
                            </div>
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
                                I turni in stato "sospeso" richiedono la tua attenzione. Puoi approvarli o rifiutarli. L'approvazione converte le timbrature in ore lavorate e, se necessario, ti permette di creare richieste di permesso o straordinario.
                            </p>
                        </div>
                         <div>
                            <h4 className="font-semibold mb-1">Turni di Recupero/Anticipo</h4>
                            <p className="text-muted-foreground">
                                Se un operatore timbra in un giorno non lavorativo e lo indica come "Recupero/Anticipo", vedrai una nota specifica nel riepilogo del turno (es. "Recupero di Lunedì"). Il calcolo delle ore ordinarie si baserà sul giorno originale, garantendo un conteggio corretto.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Gestione Pause</h4>
                            <p className="text-muted-foreground">
                               Se per un turno è prevista una pausa obbligatoria ma non è stata registrata, il sistema ti chiederà se vuoi aggiungerla manualmente prima di approvare.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Calcolo Ore Ordinarie</h4>
                            <p className="text-muted-foreground">
                                Il sistema arrotonda gli orari di entrata e uscita per calcolare le ore ordinarie, che scattano ogni mezz'ora. Nel dettaglio del turno, puoi vedere gli orari di riferimento usati per il calcolo tra parentesi.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Modifica e Aggiunta Manuale</h4>
                             <p className="text-muted-foreground">
                                Puoi modificare qualsiasi timbratura di un turno o aggiungere un intero turno manualmente, specificando anche se si tratta di un recupero, in caso di dimenticanze o errori da parte dell'operatore.
                            </p>
                        </div>
                    </div>
                </ResponsiveDialogContent>
            </ResponsiveDialog>
            
            <AlertDialog open={isCleanConfirmOpen} onOpenChange={setIsCleanConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confermi la pulizia del mese?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà tutte le timbrature, i turni straordinari, le note e le richieste di permesso per il mese di {format(currentMonth, 'MMMM yyyy', { locale: it })}. 
                            L'operazione è irreversibile.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCleanMonth} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Pulisci Mese
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
                <NoteDialogContent>
                    <NoteDialogHeader>
                        <NoteDialogTitle>Modifica Nota Giornaliera</NoteDialogTitle>
                        <NoteDialogDescription>
                            Aggiungi o modifica la nota per il giorno {editingNote ? format(editingNote.date, 'PPP', { locale: it }) : ''}.
                        </NoteDialogDescription>
                    </NoteDialogHeader>
                    <div className="py-4">
                        <Label htmlFor="note-content">Nota</Label>
                        <Input
                            id="note-content"
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            placeholder="Es: Assenza giustificata"
                        />
                    </div>
                    <NoteDialogFooter>
                        <Button variant="outline" onClick={() => setEditingNote(null)}>Annulla</Button>
                        <Button onClick={handleSaveNote}>Salva Nota</Button>
                    </NoteDialogFooter>
                </NoteDialogContent>
            </Dialog>

        </div>
    );
}
