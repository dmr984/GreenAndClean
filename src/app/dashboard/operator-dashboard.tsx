
'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Play, Square, History, Loader2, Eye, Pencil, PauseCircle, BedDouble, Stethoscope, AlertCircle, Circle, Send, Briefcase, PlusCircle, Info, MapPin, Settings, Calendar as CalendarIcon, AlertTriangle, Coffee, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useCollection, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, Timestamp, getDocs, doc, onSnapshot, writeBatch, updateDoc, limit } from 'firebase/firestore';
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
import { Label } from '@/components/ui/label';
import { useUser } from '@/hooks/use-user';
import { isSameDay, startOfDay, endOfDay, getDay, isWithinInterval, subDays, set, format, addMonths, subMonths, startOfMonth, endOfMonth, isAfter, isBefore } from 'date-fns';
import { it } from 'date-fns/locale';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter } from '@/components/ui/responsive-dialog';
import { isPublicHoliday } from '@/lib/holidays';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { processMonthlyData, calculateHours, getScheduleForDate } from '@/lib/calculations';

type ClockingEvent = {
  id: string;
  userId: string;
  type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
  timestamp: any;
  latitude?: number;
  longitude?: number;
  status: 'sospesa' | 'confermata' | 'rifiutata';
  viewedByOperator?: boolean;
  makeupOfDay?: string; // Changed to ISO date string 'YYYY-MM-DD'
  shiftId?: string;
  isAuto?: boolean;
  suggestedTime?: string | null;
  originalTime?: string | null;
  rectificationStatus?: 'in_approvazione' | 'approvata' | 'rifiutata' | null;
};

type Shift = {
  startTime: any;
  endTime: any;
  events: ClockingEvent[];
  workDuration?: string;
  hasUnread?: boolean;
};

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekDayLabels: Record<DayOfWeek, string> = { monday: 'Lunedì', tuesday: 'Martedì', wednesday: 'Mercoledì', thursday: 'Giovedì', friday: 'Venerdì', saturday: 'Sabato', sunday: 'Domenica' };


type DailySchedule = {
  totalHours?: number;
  startTime?: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  breakMinutes?: number;
};

type WorkSchedule = {
  [key in DayOfWeek]?: DailySchedule;
};

type Operator = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  requireGps?: boolean;
  workSchedule?: WorkSchedule;
};

type UserData = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'operator';
};

interface OperatorDashboardProps {
  user: UserData | null;
}

type LeaveStatus = {
  onLeave: boolean;
  type: 'ferie' | 'malattia' | null;
}

export function OperatorDashboard({ user: propUser }: OperatorDashboardProps) {
  const { user: hookUser, isLoading: isUserLoading } = useUser();
  const authUser = propUser || hookUser;
  const { toast } = useToast();
  const firestore = useFirestore();

  const checkRunRef = React.useRef(false);

  const [operator, setOperator] = useState<Operator | null>(null);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [isWorkDay, setIsWorkDay] = useState<boolean | null>(null);
  const [leaveStatus, setLeaveStatus] = useState<LeaveStatus>({ onLeave: false, type: null });

  const [unlockRequestSent, setUnlockRequestSent] = useState(false);
  const [isSubmittingUnlock, setIsSubmittingUnlock] = useState(false);

  const [isMakeupDialogOpen, setIsMakeupDialogOpen] = useState(false);
  const [makeupDay, setMakeupDay] = useState<Date | undefined>(undefined);

  const [canClockIn, setCanClockIn] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLocationHelpOpen, setIsLocationHelpOpen] = useState(false);
  const [suggestedTimes, setSuggestedTimes] = useState<Record<string, string>>({});
  const [isForgetClockInOpen, setIsForgetClockInOpen] = useState(false);
  const [forgottenStartTime, setForgottenStartTime] = useState("");
  const [forgottenDate, setForgottenDate] = useState<Date>(new Date());
  const [forgottenType, setForgottenType] = useState<'entrata' | 'uscita'>('entrata');
  const [isHistoryCorrection, setIsHistoryCorrection] = useState(false);
  const [correctingShiftId, setCorrectingShiftId] = useState<string | undefined>(undefined);

  const [isShiftCorrectionOpen, setIsShiftCorrectionOpen] = useState(false);
  const [correctingShift, setCorrectingShift] = useState<any>(null);
  const [suggestedEntryTime, setSuggestedEntryTime] = useState("");
  const [suggestedExitTime, setSuggestedExitTime] = useState("");

  const [summaryMonth, setSummaryMonth] = useState<Date>(new Date());
  const [monthlySummaryData, setMonthlySummaryData] = useState<{ timbrature: any[], requests: any[], straordinari: any[], dailyNotes: any[] }>({ timbrature: [], requests: [], straordinari: [], dailyNotes: [] });
  const [isLoadingMonthlySummary, setIsLoadingMonthlySummary] = useState(false);

  const fetchMonthlySummary = useCallback(async () => {
    if (!firestore || !authUser?.id || !summaryMonth) return;
    setIsLoadingMonthlySummary(true);

    const monthStart = startOfMonth(summaryMonth);
    const monthEnd = endOfMonth(summaryMonth);
    const queryStart = subMonths(monthStart, 1);
    const queryEnd = addMonths(monthEnd, 1);

    try {
      const timbratureQuery = query(
        collection(firestore, `app-users/${authUser.id}/timbrature`),
        where('timestamp', '>=', Timestamp.fromDate(queryStart)),
        where('timestamp', '<=', Timestamp.fromDate(queryEnd))
      );
      const requestsQuery = query(
        collection(firestore, `app-users/${authUser.id}/requests`),
        where('status', '==', 'approvato')
      );
      const straordinariQuery = query(
        collection(firestore, `app-users/${authUser.id}/straordinari`),
        where('date', '>=', Timestamp.fromDate(queryStart)),
        where('date', '<=', Timestamp.fromDate(queryEnd))
      );

      const [timbratureSnap, requestsSnap, straordinariSnap] = await Promise.all([
        getDocs(timbratureQuery),
        getDocs(requestsQuery),
        getDocs(straordinariQuery)
      ]);

      const timbratureData = timbratureSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const requestsData = requestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const straordinariData = straordinariSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      setMonthlySummaryData({
        timbrature: timbratureData,
        requests: requestsData,
        straordinari: straordinariData,
        dailyNotes: []
      });
    } catch (err) {
      console.error("Error fetching monthly summary data:", err);
    } finally {
      setIsLoadingMonthlySummary(false);
    }
  }, [firestore, authUser, summaryMonth]);

  useEffect(() => {
    fetchMonthlySummary();
  }, [fetchMonthlySummary]);

  const computedMonthlySummary = useMemo(() => {
    if (!operator || !summaryMonth) return null;
    try {
      return processMonthlyData(summaryMonth, operator as any, monthlySummaryData).monthlySummary;
    } catch (e) {
      console.error('processMonthlyData error:', e);
      return null;
    }
  }, [operator, summaryMonth, monthlySummaryData]);

  const [currentDate, setCurrentDate] = useState<Date | null>(null);


  const [showQuickClockConfirm, setShowQuickClockConfirm] = useState(false);
  const [showDeleteErrorConfirm, setShowDeleteErrorConfirm] = useState(false);
  const [pendingClockType, setPendingClockType] = useState<'entrata' | 'uscita' | null>(null);
  useEffect(() => {
    // Set date only on the client
    setCurrentDate(new Date());
  }, []);

  useEffect(() => {
    if (!firestore || !authUser?.id) {
      setOperator(null);
      setIsWorkDay(null);
      return;
    }

    const operatorDocRef = doc(firestore, 'app-users', authUser.id);
    const unsubscribe = onSnapshot(operatorDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const operatorData = { id: docSnap.id, ...docSnap.data() } as Operator;
        setOperator(operatorData);

        const today = new Date();
        const dayName = dayIndexToName[getDay(today)];
        const contractualHours = operatorData.workSchedule?.[dayName]?.totalHours || 0;
        // A day is a workday if it has contractual hours AND it's not a public holiday
        setIsWorkDay(contractualHours > 0 && !isPublicHoliday(today));

      } else {
        setOperator(null);
        setIsWorkDay(false);
      }
    });

    return () => unsubscribe();
  }, [firestore, authUser]);

  useEffect(() => {
    if (!firestore || !authUser?.id) return;
    if (checkRunRef.current) return;

    const checkAndVoidOpenShifts = async () => {
      checkRunRef.current = true;
      const todayStart = startOfDay(new Date());

      try {
        // Query for all events before today
        const q = query(
          collection(firestore, `app-users/${authUser.id}/timbrature`),
          where('timestamp', '<', todayStart),
          orderBy('timestamp', 'desc'),
          limit(20) // Check the last 20 events to find any missing exits
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        const events = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClockingEvent));
        const entrateSenzaUscita = events.filter(e => e.type === 'entrata' && !events.some(u => u.type === 'uscita' && u.shiftId === e.shiftId));

        for (const entrata of entrateSenzaUscita) {
          const eventDate = entrata.timestamp?.toDate ? entrata.timestamp.toDate() : new Date();
          const endOfEventDay = endOfDay(eventDate);

          const voidClockOut: Omit<ClockingEvent, 'id'> = {
            userId: authUser.id,
            type: 'uscita',
            timestamp: Timestamp.fromDate(endOfEventDay),
            latitude: 0,
            longitude: 0,
            status: 'sospesa',
            viewedByOperator: false,
            shiftId: entrata.shiftId,
            isAuto: true,
          };

          try {
            await addDoc(collection(firestore, `app-users/${authUser.id}/timbrature`), voidClockOut);
            toast({
              variant: 'destructive',
              title: 'Turno Annullato Automaticamente',
              description: `Non hai timbrato l'uscita il ${format(eventDate, 'dd/MM/yyyy')}. Il turno è stato annullato.`,
              duration: 10000,
            });
          } catch (error) {
            console.error("Failed to void open shift:", error);
          }
        }
      } catch (error) {
        console.error("Error checking voided open shifts:", error);
      }
    };

    checkAndVoidOpenShifts();

  }, [firestore, authUser, toast]);

  const [pendingVoidedShifts, setPendingVoidedShifts] = useState<ClockingEvent[]>([]);

  useEffect(() => {
    if (!firestore || !authUser?.id) return;
    const q = query(
      collection(firestore, `app-users/${authUser.id}/timbrature`),
      where('status', '==', 'sospesa'),
      where('isAuto', '==', true)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingVoidedShifts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClockingEvent)));
    }, (error) => {
      console.error("Error fetching pending voided shifts:", error);
    });
    return () => unsubscribe();
  }, [firestore, authUser]);



  const { todayTimestamp, tomorrowTimestamp } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = Timestamp.fromDate(today);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTs = Timestamp.fromDate(tomorrow);

    return { todayTimestamp: todayTs, tomorrowTimestamp: tomorrowTs };
  }, []);

  const clockingsQuery = useMemoFirebase(() => {
    if (!firestore || !operator?.id || !summaryMonth) return null;

    const startOfMonthDate = startOfMonth(summaryMonth);
    const endOfMonthDate = endOfMonth(summaryMonth);
    const startTs = Timestamp.fromDate(startOfMonthDate);
    const endTs = Timestamp.fromDate(endOfMonthDate);

    return query(
      collection(firestore, `app-users/${operator.id}/timbrature`),
      where('timestamp', '>=', startTs),
      where('timestamp', '<=', endTs),
      orderBy('timestamp', 'asc')
    );
  }, [firestore, operator, summaryMonth]);

  const todayClockingsQuery = useMemoFirebase(() => {
    if (!firestore || !operator?.id) return null;
    const todayStart = startOfDay(new Date());
    const todayTs = Timestamp.fromDate(todayStart);

    return query(
      collection(firestore, `app-users/${operator.id}/timbrature`),
      where('timestamp', '>=', todayTs),
      orderBy('timestamp', 'asc')
    );
  }, [firestore, operator]);

  useEffect(() => {
    if (!firestore || !operator?.id) return;

    const requestsQuery = query(
      collection(firestore, `app-users/${operator.id}/requests`),
      where('status', 'in', ['approvato', 'in_attesa'])
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const today = new Date();
      let onLeaveToday = false;
      let leaveType: LeaveStatus['type'] = null;
      let unlockRequestExists = false;

      snapshot.forEach(doc => {
        const request = doc.data();
        const startDate = request.startDate?.toDate ? request.startDate.toDate() : null;
        const endDate = request.endDate?.toDate ? request.endDate.toDate() : null;

        if (startDate && endDate && isWithinInterval(today, { start: startOfDay(startDate), end: endOfDay(endDate) })) {
          if (request.type === 'ferie' || request.type === 'malattia') {
            onLeaveToday = true;
            leaveType = request.type;
          }
          if (request.type === 'sblocco_timbratura' && request.status === 'in_attesa') {
            unlockRequestExists = true;
          }
        }
      });
      setLeaveStatus({ onLeave: onLeaveToday, type: leaveType });
      setUnlockRequestSent(unlockRequestExists);
    }, (error) => {
      console.error("Error fetching requests:", error);
    });

    return () => unsubscribe();
  }, [firestore, operator]);


  const { data: clockings, isLoading: isLoadingClockings } = useCollection<ClockingEvent>(clockingsQuery);
  const { data: todayClockings } = useCollection<ClockingEvent>(todayClockingsQuery);

  const lastEvent = useMemo(() => {
    const activeList = (todayClockings && todayClockings.length > 0) ? todayClockings : clockings;
    if (!activeList || activeList.length === 0) return null;
    return activeList[activeList.length - 1];
  }, [todayClockings, clockings]);

  const handleDismissVoidedWarning = async (eventId: string) => {
    if (!firestore || !authUser) return;
    const timeToSubmit = suggestedTimes[eventId];
    try {
      const docRef = doc(firestore, `app-users/${authUser.id}/timbrature`, eventId);
      const updates: any = { viewedByOperator: true };
      if (timeToSubmit) {
        updates.suggestedTime = timeToSubmit;
        updates.rectificationStatus = 'in_approvazione';
      }
      await updateDoc(docRef, updates);
      setSuggestedTimes(prev => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    } catch (error) {
      console.error("Error dismissing warning", error);
    }
  };

  const handleCancelRequest = async (event: ClockingEvent) => {
    if (!firestore || !authUser) return;
    try {
      if (event.isAuto && event.suggestedTime) {
        // It's a voided shift reply, reset it instead of deleting
        const docRef = doc(firestore, `app-users/${authUser.id}/timbrature`, event.id);
        await updateDoc(docRef, {
          viewedByOperator: false,
          suggestedTime: null
        });
      } else {
        // It's a manual request, delete it
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(firestore, `app-users/${authUser.id}/timbrature`, event.id));
      }
      toast({ title: "Richiesta Annullata", description: "La richiesta è stata rimossa correttamente." });
    } catch (error) {
      console.error("Error canceling request", error);
      toast({ title: "Errore", description: "Impossibile annullare la richiesta.", variant: "destructive" });
    }
  };


  const currentShiftInfo = useMemo(() => {
    const activeData = (todayClockings && todayClockings.length > 0) ? todayClockings : clockings;
    if (!activeData || activeData.length === 0) return null;

    const today = startOfDay(new Date());

    // Find events for today that are not 'confermata'
    const todayEvents = clockings.filter(e => {
      const eventDate = e.timestamp?.toDate();
      return eventDate && isSameDay(eventDate, today) && e.status === 'sospesa';
    });

    if (todayEvents.length === 0) return null;

    // Get the latest shiftId to display the current/most recent shift of today
    const latestEvent = [...todayEvents].sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0))[0];
    const shiftEvents = todayEvents.filter(e => e.shiftId === latestEvent.shiftId);

    const entry = shiftEvents.find(e => e.type === 'entrata');
    const exit = shiftEvents.find(e => e.type === 'uscita');

    if (!entry) return null;

    return {
      entry: entry.timestamp?.toDate ? format(entry.timestamp.toDate(), 'HH:mm') : '--:--',
      exit: (exit && exit.timestamp?.toDate) ? format(exit.timestamp.toDate(), 'HH:mm') : null
    };
  }, [clockings]);

  const groupedShifts = useMemo(() => {
    if (!clockings || clockings.length === 0) return [];

    const groups: Record<string, {
      date: Date;
      entry?: ClockingEvent;
      exit?: ClockingEvent;
      status: string;
      pauses: { start: ClockingEvent; end?: ClockingEvent }[];
    }> = {};

    clockings.forEach(event => {
      if (!event.shiftId) return;
      // Skip fully-rejected clockings (new insertion requests denied by admin)
      if (event.status === 'rifiutata' && !event.originalTime) return;
      if (!groups[event.shiftId]) {
        groups[event.shiftId] = {
          date: event.timestamp?.toDate() || new Date(),
          status: event.status,
          pauses: []
        };
      }
      if (event.type === 'entrata') groups[event.shiftId].entry = event;
      if (event.type === 'uscita') groups[event.shiftId].exit = event;
      if (event.type === 'pausa') {
        groups[event.shiftId].pauses.push({ start: event });
      }
      if (event.type === 'fine_pausa') {
        // Attach to the last open pause
        const pauses = groups[event.shiftId].pauses;
        const last = pauses[pauses.length - 1];
        if (last && !last.end) last.end = event;
      }

      // If any part is 'sospesa', the whole group shows as 'sospesa'
      if (event.status === 'sospesa') groups[event.shiftId].status = 'sospesa';
      // If both are confirmed, it's confirmed
      if (groups[event.shiftId].entry?.status === 'confermata' && (!groups[event.shiftId].exit || groups[event.shiftId].exit?.status === 'confermata')) {
        groups[event.shiftId].status = 'confermata';
      }
    });

    return Object.values(groups)
      // Remove groups where the only entry was a rejected insertion (no real clocking at all)
      .filter(g => g.entry || g.exit)
      .map(g => {
        // Keep only pauses that fall strictly within the shift's entry-exit window.
        // A pause is valid when:
        //   - its start  >= shift entry
        //   - its end    <= shift exit  (if both entry AND exit are known)
        const entryMs = g.entry?.timestamp?.toDate()?.getTime() ?? null;
        const exitMs  = g.exit?.timestamp?.toDate()?.getTime()  ?? null;

        g.pauses = g.pauses.filter(p => {
          const pStartMs = p.start.timestamp?.toDate()?.getTime() ?? null;
          const pEndMs   = p.end?.timestamp?.toDate()?.getTime()  ?? null;

          // Must start after (or at) entry
          if (entryMs !== null && pStartMs !== null && pStartMs < entryMs) return false;

          // If the shift already has an exit, the pause must end before (or at) exit
          if (exitMs !== null) {
            // If the pause end is known, it must be <= exit
            if (pEndMs !== null && pEndMs > exitMs) return false;
            // If the pause end is unknown (open pause) but exit is known, exclude the dangling pause
            if (pEndMs === null) return false;
          }

          return true;
        });

        return g;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [clockings]);

  useEffect(() => {
    const activeData = (todayClockings && todayClockings.length > 0) ? todayClockings : clockings;
    if (activeData && activeData.length > 0) {
      const lastEvent = [...activeData].pop();
      if (!lastEvent) {
        setIsClockedIn(false);
        return;
      }

      // If the absolute last event is an 'uscita' (even if pending/auto-voided), 
      // the operator is NOT clocked in.
      if (lastEvent.type === 'uscita') {
        setIsClockedIn(false);
      } else {
        const lastValidEvent = [...activeData].filter(e => e.status !== 'rifiutata').pop();
        if (lastValidEvent && (lastValidEvent.type === 'entrata' || lastValidEvent.type === 'fine_pausa')) {
          setIsClockedIn(true);
        } else {
          setIsClockedIn(false);
        }
      }
    } else {
      setIsClockedIn(false);
    }
  }, [todayClockings, clockings]);

  useEffect(() => {
    setCanClockIn(true);
  }, []);


  const getLocation = (): Promise<{ latitude: number, longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("La geolocalizzazione non è supportata da questo browser."));
        return;
      }

      setLocationError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          resolve(coords);
        },
        (error) => {
          let message = "Impossibile ottenere la posizione.";
          const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = "Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni del browser.";
              if (isIOS) {
                setIsLocationHelpOpen(true);
              }
              break;
            case error.POSITION_UNAVAILABLE:
              message = "Informazioni sulla posizione non disponibili.";
              break;
            case error.TIMEOUT:
              message = "La richiesta di geolocalizzazione è scaduta.";
              break;
          }
          setLocationError(message);
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const performClocking = async (type: 'entrata' | 'uscita', skipCheck = false, makeupDayInfo?: string) => {
    if (!firestore || !operator || isProcessing) return;

    // Safety check: if less than 5 minutes since last event, ask for confirmation
    if (!skipCheck && lastEvent && lastEvent.timestamp) {
      const lastTime = lastEvent.timestamp?.toDate ? lastEvent.timestamp.toDate() : null;
      if (lastTime) {
        const now = new Date();
        const diffMinutes = (now.getTime() - lastTime.getTime()) / (1000 * 60);

        if (diffMinutes < 5) {
          setPendingClockType(type);
          setShowQuickClockConfirm(true);
          return;
        }
      }
    }

    setIsProcessing(true);

    try {
      let currentLoc = { latitude: 0, longitude: 0 };
      if (operator.requireGps !== false) {
        currentLoc = await getLocation();
      }

      const timbraturaRef = collection(firestore, `app-users/${operator.id}/timbrature`);

      if (type === 'entrata') {
        const shiftId = doc(timbraturaRef).id; // Generate new ID for the new shift
        const newTimbratura: Omit<ClockingEvent, 'id'> = {
          userId: operator.id,
          type,
          timestamp: serverTimestamp(),
          status: 'sospesa' as const,
          latitude: currentLoc.latitude,
          longitude: currentLoc.longitude,
          viewedByOperator: true,
          shiftId: shiftId,
          ...(makeupDayInfo && { makeupOfDay: makeupDayInfo })
        };
        await addDoc(timbraturaRef, newTimbratura);

      } else if (type === 'uscita') {
        // Find the last open shift
        const q = query(
          collection(firestore, `app-users/${operator.id}/timbrature`),
          orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        const recentEvents = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClockingEvent));

        let openShift: ClockingEvent | undefined = undefined;

        for (const event of recentEvents) {
          if (event.type === 'entrata' && event.shiftId) {
            const isClosed = recentEvents.some(e => e.type === 'uscita' && e.shiftId === event.shiftId);
            if (!isClosed) {
              openShift = event;
              break;
            }
          }
        }

        if (!openShift || !openShift.shiftId) {
          toast({ title: 'Errore', description: 'Nessun turno di entrata aperto trovato a cui associare questa uscita.', variant: 'destructive' });
          throw new Error("No open shift found");
        }

        const newTimbratura: Omit<ClockingEvent, 'id'> = {
          userId: operator.id,
          type,
          timestamp: serverTimestamp(),
          status: 'sospesa' as const,
          latitude: currentLoc.latitude,
          longitude: currentLoc.longitude,
          viewedByOperator: true,
          shiftId: openShift.shiftId,
        };

        await addDoc(timbraturaRef, newTimbratura);
      }

      toast({
        title: "Successo!",
        description: `Timbratura di ${type.replace('_', ' ')} registrata correttamente. In attesa di approvazione.`,
      });

    } catch (error: any) {
      if (operator.requireGps !== false && (error.message.includes("Geolocalizzazione") || error.message.includes("location"))) {
        toast({
          variant: 'destructive',
          title: 'Errore di Geolocalizzazione',
          description: error.message || "Non è stato possibile ottenere la posizione.",
        });
      } else if (error.code === 'permission-denied') {
        const contextualError = new FirestorePermissionError({
          operation: 'create',
          path: `app-users/${operator.id}/timbrature`,
          requestResourceData: { type, makeupDayInfo }
        });
        errorEmitter.emit('permission-error', contextualError);
      } else {
        toast({
          variant: 'destructive',
          title: 'Errore di Timbratura',
          description: "Non è stato possibile registrare la timbratura.",
        });
      }
      // Re-throw to prevent dialog from closing on error
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }


  const handleDeleteError = async () => {
    if (!firestore || !operator || !lastEvent) return;

    try {
      await writeBatch(firestore).delete(doc(firestore, `app-users/${operator.id}/timbrature`, lastEvent.id)).commit();
      toast({
        title: "Errore eliminato",
        description: "L'ultima timbratura è stata rimossa correttamente.",
      });
      setShowDeleteErrorConfirm(false);
      setShowQuickClockConfirm(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: 'Impossibile eliminare la timbratura.',
      });
    }
  };

  const handleUnlockRequest = async () => {
    if (!firestore || !operator) return;

    setIsSubmittingUnlock(true);
    const today = new Date();
    const unlockRequestData = {
      userId: operator.id,
      type: 'sblocco_timbratura' as const,
      status: 'in_attesa' as const,
      startDate: Timestamp.fromDate(startOfDay(today)),
      endDate: Timestamp.fromDate(endOfDay(today)),
      createdAt: serverTimestamp(),
      viewedByOperator: true,
    };

    const requestsCollection = collection(firestore, `app-users/${operator.id}/requests`);

    try {
      await addDoc(requestsCollection, unlockRequestData);
      toast({
        title: 'Richiesta Inviata',
        description: "La tua richiesta di sblocco è stata inviata all'amministratore.",
      });
      setUnlockRequestSent(true);
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        const contextualError = new FirestorePermissionError({
          operation: 'create',
          path: requestsCollection.path,
          requestResourceData: unlockRequestData
        });
        errorEmitter.emit('permission-error', contextualError);
      } else {
        toast({
          title: 'Errore',
          description: 'Impossibile inviare la richiesta di sblocco.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmittingUnlock(false);
    }
  };

  const handleStartMakeupShift = async () => {
    if (!makeupDay) {
      toast({ title: "Data mancante", description: "Seleziona un giorno da recuperare.", variant: "destructive" });
      return;
    }
    try {
      await performClocking('entrata', false, format(makeupDay, 'yyyy-MM-dd'));
      setIsMakeupDialogOpen(false);
      setMakeupDay(undefined);
    } catch (error) {
      console.error("Makeup clock-in failed", error);
    }
  }

  const checkOverlap = (newDate: Date, type: 'entrata' | 'uscita', shiftIdToExclude?: string) => {
    return groupedShifts.some(shift => {
      // Skip current shift if we are updating it (e.g. adding exit to existing entry)
      if (shiftIdToExclude && (shift.entry?.shiftId === shiftIdToExclude || shift.exit?.shiftId === shiftIdToExclude)) return false;

      const entry = shift.entry?.timestamp?.toDate();
      const exit = shift.exit?.timestamp?.toDate();

      if (!entry) return false;

      if (exit) {
        // Check if newDate is between entry and exit
        return isWithinInterval(newDate, { start: entry, end: exit }) ||
          isSameDay(newDate, entry) && (isSameDay(newDate, exit)) &&
          (newDate >= entry && newDate <= exit);
      } else {
        // Open shift: check if newDate is after entry (assuming it's still ongoing)
        return isSameDay(newDate, entry) && newDate >= entry;
      }
    });
  }

  const getDefaultForgottenDate = useCallback(() => {
    const today = new Date();
    if (operator?.workSchedule) {
      const dayName = dayIndexToName[getDay(today)];
      const isContractualDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
      if (isContractualDay && !isPublicHoliday(today)) return today;
    } else {
      return today;
    }

    for (let i = 1; i <= 3; i++) {
      const d = subDays(today, i);
      if (operator?.workSchedule) {
        const dayName = dayIndexToName[getDay(d)];
        const isContractualDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
        if (isContractualDay && !isPublicHoliday(d)) return d;
      } else {
        return d;
      }
    }
    return today;
  }, [operator]);

  const openForgottenDialog = useCallback((type: 'entrata' | 'uscita') => {
    setForgottenType(type);
    setForgottenDate(getDefaultForgottenDate());
    setIsForgetClockInOpen(true);
  }, [getDefaultForgottenDate]);

  const handleHistoryCorrection = useCallback((date: Date, type: 'entrata' | 'uscita', shiftId?: string) => {
    setForgottenType(type);
    setForgottenDate(date);
    setCorrectingShiftId(shiftId);
    setIsHistoryCorrection(true);
    setForgottenStartTime("");
    setIsForgetClockInOpen(true);
  }, []);

  const handleHistoryShiftCorrection = (shift: any) => {
    setCorrectingShift(shift);
    
    // Pre-populate with existing values or empty string
    const entryTime = shift.entry?.timestamp ? format(shift.entry.timestamp.toDate(), 'HH:mm') : '';
    const exitTime = shift.exit?.timestamp ? format(shift.exit.timestamp.toDate(), 'HH:mm') : '';
    
    setSuggestedEntryTime(shift.entry?.suggestedTime || entryTime);
    setSuggestedExitTime(shift.exit?.suggestedTime || exitTime);
    setIsShiftCorrectionOpen(true);
  };

  const handleSaveShiftCorrection = async () => {
    const userId = authUser?.id || operator?.id;
    if (!firestore || !userId || !correctingShift || isProcessing) return;

    setIsProcessing(true);
    try {
      const timbraturaRef = collection(firestore, `app-users/${userId}/timbrature`);
      const shiftId = correctingShift.entry?.shiftId || correctingShift.exit?.shiftId || doc(timbraturaRef).id;

      // 1. Handle entry (entrata) event
      if (correctingShift.entry) {
        // Update existing entry
        const docRef = doc(firestore, `app-users/${userId}/timbrature`, correctingShift.entry.id);
        const originalTimeStr = correctingShift.entry.timestamp?.toDate()
          ? format(correctingShift.entry.timestamp.toDate(), 'HH:mm')
          : '';

        await updateDoc(docRef, {
          status: 'sospesa' as const,
          suggestedTime: suggestedEntryTime || null,
          originalTime: originalTimeStr,
          viewedByOperator: true,
          rectificationStatus: 'in_approvazione'
        });
      } else if (suggestedEntryTime) {
        // Create new entry
        const [hours, minutes] = suggestedEntryTime.split(':').map(Number);
        const eventTime = set(correctingShift.date, { hours, minutes, seconds: 0, milliseconds: 0 });

        const newEntry: Omit<ClockingEvent, 'id'> = {
          userId: userId,
          type: 'entrata',
          timestamp: Timestamp.fromDate(eventTime),
          status: 'sospesa' as const,
          latitude: 0,
          longitude: 0,
          viewedByOperator: true,
          shiftId: shiftId,
          isAuto: false,
          suggestedTime: suggestedEntryTime,
          originalTime: null,
          rectificationStatus: 'in_approvazione'
        };
        await addDoc(timbraturaRef, newEntry);
      }

      // 2. Handle exit (uscita) event
      if (correctingShift.exit) {
        // Update existing exit
        const docRef = doc(firestore, `app-users/${userId}/timbrature`, correctingShift.exit.id);
        const originalTimeStr = correctingShift.exit.timestamp?.toDate()
          ? format(correctingShift.exit.timestamp.toDate(), 'HH:mm')
          : '';

        await updateDoc(docRef, {
          status: 'sospesa' as const,
          suggestedTime: suggestedExitTime || null,
          originalTime: originalTimeStr,
          viewedByOperator: true,
          rectificationStatus: 'in_approvazione'
        });
      } else if (suggestedExitTime) {
        // Create new exit
        const [hours, minutes] = suggestedExitTime.split(':').map(Number);
        const eventTime = set(correctingShift.date, { hours, minutes, seconds: 0, milliseconds: 0 });

        const newExit: Omit<ClockingEvent, 'id'> = {
          userId: userId,
          type: 'uscita',
          timestamp: Timestamp.fromDate(eventTime),
          status: 'sospesa' as const,
          latitude: 0,
          longitude: 0,
          viewedByOperator: true,
          shiftId: shiftId,
          isAuto: false,
          suggestedTime: suggestedExitTime,
          originalTime: null,
          rectificationStatus: 'in_approvazione'
        };
        await addDoc(timbraturaRef, newExit);
      }

      toast({
        title: "Richiesta Inviata",
        description: "La richiesta di rettifica dell'intero turno è stata inviata all'amministratore.",
      });
      setIsShiftCorrectionOpen(false);
      setCorrectingShift(null);
    } catch (error) {
      console.error("Failed to save shift correction:", error);
      toast({
        title: "Errore",
        description: "Impossibile inviare la richiesta di rettifica.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleForgottenClockIn = async () => {
    if (!firestore || !operator || !forgottenStartTime || isProcessing) return;

    const [hours, minutes] = forgottenStartTime.split(':').map(Number);
    const eventTime = set(forgottenDate, { hours, minutes, seconds: 0, milliseconds: 0 });

    // Only check for overlaps on brand-new insertions, NOT on corrections of existing clockings.
    // When correcting an existing exit/entry the proposed time naturally falls within the same
    // shift window and would always trigger a false-positive overlap error.
    if (!isHistoryCorrection && checkOverlap(eventTime, forgottenType, correctingShiftId)) {
      toast({
        title: "Sovrapposizione Rilevata",
        description: "Non puoi inserire una timbratura che si sovrappone a un turno già esistente.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    try {
      const timbraturaRef = collection(firestore, `app-users/${operator.id}/timbrature`);

      let shiftIdToUse = correctingShiftId || doc(timbraturaRef).id;

      // If reporting an exit, try to find an open shift first on the SAME day (only if not a history correction!)
      if (!correctingShiftId && forgottenType === 'uscita') {
        const q = query(
          collection(firestore, `app-users/${operator.id}/timbrature`),
          where('timestamp', '>=', Timestamp.fromDate(startOfDay(forgottenDate))),
          where('timestamp', '<=', Timestamp.fromDate(endOfDay(forgottenDate))),
          orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        const events = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClockingEvent));

        for (const event of events) {
          if (event.type === 'entrata' && event.shiftId) {
            const isClosed = events.some(e => e.type === 'uscita' && e.shiftId === event.shiftId);
            if (!isClosed) {
              shiftIdToUse = event.shiftId;
              break;
            }
          }
        }
      }

      // Check if there is an existing event of this type for this shiftId
      const existingEvent = (correctingShiftId && clockings)
        ? clockings.find(c => c.shiftId === correctingShiftId && c.type === forgottenType)
        : null;

      if (existingEvent) {
        // Update existing event instead of creating a new one
        const docRef = doc(firestore, `app-users/${operator.id}/timbrature`, existingEvent.id);
        const originalTimeStr = existingEvent.timestamp?.toDate()
          ? format(existingEvent.timestamp.toDate(), 'HH:mm')
          : '';

        await updateDoc(docRef, {
          status: 'sospesa' as const,
          suggestedTime: forgottenStartTime,
          originalTime: originalTimeStr,
          viewedByOperator: true,
          rectificationStatus: 'in_approvazione'
        });
      } else {
        // Create a new event for missing clocking
        const newTimbratura: Omit<ClockingEvent, 'id'> = {
          userId: operator.id,
          type: forgottenType,
          timestamp: Timestamp.fromDate(eventTime),
          status: 'sospesa' as const,
          latitude: 0,
          longitude: 0,
          viewedByOperator: true,
          shiftId: shiftIdToUse,
          isAuto: false, // Explicitly manual now
          suggestedTime: forgottenStartTime,
          originalTime: null,
          rectificationStatus: 'in_approvazione'
        };
        await addDoc(timbraturaRef, newTimbratura);
      }

      toast({
        title: "Richiesta Inviata",
        description: "Richiesta inviata all'amministratore. A breve riceverai l'approvazione o meno della rettifica.",
      });
      setIsForgetClockInOpen(false);
      setForgottenStartTime("");
      setForgottenDate(new Date());
    } catch (error) {
      console.error("Forgotten clocking failed", error);
      toast({ title: "Errore", description: "Impossibile registrare la timbratura.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }

  const renderLeaveCard = () => {
    const Icon = leaveStatus.type === 'ferie' ? BedDouble : Stethoscope;
    const leaveTypeText = leaveStatus.type === 'ferie' ? 'Ferie' : 'Malattia';

    return (
      <Card className="border-yellow-500 bg-yellow-500/10 text-center">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-center gap-3">
            <Icon className="h-7 w-7 text-yellow-600" />
            <CardTitle className="text-2xl text-yellow-700">Oggi sei in {leaveTypeText}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-yellow-600">
            Il sistema di timbratura è bloccato.
          </p>
          <p className="text-sm text-yellow-700/80 mt-4">
            Se vuoi timbrare, annullerai il giorno di {leaveTypeText.toLowerCase()}. Fai la richiesta all'amministratore.
          </p>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            size="lg"
            disabled={unlockRequestSent || isSubmittingUnlock}
            onClick={handleUnlockRequest}
          >
            {isSubmittingUnlock ? <Loader2 className="animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
            {unlockRequestSent ? 'Richiesta Inviata' : 'Richiedi Sblocco Timbratura'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isUserLoading || operator === null || isWorkDay === null || !currentDate) {
    return <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    </div>;
  }

  const calendarDisabledMatcher = (day: Date) => {
    if (operator?.workSchedule) {
      const dayName = dayIndexToName[getDay(day)];
      const isContractualDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
      if (!isContractualDay && !isPublicHoliday(day)) return true;
    }
    return false;
  };

  const forgottenCalendarDisabledMatcher = (day: Date) => {
    const today = new Date();
    if (isAfter(startOfDay(day), startOfDay(today))) return true;

    const limitDate = startOfDay(subDays(today, 3));
    if (isBefore(startOfDay(day), limitDate)) return true;

    if (operator?.workSchedule) {
      const dayName = dayIndexToName[getDay(day)];
      const isContractualDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
      if (!isContractualDay && !isPublicHoliday(day)) return true;
    }
    return false;
  };

  const isShiftRectifiable = (shiftIndex: number) => {
    return shiftIndex < 3;
  };


  const renderMainContent = () => {
    const uniqueVoidedShifts: ClockingEvent[] = [];
    const shiftsSeen = new Set<string>();

    pendingVoidedShifts.forEach(shift => {
      const isPendingAdmin = shift.viewedByOperator && shift.suggestedTime;
      if (isPendingAdmin && shift.shiftId) {
        uniqueVoidedShifts.push(shift);
        shiftsSeen.add(shift.shiftId);
      }
    });

    pendingVoidedShifts.forEach(shift => {
      const isPendingAdmin = shift.viewedByOperator && shift.suggestedTime;
      if (!isPendingAdmin) {
        if (!shift.shiftId || !shiftsSeen.has(shift.shiftId)) {
          uniqueVoidedShifts.push(shift);
          if (shift.shiftId) {
            shiftsSeen.add(shift.shiftId);
          }
        }
      }
    });

    const voidedWarnings = uniqueVoidedShifts.map(voidedShift => {
      const isPendingAdmin = voidedShift.viewedByOperator && voidedShift.suggestedTime;
      return (
        <Card key={voidedShift.id} className={cn("border-red-500 mb-6 animate-in fade-in slide-in-from-top-4 duration-500", isPendingAdmin ? "bg-orange-50 dark:bg-orange-950/20 border-orange-500" : "bg-red-50 dark:bg-red-950/20")}>
          <CardHeader className="pb-2">
            <CardTitle className={cn("flex items-center gap-2 text-lg", isPendingAdmin ? "text-orange-700 dark:text-orange-400" : "text-red-700 dark:text-red-400")}>
              <AlertTriangle className="h-5 w-5" />
              {isPendingAdmin ? "Richiesta in Approvazione" : "Turno Non Chiuso"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            {isPendingAdmin ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-orange-600 dark:text-orange-300">
                  Hai suggerito l'orario <strong>{voidedShift.suggestedTime}</strong> per il giorno {format(voidedShift.timestamp?.toDate() || new Date(), 'dd/MM/yyyy')}.
                  <br />La richiesta è in attesa di approvazione.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit text-orange-700 border-orange-200 hover:bg-orange-100"
                  onClick={() => handleCancelRequest(voidedShift)}
                >
                  <Eye className="mr-2 h-4 w-4" /> Annulla e Correggi
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                  Il turno del giorno {format(voidedShift.timestamp?.toDate() || new Date(), 'dd/MM/yyyy')} risulta incompleto (manca la timbratura di uscita). Il sistema lo ha chiuso automaticamente.
                  <strong> Inserisci l'orario effettivo di uscita</strong> per inviare una richiesta di rettifica all'amministratore.
                </p>
                <div className="space-y-2 border-t pt-3">
                  <Label htmlFor={`suggested-time-${voidedShift.id}`} className="text-sm font-medium text-red-800 dark:text-red-300">
                    Inserisci l'orario effettivo in cui sei uscito:
                  </Label>
                  <div className="flex gap-2">
                    <input
                      id={`suggested-time-${voidedShift.id}`}
                      type="time"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={suggestedTimes[voidedShift.id] || ""}
                      onChange={(e) => setSuggestedTimes(prev => ({ ...prev, [voidedShift.id]: e.target.value }))}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
          {!isPendingAdmin && (
            <CardFooter>
              <Button
                variant="default"
                size="sm"
                className="w-full bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleDismissVoidedWarning(voidedShift.id)}
                disabled={!suggestedTimes[voidedShift.id]}
              >
                Invia Orario e Conferma
              </Button>
            </CardFooter>
          )}
        </Card>
      );
    });

    const pendingAlerts = groupedShifts.filter(s => s.status === 'sospesa').map((shift, idx) => {
      const isManual = shift.entry?.isAuto === false || shift.exit?.isAuto === false;
      const isReply = (shift.entry?.isAuto === true && !!shift.entry?.suggestedTime) || (shift.exit?.isAuto === true && !!shift.exit?.suggestedTime);

      // Only show alerts for things the user actually DID (manual entry or reply to a voided shift)
      if (!isManual && !isReply) return null;

      return (
        <Card key={idx} className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 mb-4 overflow-hidden">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold text-yellow-800 dark:text-yellow-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Richiesta in Approvazione
            </CardTitle>
            {isManual && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] uppercase font-bold text-yellow-700 hover:text-destructive hover:bg-yellow-100"
                onClick={async () => {
                  if (shift.entry?.isAuto === false) await handleCancelRequest(shift.entry);
                  if (shift.exit?.isAuto === false) await handleCancelRequest(shift.exit);
                }}
              >
                Annulla Richiesta
              </Button>
            )}
          </CardHeader>
          <CardContent className="py-2 px-4">
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              La tua richiesta di {isManual ? "inserimento manuale" : "correzione orario"} per il giorno <strong>{format(shift.date, 'dd/MM/yyyy')}</strong> è in attesa di verifica.
              <span className="ml-2 opacity-70">
                ({shift.entry ? (shift.entry.suggestedTime || (shift.entry.timestamp?.toDate ? format(shift.entry.timestamp.toDate(), 'HH:mm') : '--:--')) : '--:--'} - {shift.exit ? (shift.exit.suggestedTime || (shift.exit.timestamp?.toDate ? format(shift.exit.timestamp.toDate(), 'HH:mm') : '--:--')) : '--:--'})
              </span>
            </p>
          </CardContent>
        </Card>
      );
    });

    if (isClockedIn) {
      return (
        <>
          {voidedWarnings}
          {pendingAlerts}
          <Card className="overflow-hidden border-none shadow-xl bg-gradient-to-br from-card to-muted/30">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold tracking-tight">
                    Gestione Turno
                  </CardTitle>
                  <CardDescription>In servizio</CardDescription>
                </div>
                <Button variant="ghost" size="icon" className="ml-auto rounded-full hover:bg-primary/10" onClick={() => setIsHelpOpen(true)}>
                  <Info className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-6 py-6">
              <div className="text-center">
                <div className="text-lg font-semibold text-primary capitalize">
                  {format(currentDate, 'eeee, dd MMMM yyyy', { locale: it })}
                </div>
              </div>

              {currentShiftInfo && (
                <div className="w-full grid grid-cols-2 gap-4">
                  <div className="flex flex-col items-center p-4 bg-background rounded-2xl border shadow-sm transition-all">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-extrabold mb-1">Entrata</span>
                    <span className="text-3xl font-mono font-bold text-primary">{currentShiftInfo.entry}</span>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-background/50 rounded-2xl border border-dashed shadow-sm">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-extrabold mb-1">Uscita</span>
                    <span className="text-3xl font-mono font-bold text-muted-foreground/30">--:--</span>
                  </div>
                </div>
              )}

              {locationError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{locationError}</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/50 p-6 flex flex-col gap-3">
              <Button
                className="w-full h-14 text-lg font-bold transition-all active:scale-[0.98]"
                variant="destructive"
                disabled={isProcessing}
                onClick={() => performClocking('uscita')}
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <Square className="mr-2 h-6 w-6 fill-current" />}
                Termina Turno
              </Button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-1">
                <Button
                  className="w-full h-12 text-sm font-bold transition-all active:scale-[0.98] bg-amber-500 hover:bg-amber-600 text-white shadow-sm border-none flex items-center justify-center"
                  onClick={() => openForgottenDialog('entrata')}
                >
                  <AlertCircle className="mr-2 h-5 w-5 shrink-0" />
                  Timbratura Mancata
                </Button>

                <Button
                  className="w-full h-12 text-sm font-bold transition-all active:scale-[0.98] bg-sky-600 hover:bg-sky-700 text-white shadow-sm border-none flex items-center justify-center"
                  onClick={() => setIsMakeupDialogOpen(true)}
                >
                  <PlusCircle className="mr-2 h-5 w-5 shrink-0" />
                  Inizio Recupero Anticipo
                </Button>
              </div>
            </CardFooter>
          </Card>
        </>
      );
    }

    if (leaveStatus.onLeave) {
      return renderLeaveCard();
    }

    // Not clocked in, not on leave
    return (
      <>
        {voidedWarnings}
        {pendingAlerts}
        <Card className="overflow-hidden border-none shadow-xl bg-gradient-to-br from-card to-muted/30">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">Gestione Turno</CardTitle>
                <CardDescription>Fuori servizio</CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="ml-auto rounded-full hover:bg-primary/10" onClick={() => setIsHelpOpen(true)}>
                <Info className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-6 py-6">
            <div className="text-center">
              <div className="text-lg font-semibold text-muted-foreground capitalize">
                {format(currentDate, 'eeee, dd MMMM yyyy', { locale: it })}
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-4">
              <div className={cn(
                "flex flex-col items-center p-4 rounded-2xl border shadow-sm transition-all",
                currentShiftInfo?.entry ? "bg-background" : "bg-background/50 border-dashed"
              )}>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-extrabold mb-1">Entrata</span>
                <span className={cn(
                  "text-3xl font-mono font-bold",
                  currentShiftInfo?.entry ? "text-primary" : "text-muted-foreground/30"
                )}>
                  {currentShiftInfo?.entry || '--:--'}
                </span>
              </div>
              <div className={cn(
                "flex flex-col items-center p-4 rounded-2xl border shadow-sm transition-all",
                currentShiftInfo?.exit ? "bg-background" : "bg-background/50 border-dashed"
              )}>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-extrabold mb-1">Uscita</span>
                <span className={cn(
                  "text-3xl font-mono font-bold",
                  currentShiftInfo?.exit ? "text-primary" : "text-muted-foreground/30"
                )}>
                  {currentShiftInfo?.exit || '--:--'}
                </span>
              </div>
            </div>

            {locationError && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{locationError}</p>
              </div>
            )}

          </CardContent>
          <CardFooter className="bg-muted/50 p-6 flex flex-col gap-3">
            <Button
              className="w-full h-14 text-lg font-bold transition-all active:scale-[0.98] bg-[#22c55e] hover:bg-[#16a34a] text-white border-none shadow-md"
              size="lg"
              disabled={isProcessing}
              onClick={() => performClocking('entrata')}
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <Play className="mr-2 h-6 w-6 fill-current" />}
              Inizia Turno
            </Button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-1">
              <Button
                className="w-full h-12 text-sm font-bold transition-all active:scale-[0.98] bg-amber-500 hover:bg-amber-600 text-white shadow-sm border-none flex items-center justify-center"
                onClick={() => openForgottenDialog('entrata')}
              >
                <AlertCircle className="mr-2 h-5 w-5 shrink-0" />
                Timbratura Mancata
              </Button>

              <Button
                className="w-full h-12 text-sm font-bold transition-all active:scale-[0.98] bg-sky-600 hover:bg-sky-700 text-white shadow-sm border-none flex items-center justify-center"
                onClick={() => setIsMakeupDialogOpen(true)}
              >
                <PlusCircle className="mr-2 h-5 w-5 shrink-0" />
                Inizio Recupero Anticipo
              </Button>
            </div>
          </CardFooter>
        </Card>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo</h2>
      </div>

      {renderMainContent()}

      {/* Integrated Monthly Summary Section */}
      <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted/20 my-6">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSummaryMonth(prev => subMonths(prev, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold capitalize">
                Riepilogo {format(summaryMonth, 'MMMM yyyy', { locale: it })}
              </h3>
              {isLoadingMonthlySummary && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSummaryMonth(prev => addMonths(prev, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-background/80 border shadow-2xs">
              <span className="text-[10px] text-muted-foreground font-bold uppercase block">Giorni Lavorati</span>
              <span className="text-xl font-bold text-primary">{computedMonthlySummary?.ordinaryWorkedDays || 0} gg</span>
            </div>
            <div className="p-3 rounded-xl bg-background/80 border shadow-2xs">
              <span className="text-[10px] text-muted-foreground font-bold uppercase block">Ore Ordinarie</span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{(computedMonthlySummary?.ordinaryHours || 0).toFixed(1)} h</span>
            </div>
            <div className="p-3 rounded-xl bg-background/80 border shadow-2xs">
              <span className="text-[10px] text-muted-foreground font-bold uppercase block">Ore Straordinari</span>
              <span className="text-xl font-bold text-amber-600 dark:text-amber-400">{(computedMonthlySummary?.overtimeHours || 0).toFixed(1)} h</span>
            </div>
            <div className="p-3 rounded-xl bg-background/80 border shadow-2xs">
              <span className="text-[10px] text-muted-foreground font-bold uppercase block">Ferie</span>
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{computedMonthlySummary?.ferieDays || 0} gg ({(computedMonthlySummary?.ferieHours || 0).toFixed(1)}h)</span>
            </div>
            <div className="p-3 rounded-xl bg-background/80 border shadow-2xs">
              <span className="text-[10px] text-muted-foreground font-bold uppercase block">Permessi</span>
              <span className="text-xl font-bold text-purple-600 dark:text-purple-400">{(computedMonthlySummary?.permessoHours || 0).toFixed(1)} h</span>
              {((computedMonthlySummary?.recuperoStraordinariHours || 0) > 0 || computedMonthlySummary?.isPermessoDeductedFromOvertime) && (
                <span className="text-[9px] font-semibold text-purple-700 dark:text-purple-300 block mt-0.5 opacity-90">
                  (scalato dagli straordinari)
                </span>
              )}
            </div>
            <div className="p-3 rounded-xl bg-background/80 border shadow-2xs">
              <span className="text-[10px] text-muted-foreground font-bold uppercase block">Malattia</span>
              <span className="text-xl font-bold text-rose-600 dark:text-rose-400">{computedMonthlySummary?.malattiaDays || 0} gg</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-bold tracking-tight">Le tue timbrature di {format(summaryMonth, 'MMMM', { locale: it })}</h3>
        </div>

        <div className="space-y-3">
          {isLoadingClockings ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>
          ) : groupedShifts.length > 0 ? (
            groupedShifts.map((shift, idx) => (
              <Card key={idx} className="overflow-hidden border-none shadow-sm bg-background/50">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-extrabold tracking-widest">
                      {format(shift.date, 'eeee dd MMMM', { locale: it })}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        shift.status === 'confermata' ? 'secondary' :
                          shift.status === 'rifiutata' ? 'destructive' : 'default'
                      } className={cn(
                        "text-[9px] px-1.5 py-0",
                        shift.status === 'sospesa' && "bg-yellow-500 hover:bg-yellow-600 text-white"
                      )}>
                        {shift.status}
                      </Badge>
                      {shift.status === 'sospesa' && isShiftRectifiable(idx) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 px-2 py-0 text-[10px] border-amber-600 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-500 dark:text-amber-500 dark:hover:bg-amber-950/20 font-bold uppercase"
                          onClick={() => handleHistoryShiftCorrection(shift)}
                        >
                          Rettifica
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight">Inizio</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-mono font-bold">
                            {shift.entry
                              ? (shift.entry.status === 'sospesa' && shift.entry.suggestedTime && !shift.entry.originalTime
                                ? '--:--'
                                : (shift.entry.status === 'sospesa' && shift.entry.originalTime
                                  ? shift.entry.originalTime
                                  : format(shift.entry.timestamp?.toDate() || new Date(), 'HH:mm')
                                )
                              )
                              : '--:--'}
                          </span>
                          {shift.entry?.suggestedTime && (
                            <span className="text-[10px] font-mono text-amber-600 font-bold">
                              ({shift.entry.suggestedTime})
                            </span>
                          )}
                        </div>
                        {(shift.entry?.rectificationStatus === 'in_approvazione' || (!shift.entry?.rectificationStatus && shift.entry?.suggestedTime)) && (
                          <span className="text-[9px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold mt-1 w-fit">Richiesta in approvazione</span>
                        )}
                        {shift.entry?.rectificationStatus === 'approvata' && (
                          <span className="text-[9px] text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded font-bold mt-1 w-fit flex flex-col">
                            <span>Richiesta approvata</span>
                            {shift.entry.originalTime && (
                              <span className="text-[9px] text-muted-foreground font-mono font-medium">Orario timbrato: {shift.entry.originalTime}</span>
                            )}
                          </span>
                        )}
                        {shift.entry?.rectificationStatus === 'rifiutata' && (
                          <span className="text-[9px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded font-bold mt-1 w-fit">Richiesta non approvata</span>
                        )}
                      </div>
                      <div className="h-8 w-px bg-border/50" />
                      <div className="flex flex-col">
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight">Fine</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-mono font-bold">
                            {shift.exit
                              ? (shift.exit.status === 'sospesa' && shift.exit.suggestedTime && !shift.exit.originalTime
                                ? '--:--'
                                : (shift.exit.status === 'sospesa' && shift.exit.originalTime
                                  ? shift.exit.originalTime
                                  : format(shift.exit.timestamp?.toDate() || new Date(), 'HH:mm')
                                )
                              )
                              : '--:--'}
                          </span>
                          {shift.exit?.suggestedTime && (
                            <span className="text-[10px] font-mono text-amber-600 font-bold">
                              ({shift.exit.suggestedTime})
                            </span>
                          )}
                        </div>
                        {(shift.exit?.rectificationStatus === 'in_approvazione' || (!shift.exit?.rectificationStatus && shift.exit?.suggestedTime)) && (
                          <span className="text-[9px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold mt-1 w-fit">Richiesta in approvazione</span>
                        )}
                        {shift.exit?.rectificationStatus === 'approvata' && (
                          <span className="text-[9px] text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded font-bold mt-1 w-fit flex flex-col">
                            <span>Richiesta approvata</span>
                            {shift.exit.originalTime && (
                              <span className="text-[9px] text-muted-foreground font-mono font-medium">Orario timbrato: {shift.exit.originalTime}</span>
                            )}
                          </span>
                        )}
                        {shift.exit?.rectificationStatus === 'rifiutata' && (
                          <span className="text-[9px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded font-bold mt-1 w-fit">Richiesta non approvata</span>
                        )}
                      </div>
                    </div>

                    {shift.status === 'sospesa' && (shift.entry?.isAuto === false || shift.exit?.isAuto === false) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          if (shift.entry?.isAuto === false) await handleCancelRequest(shift.entry);
                          if (shift.exit?.isAuto === false) await handleCancelRequest(shift.exit);
                        }}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Pauses row — shown only when at least one pause exists */}
                  {shift.pauses.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight block mb-1.5">Pause</span>
                      <div className="flex flex-wrap gap-2">
                        {shift.pauses.map((p, pi) => {
                          const startTs = p.start.timestamp?.toDate();
                          const endTs = p.end?.timestamp?.toDate();
                          const durationMin = startTs && endTs
                            ? Math.round((endTs.getTime() - startTs.getTime()) / 60000)
                            : null;
                          return (
                            <span
                              key={pi}
                              className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted/60 rounded px-2 py-0.5 text-muted-foreground"
                            >
                              <Coffee className="h-3 w-3 shrink-0" />
                              {startTs ? format(startTs, 'HH:mm') : '--:--'}
                              {' → '}
                              {endTs ? format(endTs, 'HH:mm') : '--:--'}
                              {durationMin !== null && (
                                <span className="text-[9px] opacity-70 ml-0.5">({durationMin} min)</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Daily details section */}
                  {(() => {
                    const daySchedule = getScheduleForDate(operator, shift.date);
                    const contractualHours = daySchedule?.totalHours || 0;
                    
                    const shiftEvents: any[] = [];
                    if (shift.entry) shiftEvents.push(shift.entry);
                    shift.pauses.forEach(p => {
                      if (p.start) shiftEvents.push(p.start);
                      if (p.end) shiftEvents.push(p.end);
                    });
                    if (shift.exit) shiftEvents.push(shift.exit);

                    const shiftRes = calculateHours(
                      { date: shift.date, events: shiftEvents },
                      daySchedule,
                      shift.entry?.ignoreContractualStart,
                      operator || undefined
                    );
                    const ordinaryH = shiftRes.ordinary;
                    const overtimeH = shiftRes.overtime;

                    return (
                      <div className="mt-3 pt-2 border-t border-border/30 grid grid-cols-3 sm:grid-cols-4 gap-2 text-[10px]">
                        <div>
                          <span className="text-muted-foreground block font-medium">Previste</span>
                          <span className="font-bold">{contractualHours > 0 ? `${contractualHours}h` : '0h'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block font-medium">Ordinarie</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{ordinaryH > 0 ? `${ordinaryH}h` : '0h'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block font-medium">Straordinari</span>
                          <span className="font-bold text-amber-600 dark:text-amber-400">{overtimeH > 0 ? `${overtimeH}h` : '0h'}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Card>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8 border border-dashed rounded-xl">
              Nessun turno registrato questo mese.
            </p>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ResponsiveDialog
        open={isForgetClockInOpen}
        onOpenChange={(open) => {
          setIsForgetClockInOpen(open);
          if (!open) {
            setIsHistoryCorrection(false);
            setCorrectingShiftId(undefined);
          }
        }}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Richiesta di Rettifica / Correzione</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {isHistoryCorrection ? (
                <span>
                  Suggerisci il nuovo orario per la timbratura di{' '}
                  <strong className="text-primary">{forgottenType === 'entrata' ? 'inizio' : 'fine'} turno</strong> di{' '}
                  <strong className="text-primary">{format(forgottenDate, 'eeee d MMMM', { locale: it })}</strong>.
                </span>
              ) : (
                <span>
                  Inserisci i dettagli corretti per la timbratura di entrata o uscita.
                </span>
              )}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="py-4 space-y-4">
            {!isHistoryCorrection && (
              <>
                <div className="space-y-2">
                  <Label>Giorno della Timbratura</Label>
                  <Calendar
                    mode="single"
                    selected={forgottenDate}
                    onSelect={(date) => date && setForgottenDate(date)}
                    disabled={forgottenCalendarDisabledMatcher}
                    className="rounded-md border"
                    locale={it}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo di Timbratura</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={forgottenType === 'entrata' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => setForgottenType('entrata')}
                    >
                      Inizio Turno
                    </Button>
                    <Button
                      variant={forgottenType === 'uscita' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => setForgottenType('uscita')}
                    >
                      Fine Turno
                    </Button>
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="forgotten-start-time">Orario Suggerito</Label>
              <input
                id="forgotten-start-time"
                type="time"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={forgottenStartTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForgottenStartTime(e.target.value)}
              />
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setIsForgetClockInOpen(false)}>Annulla</Button>
            <Button
              disabled={!forgottenStartTime || isProcessing}
              onClick={handleForgottenClockIn}
            >
              {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
              Conferma e Invia
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={isShiftCorrectionOpen}
        onOpenChange={(open) => {
          setIsShiftCorrectionOpen(open);
          if (!open) {
            setCorrectingShift(null);
          }
        }}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Rettifica Turno Completo</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Modifica gli orari di inizio e fine per il turno del{' '}
              <strong className="text-primary">
                {correctingShift ? format(correctingShift.date, 'eeee d MMMM', { locale: it }) : ''}
              </strong>.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="suggested-entry-time">Orario Inizio</Label>
                <input
                  id="suggested-entry-time"
                  type="time"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={suggestedEntryTime}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSuggestedEntryTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="suggested-exit-time">Orario Fine</Label>
                <input
                  id="suggested-exit-time"
                  type="time"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={suggestedExitTime}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSuggestedExitTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setIsShiftCorrectionOpen(false)}>Annulla</Button>
            <Button
              disabled={(!suggestedEntryTime && !suggestedExitTime) || isProcessing}
              onClick={handleSaveShiftCorrection}
            >
              {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
              Invia Rettifica
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ResponsiveDialog open={isMakeupDialogOpen} onOpenChange={setIsMakeupDialogOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Inizia Turno di Recupero</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Seleziona il giorno che vuoi recuperare o anticipare. Le ore lavorate verranno attribuite a quel giorno.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="py-4 space-y-4">
            <Label>Giorno da recuperare/anticipare</Label>
            <Calendar
              mode="single"
              selected={makeupDay}
              onSelect={setMakeupDay}
              className="rounded-md border"
              locale={it}
              disabled={calendarDisabledMatcher}
              month={currentDate || new Date()}
              onMonthChange={(month) => setCurrentDate(month)}
              fromMonth={subMonths(new Date(), 2)}
              toMonth={addMonths(new Date(), 2)}
            />
            {makeupDay && (
              <p className="text-sm text-center text-primary font-semibold pt-2">
                Giorno selezionato: {format(makeupDay, 'PPP', { locale: it })}
              </p>
            )}
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setIsMakeupDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleStartMakeupShift} disabled={!makeupDay}>Conferma e Inizia Turno</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ResponsiveDialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Guida alla Gestione del Turno</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Come utilizzare il sistema di timbratura e come vengono elaborati i turni.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="py-4 pr-4 space-y-4 text-sm overflow-y-auto max-h-[60vh]">
            <div>
              <h4 className="font-semibold mb-1">Inizio e Fine Turno</h4>
              <p className="text-muted-foreground">
                Usa il pulsante verde "Inizia Turno" per registrare la tua entrata per la giornata corrente. Al termine, premi "Termina Turno". L'uso di questa funzione implica il consenso alla raccolta dei dati di geolocalizzazione (GPS) al solo scopo di verificare la posizione al momento della timbratura. È possibile effettuare più turni distinti nella stessa giornata (es. mattina e pomeriggio) che verranno calcolati separatamente.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Turno di Recupero o Straordinario</h4>
              <p className="text-muted-foreground">
                Se devi recuperare un giorno o fare straordinari in un giorno non lavorativo, usa il pulsante "Inizia Recupero" e seleziona dal calendario il giorno che stai compensando, oppure timbra normalmente con "Inizia Turno" per registrare ore extra.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Rettifiche e Turno in Corso</h4>
              <p className="text-muted-foreground">
                Se richiedi una rettifica (correzione d'orario) per un turno ancora in corso (es. correzione dell'orario di entrata prima di aver effettuato l'uscita), l'approvazione della rettifica da parte dell'amministratore aggiornerà l'orario senza confermare prematuramente il turno. Il turno rimarrà attivo ("In Corso") fino a quando non effettuerai l'uscita.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Gestione delle Pause</h4>
              <p className="text-muted-foreground">
                Non devi timbrare l'inizio o la fine della pausa. La durata della pausa viene gestita dall'amministratore in fase di approvazione del turno, anche in base al tipo di contratto. Qualsiasi variazione sarà concordata con l'amministrazione e potrà essere soggetta a correzioni.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Dettaglio delle Timbrature nei Riepiloghi</h4>
              <p className="text-muted-foreground">
                Tutti i riepiloghi mensili, le anteprime di stampa e i report PDF scaricabili mostrano ora il dettaglio completo e analitico di ciascuna timbratura (orari precisi di entrata, uscita e pause) con eventuali orari di riferimento calcolati dall'amministrazione.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Come vengono calcolate le ore</h4>
              <p className="text-muted-foreground">
                Il sistema arrotonda gli orari di entrata e uscita per calcolare le ore ordinarie, che scattano ogni mezz'ora.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Stato delle Timbrature</h4>
              <p className="text-muted-foreground">
                Ogni timbratura viene inviata per l'approvazione. Nel riepilogo giornaliero, puoi vedere lo stato: <Badge variant="default" className="bg-yellow-500 text-white">sospesa</Badge>, <Badge variant="secondary">confermata</Badge>, o <Badge variant="destructive">rifiutata</Badge>. Se ci sono timbrature rifiutate su una giornata, le ore dei turni regolarmente confermati nella stessa giornata verranno comunque conteggiate e pagate correttamente.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Timbratura Bloccata</h4>
              <p className="text-muted-foreground">
                Se sei in ferie o malattia, il sistema di timbratura sarà bloccato. Puoi inviare una <span className="font-bold">Richiesta di Sblocco</span> all'amministratore se hai bisogno di timbrare.
              </p>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ResponsiveDialog open={isLocationHelpOpen} onOpenChange={setIsLocationHelpOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /> Abilita Geolocalizzazione su iPhone</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Per timbrare, l'app ha bisogno di accedere alla tua posizione. Segui questi passaggi per abilitarla.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="py-4 pr-4 space-y-4 text-sm overflow-y-auto max-h-[60vh]">
            <div>
              <h4 className="font-semibold mb-1">Passaggio 1: Impostazioni Generali</h4>
              <p className="text-muted-foreground">
                Vai su <span className='font-bold'>Impostazioni</span> &gt; <span className='font-bold'>Privacy e Sicurezza</span> &gt; <span className='font-bold'>Localizzazione</span> e assicurati che la levetta <span className='font-bold'>"Localizzazione"</span> sia attiva.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Passaggio 2: Impostazioni per Safari</h4>
              <p className="text-muted-foreground">
                Scorri in basso fino a trovare <span className='font-bold'>Safari</span> (o il browser che usi), toccalo, poi vai su <span className='font-bold'>Posizione</span> e seleziona <span className='font-bold'>"Mentre usi l'app"</span>.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Passaggio 3: Ricarica l'App</h4>
              <p className="text-muted-foreground">
                Chiudi e riapri l'app dalla tua schermata Home. Ora dovresti essere in grado di timbrare.
              </p>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Quick Clocking Confirmation */}
      <AlertDialog open={showQuickClockConfirm} onOpenChange={setShowQuickClockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Conferma Timbratura Rapida
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sono passati meno di 5 minuti dall'ultima azione. Sei sicuro di voler registrare questa {pendingClockType === 'entrata' ? 'entrata' : 'uscita'}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteErrorConfirm(true)}>No, ho sbagliato</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingClockType) performClocking(pendingClockType, true);
              setShowQuickClockConfirm(false);
            }}>Sì, conferma</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Previous Error Confirmation */}
      <AlertDialog open={showDeleteErrorConfirm} onOpenChange={setShowDeleteErrorConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vuoi eliminare l'errore?</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi eliminare l'ultima timbratura effettuata ({lastEvent ? format(lastEvent.timestamp.toDate(), 'HH:mm') : ''}) perché è stata un errore?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, lascia così</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteError}>Sì, elimina errore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


