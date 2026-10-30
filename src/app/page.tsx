'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getDb } from '@/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
  subDays,
  addMonths,
  subMonths,
  isSameDay,
  isBefore,
  set,
  isSameMonth,
  parse,
} from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar as CalendarIcon,
  Filter,
  User,
  ArrowRight,
  Sun,
  Flame,
  HeartPulse,
  Briefcase,
  ShieldCheck,
  TrendingDown,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  Sparkles,
  Banknote,
} from 'lucide-react';
import { processMonthlyData, getScheduleForDate, calculateHours, getReferenceTimes } from '@/lib/calculations';

interface Operator {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  workSchedule?: any;
  employmentStartDate?: any;
  showInMonitor?: boolean;
  hourlyRate?: number;
  fixedSalary?: number;
  salaryType?: 'hourly' | 'fixed';
}

interface TimbraturaEvent {
  id: string;
  userId: string;
  type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
  timestamp: any;
  status: 'sospesa' | 'confermata' | 'rifiutata';
  approvedOrdinaryHours?: number;
  approvedOvertimeHours?: number;
  shiftId?: string;
  isAuto?: boolean;
  suggestedTime?: string | null;
  originalTime?: string | null;
  rectificationStatus?: 'in_approvazione' | 'approvata' | 'rifiutata' | string | null;
  isRectified?: boolean;
  makeupOfDay?: string | null;
}

export interface SubShiftInfo {
  shiftId?: string;
  entryTime: string | null;
  exitTime: string | null;
  refStartTime: string | null;
  refEndTime: string | null;
  pauseTime: string;
  pauseDetail: string | null;
  ordinaryHours: number;
  overtimeHours: number;
  totalHours: number;
  status: 'confermato' | 'in_attesa' | 'in_servizio';
  isMakeupShift?: boolean;
  makeupForDayFormatted?: string | null;
  isRecoveredDay?: boolean;
  recoveredOnDateFormatted?: string | null;
}

interface DayShiftRow {
  operator: Operator;
  entryTime: string | null;
  exitTime: string | null;
  refStartTime: string | null;
  refEndTime: string | null;
  pauseTime: string;
  pauseDetail: string | null;
  schedText: string | null;
  pausesText: string | null;
  status: 'confermato' | 'in_attesa' | 'in_servizio' | 'non_timbrato' | 'assente';
  ordinaryHours: number;
  overtimeHours: number;
  totalHours: number;
  isEarlyExit: boolean;
  earlyExitText?: string;
  isLateEntry: boolean;
  lateEntryText?: string;
  requests: any[];
  isEntryAuto?: boolean;
  isExitAuto?: boolean;
  isEntryRectified?: boolean;
  isExitRectified?: boolean;
  hasDimenticanza?: boolean;
  hasRettifica?: boolean;
  isMakeupShift?: boolean;
  makeupForDayFormatted?: string | null;
  isRecoveredDay?: boolean;
  recoveredOnDateFormatted?: string | null;
  shifts?: SubShiftInfo[];
}

function groupEventsIntoShifts(
  events: TimbraturaEvent[],
  op: Operator,
  targetDate: Date,
  isRecoveredDay: boolean = false
): SubShiftInfo[] {
  if (!events || events.length === 0) return [];

  const groupsMap = new Map<string, TimbraturaEvent[]>();
  const unassigned: TimbraturaEvent[] = [];

  events.forEach((ev) => {
    if (ev.shiftId) {
      if (!groupsMap.has(ev.shiftId)) {
        groupsMap.set(ev.shiftId, []);
      }
      groupsMap.get(ev.shiftId)!.push(ev);
    } else {
      unassigned.push(ev);
    }
  });

  if (unassigned.length > 0) {
    unassigned.sort((a, b) => {
      const tA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
      const tB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
      return tA - tB;
    });

    let current: TimbraturaEvent[] = [];
    unassigned.forEach((ev) => {
      if (ev.type === 'entrata' && current.length > 0) {
        groupsMap.set(`unassigned_${current[0].id || Math.random()}`, current);
        current = [ev];
      } else {
        current.push(ev);
      }
    });
    if (current.length > 0) {
      groupsMap.set(`unassigned_${current[0].id || Math.random()}`, current);
    }
  }

  if (groupsMap.size === 0 && events.length > 0) {
    groupsMap.set('default', events);
  }

  const sortedGroups = Array.from(groupsMap.values()).sort((gA, gB) => {
    const minA = Math.min(...gA.map((e) => (e.timestamp?.toDate ? e.timestamp.toDate().getTime() : 0)));
    const minB = Math.min(...gB.map((e) => (e.timestamp?.toDate ? e.timestamp.toDate().getTime() : 0)));
    return minA - minB;
  });

  const shifts: SubShiftInfo[] = [];

  for (const group of sortedGroups) {
    const entry = group.find((e) => e.type === 'entrata');
    const exit = group.filter((e) => e.type === 'uscita').pop();

    if (!entry && !exit) continue;

    const isPastDay = isBefore(startOfDay(targetDate), startOfDay(new Date()));
    const isToday = isSameDay(targetDate, new Date());

    let entryTime: string | null = null;
    let exitTime: string | null = null;
    if (entry?.timestamp?.toDate) {
      entryTime = format(entry.timestamp.toDate(), 'HH:mm');
    }
    if (exit?.timestamp?.toDate) {
      exitTime = format(exit.timestamp.toDate(), 'HH:mm');
    } else if (entry && !exit && isPastDay) {
      exitTime = '23:59';
    }

    const { refStartTime, refEndTime } = getReferenceTimes(op as any, targetDate, entry, exit);

    const sortedEvs = [...group].sort((a, b) => {
      const tA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
      const tB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
      return tA - tB;
    });

    let pauseMinutes = 0;
    const pauseIntervals: string[] = [];
    let currentPauseStart: Date | null = null;

    for (const ev of sortedEvs) {
      if (ev.type === 'pausa' && ev.timestamp?.toDate) {
        currentPauseStart = ev.timestamp.toDate();
      } else if (ev.type === 'fine_pausa' && currentPauseStart && ev.timestamp?.toDate) {
        const pEnd = ev.timestamp.toDate();
        const diff = Math.round((pEnd.getTime() - currentPauseStart.getTime()) / 60000);
        pauseMinutes += diff;
        pauseIntervals.push(`${format(currentPauseStart, 'HH:mm')}-${format(pEnd, 'HH:mm')}`);
        currentPauseStart = null;
      }
    }

    const pauseTime = pauseMinutes > 0 ? `${pauseMinutes}m` : (currentPauseStart ? 'In pausa' : '--');
    const pauseDetail = pauseIntervals.length > 0 ? pauseIntervals[0] : null;

    // Se il turno contiene eventi rifiutati, è un turno rifiutato: non deve apparire
    if (group.some((e) => e.status === 'rifiutata')) {
      continue;
    }

    const isConfirmed = isRecoveredDay || Boolean(
      entry && exit &&
      (entry.status === 'confermata' || exit.status === 'confermata') &&
      entry.status !== 'sospesa' && exit.status !== 'sospesa' &&
      entry.status !== 'rifiutata' && exit.status !== 'rifiutata'
    );

    let status: 'confermato' | 'in_attesa' | 'in_servizio' = 'in_attesa';
    if (isRecoveredDay || isConfirmed) {
      status = 'confermato';
    } else if (entry && !exit && isToday) {
      status = 'in_servizio';
    }

    // Devono apparire soltanto i turni approvati/confermati (o in servizio oggi se attivo)
    if (status !== 'confermato' && status !== 'in_servizio') {
      continue;
    }

    let ordinaryHours = 0;
    let overtimeHours = 0;
    if (entry?.approvedOrdinaryHours !== undefined || entry?.approvedOvertimeHours !== undefined) {
      ordinaryHours = entry.approvedOrdinaryHours || 0;
      overtimeHours = entry.approvedOvertimeHours || 0;
    } else if (entry && exit) {
      const daySchedule = getScheduleForDate(op as any, targetDate);
      const calc = calculateHours({ date: targetDate, events: group as any }, daySchedule, false, op as any);
      ordinaryHours = calc.ordinary;
      overtimeHours = calc.overtime;
    }

    const isMakeupShift = !isRecoveredDay && Boolean(entry?.makeupOfDay);
    let makeupForDayFormatted: string | null = null;
    if (isMakeupShift && entry?.makeupOfDay) {
      try {
        makeupForDayFormatted = format(parse(entry.makeupOfDay, 'yyyy-MM-dd', new Date()), 'd MMMM', { locale: it });
      } catch (e) {}
    }

    let recoveredOnDateFormatted: string | null = null;
    if (isRecoveredDay && entry?.timestamp?.toDate) {
      recoveredOnDateFormatted = format(entry.timestamp.toDate(), 'd MMMM', { locale: it });
    }

    shifts.push({
      shiftId: entry?.shiftId || exit?.shiftId,
      entryTime,
      exitTime,
      refStartTime,
      refEndTime,
      pauseTime,
      pauseDetail,
      ordinaryHours,
      overtimeHours,
      totalHours: ordinaryHours + overtimeHours,
      status,
      isMakeupShift,
      makeupForDayFormatted,
      isRecoveredDay,
      recoveredOnDateFormatted,
    });
  }

  return shifts;
}

export default function BossMonitorApp() {
  // Session / Access
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [accessCode, setAccessCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Selected Day for All Operators Overview
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_servizio' | 'confermato' | 'in_attesa' | 'non_timbrato'>('all');

  // Operators List
  const [operators, setOperators] = useState<Operator[]>([]);
  const [isLoadingOperators, setIsLoadingOperators] = useState(true);

  // Clockings by operator for the selected date
  const [dateClockings, setDateClockings] = useState<Record<string, TimbraturaEvent[]>>({});
  const [dateRecoveredClockings, setDateRecoveredClockings] = useState<Record<string, TimbraturaEvent[]>>({});
  const [dateRequests, setDateRequests] = useState<Record<string, any[]>>({});
  const [isLoadingClockings, setIsLoadingClockings] = useState(false);

  // Selected Operator for Monthly Detail View
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [detailMonth, setDetailMonth] = useState<Date>(new Date());
  const [detailEvents, setDetailEvents] = useState<TimbraturaEvent[]>([]);
  const [detailRecoveredEvents, setDetailRecoveredEvents] = useState<TimbraturaEvent[]>([]);
  const [detailRequests, setDetailRequests] = useState<any[]>([]);
  const [detailOvertimeShifts, setDetailOvertimeShifts] = useState<any[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Check persistent session in localStorage
  useEffect(() => {
    try {
      const savedAuth = localStorage.getItem('titolare_monitor_auth');
      if (savedAuth === 'true') {
        setIsAuthenticated(true);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = accessCode.trim().toLowerCase();
    if (!clean) {
      setAuthError('Inserisci il codice di accesso.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);

    try {
      const db = getDb();
      let dynamicBossPin: string | null = null;
      try {
        const monitorSnap = await getDoc(doc(db, 'settings', 'monitor'));
        if (monitorSnap.exists() && monitorSnap.data()?.bossPin) {
          dynamicBossPin = String(monitorSnap.data().bossPin).trim().toLowerCase();
        }
      } catch (e) {
        console.warn('Errore lettura settings monitor:', e);
      }

      // Se il PIN è configurato in GreenAndClean, accetta SOLO quel PIN esatto.
      // Se non è mai stato configurato un PIN, accetta '1234' come default iniziale.
      const isPinValid = dynamicBossPin ? (clean === dynamicBossPin) : (clean === '1234');

      if (isPinValid) {
        setIsAuthenticated(true);
        localStorage.setItem('titolare_monitor_auth', 'true');
        setAuthLoading(false);
        return;
      }

      // Controllo app-users solo per utenti con ruolo admin
      const q = query(collection(db, 'app-users'), where('username', '==', accessCode.trim()), where('role', '==', 'admin'));
      const snap = await getDocs(q);

      if (!snap.empty) {
        setIsAuthenticated(true);
        localStorage.setItem('titolare_monitor_auth', 'true');
        setAuthLoading(false);
        return;
      }

      setAuthError('Codice non riconosciuto. Verifica il codice e riprova.');
    } catch (err) {
      console.error(err);
      setAuthError('Errore di connessione. Riprova tra poco.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('titolare_monitor_auth');
    setIsAuthenticated(false);
    setSelectedOperator(null);
  };

  // 1. Fetch ALL operators from Firestore (filtrando quelli nascosti da GreenAndClean)
  useEffect(() => {
    if (!isAuthenticated) return;
    const db = getDb();
    setIsLoadingOperators(true);

    const q = query(collection(db, 'app-users'), where('role', '==', 'operator'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Operator))
          .filter((op: any) => op.showInMonitor !== false);
        list.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
        setOperators(list);
        setIsLoadingOperators(false);
      },
      (err) => {
        console.error('Error fetching operators:', err);
        setIsLoadingOperators(false);
      }
    );

    return () => unsub();
  }, [isAuthenticated]);

  // 2. Fetch clockings for ALL operators for the SELECTED DATE
  useEffect(() => {
    if (!isAuthenticated || operators.length === 0) return;
    const db = getDb();
    setIsLoadingClockings(true);

    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);

    const unsubs: (() => void)[] = [];
    const clockingsMap: Record<string, TimbraturaEvent[]> = {};
    const requestsMap: Record<string, any[]> = {};

    operators.forEach((op) => {
      // Listener timbrature del giorno per ciascun operatore
      const tQuery = query(
        collection(db, `app-users/${op.id}/timbrature`),
        where('timestamp', '>=', Timestamp.fromDate(dayStart)),
        where('timestamp', '<=', Timestamp.fromDate(dayEnd)),
        orderBy('timestamp', 'asc')
      );

      const uT = onSnapshot(tQuery, (snap) => {
        const evs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimbraturaEvent));
        setDateClockings((prev) => ({ ...prev, [op.id]: evs }));
      });
      unsubs.push(uT);

      // Listener per eventuale recupero effettuato in un altro giorno per la data selezionata
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const mQuery = query(
        collection(db, `app-users/${op.id}/timbrature`),
        where('makeupOfDay', '==', dateStr)
      );
      const uM = onSnapshot(mQuery, (snap) => {
        const evs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimbraturaEvent));
        setDateRecoveredClockings((prev) => ({ ...prev, [op.id]: evs }));
      });
      unsubs.push(uM);

      // Richieste attive nel giorno
      const rQuery = query(
        collection(db, `app-users/${op.id}/requests`),
        where('status', '==', 'approvato')
      );
      const uR = onSnapshot(rQuery, (snap) => {
        const dayReqs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((req: any) => {
            if (!req.startDate?.toDate) return false;
            const start = startOfDay(req.startDate.toDate());
            const end = endOfDay(req.endDate?.toDate ? req.endDate.toDate() : req.startDate.toDate());
            return selectedDate >= start && selectedDate <= end;
          });
        setDateRequests((prev) => ({ ...prev, [op.id]: dayReqs }));
      });
      unsubs.push(uR);
    });

    setIsLoadingClockings(false);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isAuthenticated, operators, selectedDate]);

  // 3. Compute row data for each operator on the selected date
  const dayRows: DayShiftRow[] = useMemo(() => {
    return operators.map((op) => {
      const events = dateClockings[op.id] || [];
      const recoveredEvents = dateRecoveredClockings[op.id] || [];
      const requests = dateRequests[op.id] || [];

      const isRecoveredDay = events.length === 0 && recoveredEvents.length > 0;
      const effectiveEvents = isRecoveredDay ? recoveredEvents : events;

      const shifts = groupEventsIntoShifts(effectiveEvents, op, selectedDate, isRecoveredDay);

      const entry = effectiveEvents.find((e) => e.type === 'entrata');
      const exit = (entry?.shiftId
        ? effectiveEvents.filter((e) => e.type === 'uscita' && e.shiftId === entry.shiftId).pop()
        : null) || effectiveEvents.filter((e) => e.type === 'uscita').pop();

      // Schedule check
      const daySchedule = getScheduleForDate(op as any, selectedDate);
      const isPastDay = isBefore(startOfDay(selectedDate), startOfDay(new Date()));
      const isToday = isSameDay(selectedDate, new Date());
      const isWorkDay = (daySchedule?.totalHours || 0) > 0;

      // Determine overall status
      let status: 'confermato' | 'in_attesa' | 'in_servizio' | 'non_timbrato' | 'assente' = 'non_timbrato';

      if (isRecoveredDay) {
        status = 'confermato';
      } else if (shifts.length > 0) {
        if (shifts.some((s) => s.status === 'in_servizio')) {
          status = 'in_servizio';
        } else if (shifts.every((s) => s.status === 'confermato')) {
          status = 'confermato';
        } else {
          status = 'in_attesa';
        }
      } else if (isPastDay && isWorkDay) {
        status = 'assente';
      }

      // Calculate totals across shifts
      const ordinaryHours = shifts.reduce((acc, s) => acc + s.ordinaryHours, 0);
      const overtimeHours = shifts.reduce((acc, s) => acc + s.overtimeHours, 0);
      const totalHours = ordinaryHours + overtimeHours;

      const firstShift = shifts[0];
      const lastShift = shifts[shifts.length - 1];

      const entryTime = firstShift?.entryTime || null;
      const exitTime = lastShift?.exitTime || null;
      const refStartTime = firstShift?.refStartTime || null;
      const refEndTime = lastShift?.refEndTime || null;
      const pauseTime = firstShift?.pauseTime || '--';
      const pauseDetail = firstShift?.pauseDetail || null;

      let schedText: string | null = null;
      if (shifts.length > 1) {
        schedText = `${shifts.length} turni effettuati / previsti`;
      } else if (refStartTime && refEndTime) {
        schedText = `${refStartTime} - ${refEndTime}`;
      } else if (daySchedule?.startTime && daySchedule?.endTime) {
        schedText = `${daySchedule.startTime} - ${daySchedule.endTime}`;
      } else if (daySchedule?.totalHours) {
        schedText = `${daySchedule.totalHours}h previste`;
      }

      const isMakeupShift = shifts.some((s) => s.isMakeupShift);
      const makeupForDayFormatted = shifts.find((s) => s.isMakeupShift)?.makeupForDayFormatted || null;
      const recoveredOnDateFormatted = shifts.find((s) => s.isRecoveredDay)?.recoveredOnDateFormatted || (
        isRecoveredDay && firstShift?.recoveredOnDateFormatted ? firstShift.recoveredOnDateFormatted : null
      );

      // Rilevamento dimenticanza e rettifica
      const isEntryAuto = Boolean(entry?.isAuto);
      const isExitAuto = Boolean(exit?.isAuto || (entry && !exit && isPastDay));
      const isEntryRectified = Boolean(
        entry?.isRectified ||
        entry?.originalTime ||
        entry?.rectificationStatus === 'approvata' ||
        entry?.rectificationStatus === 'in_approvazione' ||
        (entry?.suggestedTime && entry?.status === 'sospesa')
      );
      const isExitRectified = Boolean(
        exit?.isRectified ||
        exit?.originalTime ||
        exit?.rectificationStatus === 'approvata' ||
        exit?.rectificationStatus === 'in_approvazione' ||
        (exit?.suggestedTime && exit?.status === 'sospesa')
      );
      const hasDimenticanza = isEntryAuto || isExitAuto;
      const hasRettifica = isEntryRectified || isExitRectified;

      let isEarlyExit = false;
      let earlyExitText: string | undefined;
      let isLateEntry = false;
      let lateEntryText: string | undefined;

      if (refEndTime && exit?.timestamp?.toDate) {
        const [h, m] = refEndTime.split(':').map(Number);
        const schedExit = set(selectedDate, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        if (isBefore(exit.timestamp.toDate(), schedExit)) {
          const diffMinutes = Math.round((schedExit.getTime() - exit.timestamp.toDate().getTime()) / 60000);
          if (diffMinutes >= 5) {
            isEarlyExit = true;
            earlyExitText = `Uscito prima di ${diffMinutes} min (previsto ${refEndTime})`;
          }
        }
      }

      if (refStartTime && entry?.timestamp?.toDate) {
        const [h, m] = refStartTime.split(':').map(Number);
        const schedEntry = set(selectedDate, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        if (isBefore(schedEntry, entry.timestamp.toDate())) {
          const diffMinutes = Math.round((entry.timestamp.toDate().getTime() - schedEntry.getTime()) / 60000);
          if (diffMinutes >= 10) {
            isLateEntry = true;
            lateEntryText = `In ritardo di ${diffMinutes} min (previsto ${refStartTime})`;
          }
        }
      }

      return {
        operator: op,
        entryTime,
        exitTime,
        refStartTime,
        refEndTime,
        pauseTime,
        pauseDetail,
        schedText,
        pausesText: null,
        status,
        ordinaryHours,
        overtimeHours,
        totalHours,
        isEarlyExit,
        earlyExitText,
        isLateEntry,
        lateEntryText,
        requests,
        isEntryAuto,
        isExitAuto,
        isEntryRectified,
        isExitRectified,
        hasDimenticanza,
        hasRettifica,
        isMakeupShift,
        makeupForDayFormatted,
        isRecoveredDay,
        recoveredOnDateFormatted,
        shifts,
      };
    });
  }, [operators, dateClockings, dateRecoveredClockings, dateRequests, selectedDate]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return dayRows.filter((row) => {
      const fullName = `${row.operator.firstName} ${row.operator.lastName}`.toLowerCase();
      const code = (row.operator.username || '').toLowerCase();
      const matchesSearch = fullName.includes(searchQuery.toLowerCase()) || code.includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'non_timbrato') return row.status === 'non_timbrato' || row.status === 'assente';
      return row.status === statusFilter;
    });
  }, [dayRows, searchQuery, statusFilter]);

  // Quick Counters
  const summaryCounts = useMemo(() => {
    let inServizio = 0;
    let confermati = 0;
    let inAttesa = 0;
    let nonTimbrato = 0;

    dayRows.forEach((r) => {
      if (r.status === 'in_servizio') inServizio++;
      else if (r.status === 'confermato') confermati++;
      else if (r.status === 'in_attesa') inAttesa++;
      else nonTimbrato++;
    });

    return { inServizio, confermati, inAttesa, nonTimbrato };
  }, [dayRows]);

  // 4. Monthly Detail for Selected Operator
  useEffect(() => {
    if (!selectedOperator) return;
    const db = getDb();
    setIsLoadingDetail(true);

    const mStart = startOfMonth(detailMonth);
    const mEnd = endOfMonth(detailMonth);
    const mStartStr = format(mStart, 'yyyy-MM-dd');
    const mEndStr = format(mEnd, 'yyyy-MM-dd');

    // Timbrature del mese per questo operatore
    const tQuery = query(
      collection(db, `app-users/${selectedOperator.id}/timbrature`),
      where('timestamp', '>=', Timestamp.fromDate(mStart)),
      where('timestamp', '<=', Timestamp.fromDate(mEnd)),
      orderBy('timestamp', 'asc')
    );

    const unsubT = onSnapshot(tQuery, (snap) => {
      const evs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimbraturaEvent));
      setDetailEvents(evs);
    });

    // Timbrature di recupero relative a questo mese (dove makeupOfDay cade nel mese)
    const mQuery = query(
      collection(db, `app-users/${selectedOperator.id}/timbrature`),
      where('makeupOfDay', '>=', mStartStr),
      where('makeupOfDay', '<=', mEndStr)
    );
    const unsubM = onSnapshot(mQuery, (snap) => {
      const revs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimbraturaEvent));
      setDetailRecoveredEvents(revs);
    }, (err) => {
      console.warn('Recovered timbrature query note:', err);
    });

    // Richieste approvate
    const rQuery = query(
      collection(db, `app-users/${selectedOperator.id}/requests`),
      where('status', '==', 'approvato')
    );
    const unsubR = onSnapshot(rQuery, (snap) => {
      const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDetailRequests(reqs);
    });

    // Straordinari separati
    const sQuery = query(
      collection(db, `app-users/${selectedOperator.id}/straordinari`),
      where('date', '>=', Timestamp.fromDate(mStart)),
      where('date', '<=', Timestamp.fromDate(mEnd))
    );
    const unsubS = onSnapshot(sQuery, (snap) => {
      const str = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDetailOvertimeShifts(str);
    });

    setIsLoadingDetail(false);

    return () => {
      unsubT();
      unsubM();
      unsubR();
      unsubS();
    };
  }, [selectedOperator, detailMonth]);

  // Detail Monthly Calculations
  const detailMonthlySummary = useMemo(() => {
    if (!selectedOperator || !detailMonth) return null;
    try {
      return processMonthlyData(detailMonth, selectedOperator as any, {
        timbrature: detailEvents as any,
        requests: detailRequests,
        straordinari: detailOvertimeShifts,
        dailyNotes: [],
      }).monthlySummary;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [selectedOperator, detailMonth, detailEvents, detailRequests, detailOvertimeShifts]);

  // Group Detail Events by Day for Agenda
  const detailAgendaDays = useMemo(() => {
    interface AgendaDayItem {
      date: Date;
      events: TimbraturaEvent[];
      requests: any[];
      isRecoveredDay?: boolean;
      recoveredOnDateFormatted?: string | null;
      recoveredShift?: {
        entryTime?: string;
        exitTime?: string;
        ordinaryHours?: number;
        overtimeHours?: number;
      };
      isMakeupShift?: boolean;
      makeupForDayFormatted?: string | null;
      shifts?: SubShiftInfo[];
    }

    const map = new Map<string, AgendaDayItem>();

    // 1. Timbrature regolari del mese (escludi eventi rifiutati)
    detailEvents.filter(ev => ev.status !== 'rifiutata').forEach((ev) => {
      if (!ev.timestamp?.toDate) return;
      const d = ev.timestamp.toDate();
      const key = format(d, 'yyyy-MM-dd');
      if (!map.has(key)) {
        map.set(key, { date: d, events: [], requests: [] });
      }
      map.get(key)!.events.push(ev);
    });

    // 2. Riconosci turni di recupero in detailEvents
    detailEvents.filter(ev => ev.status !== 'rifiutata').forEach((ev) => {
      if (ev.type === 'entrata' && ev.makeupOfDay) {
        const d = ev.timestamp?.toDate ? ev.timestamp.toDate() : null;
        const key = d ? format(d, 'yyyy-MM-dd') : null;
        if (key && map.has(key)) {
          const item = map.get(key)!;
          item.isMakeupShift = true;
          try {
            item.makeupForDayFormatted = format(parse(ev.makeupOfDay, 'yyyy-MM-dd', new Date()), 'd MMMM', { locale: it });
          } catch (e) {
            item.makeupForDayFormatted = ev.makeupOfDay;
          }
        }

        // Se il giorno recuperato appartiene a questo mese, mostralo recuperato
        try {
          const targetDate = parse(ev.makeupOfDay, 'yyyy-MM-dd', new Date());
          if (isSameMonth(targetDate, detailMonth)) {
            const targetKey = ev.makeupOfDay;
            if (!map.has(targetKey)) {
              map.set(targetKey, { date: targetDate, events: [], requests: [] });
            }
            const recItem = map.get(targetKey)!;
            if (recItem.events.length === 0) {
              recItem.isRecoveredDay = true;
              recItem.recoveredOnDateFormatted = d ? format(d, 'd MMMM', { locale: it }) : null;
              const exitEv = ev.shiftId
                ? detailEvents.find((e) => e.type === 'uscita' && e.shiftId === ev.shiftId && e.status !== 'rifiutata')
                : detailEvents.find((e) => e.type === 'uscita' && e.status !== 'rifiutata');
              recItem.recoveredShift = {
                entryTime: d ? format(d, 'HH:mm') : undefined,
                exitTime: exitEv?.timestamp?.toDate ? format(exitEv.timestamp.toDate(), 'HH:mm') : undefined,
                ordinaryHours: ev.approvedOrdinaryHours,
                overtimeHours: ev.approvedOvertimeHours,
              };
              recItem.events = [ev, ...(exitEv ? [exitEv] : [])];
            }
          }
        } catch (e) {}
      }
    });

    // 3. Timbrature recuperate da altri mesi per giorni di questo mese
    detailRecoveredEvents.filter(rev => rev.status !== 'rifiutata').forEach((rev) => {
      if (rev.type === 'entrata' && rev.makeupOfDay) {
        try {
          const targetDate = parse(rev.makeupOfDay, 'yyyy-MM-dd', new Date());
          if (isSameMonth(targetDate, detailMonth)) {
            const targetKey = rev.makeupOfDay;
            if (!map.has(targetKey)) {
              map.set(targetKey, { date: targetDate, events: [], requests: [] });
            }
            const recItem = map.get(targetKey)!;
            if (recItem.events.length === 0) {
              recItem.isRecoveredDay = true;
              const revDate = rev.timestamp?.toDate ? rev.timestamp.toDate() : null;
              recItem.recoveredOnDateFormatted = revDate ? format(revDate, 'd MMMM', { locale: it }) : null;
              const revExit = rev.shiftId
                ? detailRecoveredEvents.find((e) => e.type === 'uscita' && e.shiftId === rev.shiftId && e.status !== 'rifiutata')
                : detailRecoveredEvents.find((e) => e.type === 'uscita' && e.status !== 'rifiutata');
              recItem.recoveredShift = {
                entryTime: revDate ? format(revDate, 'HH:mm') : undefined,
                exitTime: revExit?.timestamp?.toDate ? format(revExit.timestamp.toDate(), 'HH:mm') : undefined,
                ordinaryHours: rev.approvedOrdinaryHours,
                overtimeHours: rev.approvedOvertimeHours,
              };
              recItem.events = [rev, ...(revExit ? [revExit] : [])];
            }
          }
        } catch (e) {}
      }
    });

    // 4. Richieste del mese
    detailRequests.forEach((req) => {
      if (!req.startDate?.toDate) return;
      const d = req.startDate.toDate();
      const key = format(d, 'yyyy-MM-dd');
      if (map.has(key)) {
        map.get(key)!.requests.push(req);
      } else if (isSameMonth(d, detailMonth)) {
        map.set(key, { date: d, events: [], requests: [req] });
      }
    });

    const arr = Array.from(map.values());
    if (selectedOperator) {
      arr.forEach((item) => {
        item.shifts = groupEventsIntoShifts(item.events, selectedOperator, item.date, item.isRecoveredDay);
        // Tieni solo gli eventi appartenenti ai turni approvati
        if (item.shifts && item.shifts.length > 0) {
          const approvedShiftIds = new Set(item.shifts.map(s => s.shiftId).filter(Boolean));
          if (approvedShiftIds.size > 0) {
            item.events = item.events.filter(e => !e.shiftId || approvedShiftIds.has(e.shiftId));
          }
        } else if (!item.isRecoveredDay) {
          // Nessun turno approvato
          item.events = [];
        }
      });
    }

    // Mostra solo i giorni con turni approvati, richieste o turni recuperati
    const filteredArr = arr.filter(item => {
      const hasShifts = item.shifts && item.shifts.length > 0;
      const hasRequests = item.requests && item.requests.length > 0;
      return hasShifts || hasRequests || item.isRecoveredDay;
    });

    filteredArr.sort((a, b) => b.date.getTime() - a.date.getTime());
    return filteredArr;
  }, [detailEvents, detailRecoveredEvents, detailRequests, detailMonth, selectedOperator]);

  // --------------------------------------------------------------------------
  // LOGIN SCREEN
  // --------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-5 max-w-md mx-auto w-full min-h-screen">
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-6">
          <div className="h-20 w-20 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <ShieldCheck className="h-10 w-10" />
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              WorkForce Monitor
            </h1>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1 uppercase tracking-wider">
              Accesso Titolare • Sola Visualizzazione
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label
                htmlFor="accessCode"
                className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5"
              >
                Codice Amministrazione
              </label>
              <input
                id="accessCode"
                type="password"
                inputMode="numeric"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Inserisci codice..."
                className="w-full h-14 px-4 text-center text-2xl font-bold tracking-widest rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-emerald-500"
                autoFocus
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-600 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center justify-center text-lg gap-2"
            >
              {authLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entra nel Monitor'}
            </button>
          </form>

          <p className="text-[11px] text-slate-400">
            Applicazione parallela per il titolare collegata a Green & Clean.
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VISTA 2: DETTAGLIO MENSILE SINGOLO RAGAZZO
  // --------------------------------------------------------------------------
  if (selectedOperator) {
    return (
      <div className="flex-1 flex flex-col max-w-xl mx-auto w-full pb-10">
        {/* Header Dettaglio */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSelectedOperator(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Tutti i Ragazzi
          </button>

          <div className="w-8" />
        </header>

        <main className="p-4 space-y-5">
          {/* Info Dipendente */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-black text-xl">
                {selectedOperator.firstName ? selectedOperator.firstName.charAt(0) : 'O'}
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  {selectedOperator.firstName} {selectedOperator.lastName}
                </h2>
                <p className="text-xs text-slate-400 font-medium capitalize">
                  {selectedOperator.role === 'titolare' ? 'Titolare' : 'Dipendente'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigazione Mese */}
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-base text-slate-900 dark:text-slate-100 capitalize">
              Riepilogo {format(detailMonth, 'MMMM yyyy', { locale: it })}
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDetailMonth((p) => subMonths(p, 1))}
                className="h-8 w-8 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDetailMonth(new Date())}
                className="px-2.5 h-8 text-[11px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
              >
                Mese Attuale
              </button>
              <button
                onClick={() => setDetailMonth((p) => addMonths(p, 1))}
                className="h-8 w-8 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 5 Card Riepilogo Mensile incluso Importo Dovuto */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* ORE ORDINARIE */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold uppercase tracking-wider">
                <Clock className="h-4 w-4" />
                Ore Ordinarie
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {detailMonthlySummary ? `${detailMonthlySummary.ordinaryHours}h` : '0h'}
              </div>
              <p className="text-[11px] text-slate-400">
                {detailMonthlySummary ? `${detailMonthlySummary.ordinaryWorkedDays} giorni lavorati` : '0 giorni'}
              </p>
            </div>

            {/* ORE STRAORDINARIE */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold uppercase tracking-wider">
                <Flame className="h-4 w-4" />
                Straordinari
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {detailMonthlySummary ? `${detailMonthlySummary.overtimeHours}h` : '0h'}
              </div>
              <p className="text-[11px] text-slate-400">Ore totali approvate</p>
            </div>

            {/* GIORNI MALATTIA */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-rose-500 text-xs font-bold uppercase tracking-wider">
                <HeartPulse className="h-4 w-4" />
                Malattia
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {detailMonthlySummary ? `${detailMonthlySummary.malattiaDays} gg` : '0 gg'}
              </div>
              <p className="text-[11px] text-slate-400">Giorni certificati</p>
            </div>

            {/* FERIE E PERMESSI */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-blue-500 text-xs font-bold uppercase tracking-wider">
                <Sun className="h-4 w-4" />
                Ferie / Permessi
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {detailMonthlySummary
                  ? `${detailMonthlySummary.ferieDays} gg / ${detailMonthlySummary.permessoHours}h`
                  : '0 gg'}
              </div>
              <p className="text-[11px] text-slate-400">Ferie e permessi goduti</p>
            </div>

            {/* IMPORTO DOVUTO */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md space-y-1 col-span-2 sm:col-span-2 md:col-span-1">
              <div className="flex items-center justify-between text-emerald-100 text-xs font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Banknote className="h-4 w-4" />
                  Importo Dovuto
                </span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">Mese</span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {detailMonthlySummary ? (
                  detailMonthlySummary.totalDueOverride !== undefined ? (
                    `€ ${detailMonthlySummary.totalDueOverride.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  ) : (
                    `€ ${(detailMonthlySummary.estimatedTotalCost || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )
                ) : '€ 0,00'}
              </div>
              <p className="text-[11px] text-emerald-100/90 truncate">
                {selectedOperator?.salaryType === 'fixed'
                  ? 'Stipendio fisso + extra'
                  : `Tariffa: € ${selectedOperator?.hourlyRate || 0}/h`}
              </p>
            </div>
          </div>

          {/* ELENCO DELLE TIMBRATURE DEL MESE (SOLA LETTURA) */}
          <div className="space-y-2.5 pt-2">
            <h3 className="font-black text-base text-slate-900 dark:text-slate-100 px-1">
              Elenco Timbrature del Mese ({detailAgendaDays.length})
            </h3>

            {detailAgendaDays.length === 0 ? (
              <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 text-slate-400">
                <p className="text-sm font-semibold">Nessuna timbratura registrata in questo mese.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {detailAgendaDays.map((item, idx) => {
                  const entry = item.events.find((e) => e.type === 'entrata');
                  // Risolvi l'uscita associata: cerca quella con lo stesso shiftId o l'ultima uscita registrata
                  const exit = (entry?.shiftId
                    ? item.events.filter((e) => e.type === 'uscita' && e.shiftId === entry.shiftId).pop()
                    : null) || item.events.filter((e) => e.type === 'uscita').pop();
                  
                  const isRecovered = Boolean(item.isRecoveredDay);
                  const hasApprovedRequest = item.requests.some((r) => r.status === 'approvato');
                  const isApproved = isRecovered || hasApprovedRequest || (item.shifts && item.shifts.length > 0 && item.shifts.every(s => s.status === 'confermato')) || (item.events.some((e) => e.status === 'confermata') && !item.events.some((e) => e.status === 'sospesa'));
                  const isPending = !isRecovered && !hasApprovedRequest && (item.events.some((e) => e.status === 'sospesa') || (!isApproved && item.events.length > 0));

                  const singleShift = item.shifts && item.shifts.length === 1 ? item.shifts[0] : null;

                  const { refStartTime: refStartComputed, refEndTime: refEndComputed } = getReferenceTimes(
                    selectedOperator as any,
                    item.date,
                    entry,
                    exit
                  );

                  // Pauses
                  const sortedItemEvs = [...item.events].sort((a, b) => {
                    const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0);
                    const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0);
                    return tA - tB;
                  });
                  let itemPauseMins = 0;
                  let itemPauseStart: Date | null = null;
                  const itemPauseIntervals: string[] = [];
                  for (const ev of sortedItemEvs) {
                    if (ev.type === 'pausa' && ev.timestamp?.toDate) {
                      itemPauseStart = ev.timestamp.toDate();
                    } else if (ev.type === 'fine_pausa' && itemPauseStart && ev.timestamp?.toDate) {
                      const pEnd = ev.timestamp.toDate();
                      itemPauseMins += Math.round((pEnd.getTime() - itemPauseStart.getTime()) / 60000);
                      itemPauseIntervals.push(`${format(itemPauseStart, 'HH:mm')}-${format(pEnd, 'HH:mm')}`);
                      itemPauseStart = null;
                    }
                  }
                  const itemPauseTextComputed = itemPauseMins > 0 ? `${itemPauseMins}m` : '--';

                  const entryTime = isRecovered
                    ? (item.recoveredShift?.entryTime || '--:--')
                    : singleShift
                    ? (singleShift.entryTime || '--:--')
                    : (entry?.timestamp?.toDate ? format(entry.timestamp.toDate(), 'HH:mm') : '--:--');

                  const exitTime = isRecovered
                    ? (item.recoveredShift?.exitTime || '--:--')
                    : singleShift
                    ? (singleShift.exitTime || '--:--')
                    : (exit?.timestamp?.toDate ? format(exit.timestamp.toDate(), 'HH:mm') : '--:--');

                  const refStart = singleShift ? singleShift.refStartTime : refStartComputed;
                  const refEnd = singleShift ? singleShift.refEndTime : refEndComputed;
                  const itemPauseText = singleShift ? singleShift.pauseTime : itemPauseTextComputed;

                  const ordH = isRecovered
                    ? item.recoveredShift?.ordinaryHours
                    : singleShift
                    ? singleShift.ordinaryHours
                    : entry?.approvedOrdinaryHours;

                  const overH = isRecovered
                    ? item.recoveredShift?.overtimeHours
                    : singleShift
                    ? singleShift.overtimeHours
                    : entry?.approvedOvertimeHours;

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100 capitalize">
                          {format(item.date, 'EEEE d MMMM yyyy', { locale: it })}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {isRecovered ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Recuperato
                            </span>
                          ) : isApproved ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Approvato
                            </span>
                          ) : isPending ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> In attesa
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Se la giornata ha turni multipli */}
                      {item.shifts && item.shifts.length > 1 ? (
                        <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                          {item.shifts.map((s, sIdx) => (
                            <div key={s.shiftId || sIdx} className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 first:border-t-0 first:pt-0">
                              <div className="flex items-center justify-between text-xs font-bold px-0.5">
                                <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                  <span className="h-5 w-5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px]">
                                    {sIdx + 1}
                                  </span>
                                  Turno {sIdx + 1} ({s.entryTime} - {s.exitTime})
                                  {s.isMakeupShift && (
                                    <span className="text-blue-600 dark:text-blue-400 font-semibold text-[11px]">
                                      • Recupero del {s.makeupForDayFormatted}
                                    </span>
                                  )}
                                </span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-black">
                                  {s.ordinaryHours}h
                                </span>
                              </div>

                              <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                                <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl">
                                  <span className="text-[9px] text-slate-400 block font-semibold uppercase">Entrata</span>
                                  <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block">{s.entryTime || '--:--'}</span>
                                  <span className="text-[9px] text-slate-400 block truncate">{s.refStartTime ? `rif. ${s.refStartTime}` : '-'}</span>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl">
                                  <span className="text-[9px] text-slate-400 block font-semibold uppercase">Pausa</span>
                                  <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block">{s.pauseTime}</span>
                                  <span className="text-[9px] text-slate-400 block truncate">{s.pauseDetail ? `(${s.pauseDetail})` : '-'}</span>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl">
                                  <span className="text-[9px] text-slate-400 block font-semibold uppercase">Uscita</span>
                                  <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block">{s.exitTime || '--:--'}</span>
                                  <span className="text-[9px] text-slate-400 block truncate">{s.refEndTime ? `rif. ${s.refEndTime}` : '-'}</span>
                                </div>

                                <div className="bg-emerald-50/70 dark:bg-emerald-950/40 py-1.5 px-0.5 rounded-xl">
                                  <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block font-semibold uppercase">Ore</span>
                                  <span className="font-bold text-[11px] text-emerald-700 dark:text-emerald-300 block">
                                    {s.ordinaryHours}h{s.overtimeHours ? ` +${s.overtimeHours}h` : ''}
                                  </span>
                                  <span className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 block">
                                    {s.status === 'confermato' ? 'approvate' : 'in attesa'}
                                  </span>
                                </div>
                              </div>

                              {s.isMakeupShift && (
                                <div className="p-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs font-semibold flex items-center gap-1.5">
                                  <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                                  <span>La timbratura delle {s.entryTime} alle {s.exitTime} è recupero del giorno {s.makeupForDayFormatted}</span>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Totale complessivo della giornata con turni multipli */}
                          <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-100/50 dark:bg-emerald-950/30 rounded-xl text-xs font-bold text-emerald-900 dark:text-emerald-200 border border-emerald-200/60">
                            <span>Totale giornata ({item.shifts.length} turni)</span>
                            <span className="text-emerald-700 dark:text-emerald-300 font-black text-sm">
                              {item.shifts.reduce((sum, s) => sum + s.totalHours, 0)}h
                            </span>
                          </div>
                        </div>
                      ) : (
                        /* Riga compatta standard a 4 celle per turno singolo */
                        (entryTime !== '--:--' || exitTime !== '--:--' || isRecovered) && (
                          <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-center text-xs">
                            <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl">
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase">Entrata</span>
                              <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block">{entryTime}</span>
                              <span className="text-[9px] text-slate-400 block truncate">{refStart ? `rif. ${refStart}` : '-'}</span>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl">
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase">Pausa</span>
                              <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block">{itemPauseText}</span>
                              <span className="text-[9px] text-slate-400 block truncate">{itemPauseIntervals.length > 0 ? `(${itemPauseIntervals[0]})` : '-'}</span>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl">
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase">Uscita</span>
                              <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block">{exitTime}</span>
                              <span className="text-[9px] text-slate-400 block truncate">{refEnd ? `rif. ${refEnd}` : '-'}</span>
                            </div>

                            <div className="bg-emerald-50/70 dark:bg-emerald-950/40 py-1.5 px-0.5 rounded-xl">
                              <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block font-semibold uppercase">Ore</span>
                              <span className="font-bold text-[11px] text-emerald-700 dark:text-emerald-300 block">
                                {(ordH !== undefined || overH !== undefined) ? `${ordH || 0}h${overH ? ` +${overH}h` : ''}` : (isApproved ? '0h' : '--')}
                              </span>
                              <span className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 block">
                                {isApproved ? 'approvate' : 'in attesa'}
                              </span>
                            </div>
                          </div>
                        )
                      )}

                      {/* Notifica Recupero Turno se recuperato */}
                      {isRecovered && (
                        <div className="p-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>Il {item.recoveredOnDateFormatted} è stato recuperato questo turno ({entryTime} - {exitTime})</span>
                        </div>
                      )}

                      {/* Notifica Recupero Turno se turno fisico di recupero (caso turno singolo) */}
                      {!item.shifts || item.shifts.length <= 1 ? (
                        item.isMakeupShift && (
                          <div className="p-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs font-semibold flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                            <span>La timbratura delle {entryTime} alle {exitTime} è recupero del giorno {item.makeupForDayFormatted}</span>
                          </div>
                        )
                      ) : null}

                      {/* Eventuali richieste */}
                      {item.requests.map((r, rIdx) => {
                        if (r.type === 'assenza' && isRecovered) return null;
                        if (r.type === 'anticipo') return null;
                        return (
                          <div key={rIdx} className="text-[11px] font-semibold text-slate-500 pt-0.5">
                            {r.type === 'malattia' && '🤒 Malattia registrata'}
                            {r.type === 'ferie' && '🏖️ Ferie godute'}
                            {r.type === 'permesso' && `⏱️ Permesso (${r.hours}h)`}
                            {r.type === 'assenza' && (
                              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <span>🚫</span> Assenza
                                </span>
                                <span className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                                  {r.reason || 'Assenza confermata'}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VISTA 1: SCHERMATA PRINCIPALE (TUTTI I RAGAZZI SU UNA RIGA)
  // --------------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full pb-10">
      {/* HEADER SUPERIORE + SELETTORE DATA SEMPRE FISSI IN ALTO */}
      <div className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md">
        <header className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                WorkForce Monitor
              </h1>
              <p className="text-[11px] text-emerald-600 font-bold">Pannello Titolare • Live</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Esci"
            className="h-8 w-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-rose-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* SELETTORE DATA FISSO SOTTO L'HEADER */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <button
              onClick={() => {
                setSelectedDate((p) => subDays(p, 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-center">
              <p className="text-xs uppercase font-extrabold text-emerald-600 dark:text-emerald-400">
                {format(selectedDate, 'EEEE', { locale: it })} {isSameDay(selectedDate, new Date()) ? '• Oggi' : ''}
              </p>
              <p className="text-base font-black text-slate-900 dark:text-slate-100 capitalize">
                {format(selectedDate, 'EEEE d MMMM yyyy', { locale: it })}
              </p>
            </div>

            <div className="flex items-center gap-1">
              {!isSameDay(selectedDate, new Date()) && (
                <button
                  onClick={() => {
                    setSelectedDate(new Date());
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-2 h-9 text-[11px] font-bold rounded-xl border border-slate-200 hover:bg-slate-100"
                >
                  Oggi
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedDate((p) => addDays(p, 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="p-4 space-y-4">

        {/* CONTATORI RAPIDI IN ALTO */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => setStatusFilter(statusFilter === 'in_servizio' ? 'all' : 'in_servizio')}
            className={`p-2.5 rounded-2xl border text-center transition-all ${
              statusFilter === 'in_servizio'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-800'
            }`}
          >
            <span className="block text-lg font-black text-blue-600 dark:text-blue-400 leading-none">
              {summaryCounts.inServizio}
            </span>
            <span className="text-[10px] font-bold block mt-1 uppercase text-slate-500">In Turno</span>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'confermato' ? 'all' : 'confermato')}
            className={`p-2.5 rounded-2xl border text-center transition-all ${
              statusFilter === 'confermato'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-800'
            }`}
          >
            <span className="block text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none">
              {summaryCounts.confermati}
            </span>
            <span className="text-[10px] font-bold block mt-1 uppercase text-slate-500">Approvati</span>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'in_attesa' ? 'all' : 'in_attesa')}
            className={`p-2.5 rounded-2xl border text-center transition-all ${
              statusFilter === 'in_attesa'
                ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-800'
            }`}
          >
            <span className="block text-lg font-black text-amber-500 leading-none">
              {summaryCounts.inAttesa}
            </span>
            <span className="text-[10px] font-bold block mt-1 uppercase text-slate-500">In Attesa</span>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'non_timbrato' ? 'all' : 'non_timbrato')}
            className={`p-2.5 rounded-2xl border text-center transition-all ${
              statusFilter === 'non_timbrato'
                ? 'bg-slate-700 text-white border-slate-700 shadow-md'
                : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-800'
            }`}
          >
            <span className="block text-lg font-black text-slate-400 leading-none">
              {summaryCounts.nonTimbrato}
            </span>
            <span className="text-[10px] font-bold block mt-1 uppercase text-slate-500">Assenti</span>
          </button>
        </div>

        {/* BARRA DI RICERCA */}
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca dipendente per nome..."
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* ============================================================== */}
        {/* ELENCO DELLE TIMBRATURE DI TUTTI I RAGAZZI (SU UNA RIGA)      */}
        {/* ============================================================== */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-black text-base text-slate-900 dark:text-slate-100">
              Timbrature Ragazzi ({filteredRows.length})
            </h2>
            <span className="text-[11px] text-slate-400 font-semibold">Tocca il nome per il mese</span>
          </div>

          {isLoadingOperators ? (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-600" />
              <p className="text-xs text-slate-400 mt-2">Caricamento dipendenti...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-10 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 text-slate-400">
              <p className="text-sm font-semibold">Nessun dipendente trovato per questo filtro.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <div
                  key={row.operator.id}
                  onClick={() => {
                    setSelectedOperator(row.operator);
                    setDetailMonth(selectedDate);
                  }}
                  className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer space-y-2 group"
                >
                  {/* RIGA PRINCIPALE: NOME + STATO + ORARI */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Nome Dipendente (cliccabile) */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                        {row.operator.firstName ? row.operator.firstName.charAt(0) : 'O'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate block group-hover:text-emerald-600 transition-colors">
                          {row.operator.firstName} {row.operator.lastName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block truncate">
                          {row.schedText ? `Previsto: ${row.schedText}` : 'Nessun orario previsto'}
                        </span>
                      </div>
                    </div>

                    {/* BADGE STATO */}
                    <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                      {row.isRecoveredDay ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Recuperato
                        </span>
                      ) : row.status === 'confermato' ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Approvato
                        </span>
                      ) : null}
                      {row.status === 'in_attesa' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {row.entryTime && !row.exitTime ? 'Uscita mancante' : 'In attesa'}
                        </span>
                      )}
                      {row.status === 'in_servizio' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 animate-pulse">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> In turno
                        </span>
                      )}
                      {!row.isRecoveredDay && row.status === 'assente' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-red-600" /> Assente
                        </span>
                      )}
                      {!row.isRecoveredDay && row.status === 'non_timbrato' && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                          Non timbrato
                        </span>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>

                  {/* RIGA DETTAGLIO TIMBRATURA: ENTRATA | PAUSA | USCITA | ORD / STRA | TOTALE */}
                  {row.shifts && row.shifts.length > 1 ? (
                    <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                      {row.shifts.map((s, sIdx) => (
                        <div key={s.shiftId || sIdx} className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 first:border-t-0 first:pt-0">
                          <div className="flex items-center justify-between text-xs font-bold px-0.5">
                            <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <span className="h-5 w-5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px]">
                                {sIdx + 1}
                              </span>
                              Turno {sIdx + 1} ({s.entryTime || '--:--'} - {s.exitTime || '--:--'})
                              {s.isMakeupShift && (
                                <span className="text-blue-600 dark:text-blue-400 font-semibold text-[11px]">
                                  • Recupero del {s.makeupForDayFormatted}
                                </span>
                              )}
                            </span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-black">
                              {s.ordinaryHours}h{s.overtimeHours ? ` +${s.overtimeHours}h` : ''}
                            </span>
                          </div>

                          <div className="grid grid-cols-5 gap-1 text-center">
                            {/* Entrata */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl min-w-0">
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-tight">Entrata</span>
                              <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block truncate leading-tight">
                                {s.entryTime || '--:--'}
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium block truncate leading-tight mt-0.5">
                                {s.refStartTime ? `rif. ${s.refStartTime}` : '-'}
                              </span>
                            </div>

                            {/* Pausa */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl min-w-0">
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-tight">Pausa</span>
                              <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block truncate leading-tight">
                                {s.pauseTime}
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium block truncate leading-tight mt-0.5">
                                {s.pauseDetail ? `(${s.pauseDetail})` : '-'}
                              </span>
                            </div>

                            {/* Uscita */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl min-w-0">
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-tight">Uscita</span>
                              <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block truncate leading-tight">
                                {s.exitTime || '--:--'}
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium block truncate leading-tight mt-0.5">
                                {s.refEndTime ? `rif. ${s.refEndTime}` : '-'}
                              </span>
                            </div>

                            {/* Ord / Stra */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl min-w-0">
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-tight">Ord / Stra</span>
                              <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 block truncate leading-tight">
                                {s.ordinaryHours}h /{' '}
                                <span className={s.overtimeHours > 0 ? 'text-amber-600 font-black' : ''}>
                                  {s.overtimeHours}h
                                </span>
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium block truncate leading-tight mt-0.5">
                                {s.status === 'confermato' ? 'approvate' : 'da approv.'}
                              </span>
                            </div>

                            {/* Totale */}
                            <div className="bg-emerald-50/80 dark:bg-emerald-950/40 py-1.5 px-0.5 rounded-xl min-w-0 border border-emerald-100 dark:border-emerald-900/50">
                              <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block font-semibold uppercase tracking-tight">Totale</span>
                              <span className="font-black text-[12px] text-emerald-700 dark:text-emerald-300 block truncate leading-tight">
                                {s.totalHours}h
                              </span>
                              <span className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 font-medium block truncate leading-tight mt-0.5">
                                {s.status === 'confermato' ? 'lavorate' : 'stimate'}
                              </span>
                            </div>
                          </div>

                          {/* Notifica recupero turno se questo specifico turno è di recupero */}
                          {s.isMakeupShift && (
                            <div className="p-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs font-semibold flex items-center gap-1.5">
                              <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                              <span>La timbratura delle {s.entryTime || '--:--'} alle {s.exitTime || '--:--'} è recupero del giorno {s.makeupForDayFormatted}</span>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Totale complessivo della giornata per turni multipli */}
                      <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-100/50 dark:bg-emerald-950/30 rounded-xl text-xs font-bold text-emerald-900 dark:text-emerald-200 border border-emerald-200/60">
                        <span>Totale complessivo giornata ({row.shifts.length} turni)</span>
                        <span className="text-emerald-700 dark:text-emerald-300 font-black text-sm">
                          {row.totalHours}h
                        </span>
                      </div>
                    </div>
                  ) : (row.entryTime || row.exitTime || row.isRecoveredDay) ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-5 gap-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                        {/* Entrata */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl min-w-0">
                          <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-tight">Entrata</span>
                          <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block truncate leading-tight">
                            {row.entryTime || '--:--'}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium block truncate leading-tight mt-0.5">
                            {row.refStartTime ? `rif. ${row.refStartTime}` : '-'}
                          </span>
                        </div>

                        {/* Pausa */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl min-w-0">
                          <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-tight">Pausa</span>
                          <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block truncate leading-tight">
                            {row.pauseTime}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium block truncate leading-tight mt-0.5">
                            {row.pauseDetail ? `(${row.pauseDetail})` : '-'}
                          </span>
                        </div>

                        {/* Uscita */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl min-w-0">
                          <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-tight">Uscita</span>
                          <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 block truncate leading-tight">
                            {row.exitTime || '--:--'}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium block truncate leading-tight mt-0.5">
                            {row.refEndTime ? `rif. ${row.refEndTime}` : '-'}
                          </span>
                        </div>

                        {/* Ord / Stra */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 py-1.5 px-0.5 rounded-xl min-w-0">
                          <span className="text-[9px] text-slate-400 block font-semibold uppercase tracking-tight">Ord / Stra</span>
                          <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 block truncate leading-tight">
                            {row.ordinaryHours}h /{' '}
                            <span className={row.overtimeHours > 0 ? 'text-amber-600 font-black' : ''}>
                              {row.overtimeHours}h
                            </span>
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium block truncate leading-tight mt-0.5">
                            {row.status === 'confermato' ? 'approvate' : 'da approv.'}
                          </span>
                        </div>

                        {/* Totale */}
                        <div className="bg-emerald-50/80 dark:bg-emerald-950/40 py-1.5 px-0.5 rounded-xl min-w-0 border border-emerald-100 dark:border-emerald-900/50">
                          <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block font-semibold uppercase tracking-tight">Totale</span>
                          <span className="font-black text-[12px] text-emerald-700 dark:text-emerald-300 block truncate leading-tight">
                            {row.totalHours}h
                          </span>
                          <span className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 font-medium block truncate leading-tight mt-0.5">
                            {row.status === 'confermato' ? 'lavorate' : 'stimate'}
                          </span>
                        </div>
                      </div>

                      {/* Notifica Recupero Turno se giorno recuperato */}
                      {row.isRecoveredDay && (
                        <div className="p-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>Il {row.recoveredOnDateFormatted} è stato recuperato questo turno ({row.entryTime || '--:--'} - {row.exitTime || '--:--'})</span>
                        </div>
                      )}

                      {/* Notifica Recupero Turno se turno fisico di recupero */}
                      {row.isMakeupShift && (
                        <div className="p-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs font-semibold flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                          <span>La timbratura delle {row.entryTime || '--:--'} alle {row.exitTime || '--:--'} è recupero del giorno {row.makeupForDayFormatted}</span>
                        </div>
                      )}

                      {row.status === 'in_attesa' && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center justify-between px-1">
                          <span className="flex items-center gap-1">
                            {!row.exitTime ? (
                              <>
                                <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                Uscita non timbrata — In attesa di approvazione
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3 text-amber-600 animate-pulse" />
                                Turno timbrato — In attesa di approvazione
                              </>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400 italic">
                            Modificabile dal gestionale
                          </span>
                        </div>
                      )}
                    </div>
                  ) : row.status === 'in_servizio' ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between px-2.5 py-1.5 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl text-blue-800 dark:text-blue-300 text-xs font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping shrink-0" />
                        Operatore attualmente in servizio
                      </span>
                      <span className="text-[11px] font-bold text-blue-900 dark:text-blue-200">
                        Entrata: {row.entryTime || '--:--'}
                      </span>
                    </div>
                  ) : null}

                  {/* EVENTUALI GIUSTIFICATIVI (MALATTIA, FERIE, PERMESSO, ASSENZA) */}
                  {row.requests.filter(req => req.type !== 'anticipo').length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5 text-[10px]">
                      {row.requests.filter(req => req.type !== 'anticipo').map((req, qIdx) => (
                        <span
                          key={qIdx}
                          className={`px-2 py-0.5 rounded-md font-semibold ${
                            req.type === 'assenza'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {req.type === 'malattia' && '🤒 Malattia'}
                          {req.type === 'ferie' && '🏖️ Ferie'}
                          {req.type === 'permesso' && '⏱️ Permesso'}
                          {req.type === 'assenza' && '🚫 Assenza'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
