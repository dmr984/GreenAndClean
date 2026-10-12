'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getDb } from '@/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  isSameDay,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Clock,
  Play,
  Square,
  Coffee,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Briefcase,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  HeartPulse,
  Sun,
  ShieldCheck,
  Flame,
} from 'lucide-react';
import { processMonthlyData, getScheduleForDate } from '@/lib/calculations';

interface Operator {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  workSchedule?: any;
}

interface ClockingEvent {
  id: string;
  userId: string;
  type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
  timestamp: any;
  status: 'sospesa' | 'confermata' | 'rifiutata';
  approvedOrdinaryHours?: number;
  approvedOvertimeHours?: number;
  shiftId?: string;
}

export default function MobileOperatorApp() {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Time & Live Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Month navigation for agenda & summary
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Data states
  const [todayEvents, setTodayEvents] = useState<ClockingEvent[]>([]);
  const [monthEvents, setMonthEvents] = useState<ClockingEvent[]>([]);
  const [monthRequests, setMonthRequests] = useState<any[]>([]);
  const [monthOvertimeShifts, setMonthOvertimeShifts] = useState<any[]>([]);
  const [isClocking, setIsClocking] = useState(false);
  const [clockSuccessMessage, setClockSuccessMessage] = useState<string | null>(null);

  // Live timer tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check saved login in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('workforce_operator');
      if (saved) {
        setOperator(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading saved operator', e);
    }
  }, []);

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) {
      setLoginError('Inserisci il tuo codice operatore.');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);

    try {
      const db = getDb();
      const usersRef = collection(db, 'app-users');
      const q = query(usersRef, where('username', '==', inputCode.trim()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setLoginError('Codice non valido. Verifica e riprova.');
        setLoginLoading(false);
        return;
      }

      const doc = snap.docs[0];
      const data = doc.data();
      const op: Operator = {
        id: doc.id,
        username: data.username,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        role: data.role || 'operator',
        workSchedule: data.workSchedule || {},
      };

      setOperator(op);
      localStorage.setItem('workforce_operator', JSON.stringify(op));
      setInputCode('');
    } catch (err: any) {
      console.error('Login error:', err);
      setLoginError('Errore di connessione al database.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('workforce_operator');
    setOperator(null);
  };

  // Real-time listener for TODAY's clockings
  useEffect(() => {
    if (!operator) return;
    const db = getDb();
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const q = query(
      collection(db, `app-users/${operator.id}/timbrature`),
      where('timestamp', '>=', Timestamp.fromDate(todayStart)),
      where('timestamp', '<=', Timestamp.fromDate(todayEnd)),
      orderBy('timestamp', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const evs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClockingEvent));
        setTodayEvents(evs);
      },
      (err) => console.error('Error fetching today events:', err)
    );

    return () => unsub();
  }, [operator]);

  // Real-time listener for SELECTED MONTH clockings & requests
  useEffect(() => {
    if (!operator) return;
    const db = getDb();
    const mStart = startOfMonth(selectedMonth);
    const mEnd = endOfMonth(selectedMonth);

    // Timbrature del mese
    const tQuery = query(
      collection(db, `app-users/${operator.id}/timbrature`),
      where('timestamp', '>=', Timestamp.fromDate(mStart)),
      where('timestamp', '<=', Timestamp.fromDate(mEnd)),
      orderBy('timestamp', 'asc')
    );

    const unsubTimbrature = onSnapshot(
      tQuery,
      (snap) => {
        const evs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClockingEvent));
        setMonthEvents(evs);
      },
      (err) => console.error('Month timbrature error:', err)
    );

    // Richieste approvate (ferie, permessi, malattia)
    const rQuery = query(
      collection(db, `app-users/${operator.id}/requests`),
      where('status', '==', 'approvato')
    );

    const unsubRequests = onSnapshot(
      rQuery,
      (snap) => {
        const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMonthRequests(reqs);
      },
      (err) => console.error('Month requests error:', err)
    );

    // Straordinari separati
    const sQuery = query(
      collection(db, `app-users/${operator.id}/straordinari`),
      where('date', '>=', Timestamp.fromDate(mStart)),
      where('date', '<=', Timestamp.fromDate(mEnd))
    );

    const unsubStraordinari = onSnapshot(
      sQuery,
      (snap) => {
        const str = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMonthOvertimeShifts(str);
      },
      (err) => console.error('Month straordinari error:', err)
    );

    return () => {
      unsubTimbrature();
      unsubRequests();
      unsubStraordinari();
    };
  }, [operator, selectedMonth]);

  // Determine today shift status
  const todayEntry = todayEvents.find((e) => e.type === 'entrata');
  const todayExit = todayEvents.find((e) => e.type === 'uscita');
  const lastPauseStart = todayEvents
    .filter((e) => e.type === 'pausa')
    .slice(-1)[0];
  const lastPauseEnd = todayEvents
    .filter((e) => e.type === 'fine_pausa')
    .slice(-1)[0];

  const isCurrentlyInPause =
    lastPauseStart &&
    (!lastPauseEnd ||
      (lastPauseStart.timestamp?.toMillis &&
        lastPauseEnd.timestamp?.toMillis &&
        lastPauseStart.timestamp.toMillis() > lastPauseEnd.timestamp.toMillis()));

  const shiftStatus: 'not_started' | 'in_progress' | 'completed' = useMemo(() => {
    if (!todayEntry) return 'not_started';
    if (todayEntry && !todayExit) return 'in_progress';
    return 'completed';
  }, [todayEntry, todayExit]);

  // Clock action handler
  const handleClockAction = async (type: 'entrata' | 'uscita' | 'pausa' | 'fine_pausa') => {
    if (!operator || isClocking) return;
    setIsClocking(true);
    setClockSuccessMessage(null);

    try {
      const db = getDb();
      await addDoc(collection(db, `app-users/${operator.id}/timbrature`), {
        userId: operator.id,
        type: type,
        timestamp: serverTimestamp(),
        status: 'sospesa',
        viewedByOperator: true,
        isAuto: false,
      });

      const labelMap = {
        entrata: 'Entrata registrata! Buon lavoro 💪',
        uscita: 'Uscita registrata! Buona serata 🏠',
        pausa: 'Pausa iniziata ☕',
        fine_pausa: 'Pausa terminata, bentornato! ⏱️',
      };
      setClockSuccessMessage(labelMap[type]);
      setTimeout(() => setClockSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Error clocking:', err);
      alert('Errore durante la registrazione della timbratura. Riprova.');
    } finally {
      setIsClocking(false);
    }
  };

  // Compute monthly calculations (read-only for operator)
  const computedSummary = useMemo(() => {
    if (!operator || !selectedMonth) return null;
    try {
      return processMonthlyData(selectedMonth, operator as any, {
        timbrature: monthEvents,
        requests: monthRequests,
        straordinari: monthOvertimeShifts,
        dailyNotes: [],
      }).monthlySummary;
    } catch (e) {
      console.error('Error calculating monthly data:', e);
      return null;
    }
  }, [operator, selectedMonth, monthEvents, monthRequests, monthOvertimeShifts]);

  // Group month events into daily shifts for Agenda
  const agendaDays = useMemo(() => {
    const daysMap = new Map<string, { date: Date; events: ClockingEvent[]; requests: any[] }>();

    // Raggruppa eventi per giorno
    monthEvents.forEach((ev) => {
      if (!ev.timestamp?.toDate) return;
      const d = ev.timestamp.toDate();
      const key = format(d, 'yyyy-MM-dd');
      if (!daysMap.has(key)) {
        daysMap.set(key, { date: d, events: [], requests: [] });
      }
      daysMap.get(key)!.events.push(ev);
    });

    // Aggiungi richieste per i giorni
    monthRequests.forEach((req) => {
      if (!req.startDate?.toDate) return;
      const start = req.startDate.toDate();
      const end = req.endDate?.toDate ? req.endDate.toDate() : start;
      const key = format(start, 'yyyy-MM-dd');
      if (daysMap.has(key)) {
        daysMap.get(key)!.requests.push(req);
      } else {
        daysMap.set(key, { date: start, events: [], requests: [req] });
      }
    });

    // Ordina dal più recente al più vecchio
    const arr = Array.from(daysMap.values());
    arr.sort((a, b) => b.date.getTime() - a.date.getTime());
    return arr;
  }, [monthEvents, monthRequests]);

  // ----------------------------------------------------
  // LOGIN SCREEN (Se non autenticato)
  // ----------------------------------------------------
  if (!operator) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-5 max-w-md mx-auto w-full min-h-screen">
        <div className="w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200/80 dark:border-slate-800 p-7 text-center space-y-6">
          <div className="h-24 w-24 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
            <Clock className="h-12 w-12" />
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
              WorkForce Dipendenti
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Inserisci il tuo codice personale per timbrare e consultare i tuoi orari.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label
                htmlFor="code"
                className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-1.5"
              >
                Codice Operatore
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Es. 1234"
                className="w-full h-14 px-4 text-center text-2xl font-bold tracking-widest rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-emerald-500 transition-colors"
                autoFocus
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-300 font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition-all flex items-center justify-center text-lg gap-2"
            >
              {loginLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Accesso in corso...
                </>
              ) : (
                'Entra nell\'App'
              )}
            </button>
          </form>

          <p className="text-[11px] text-slate-400">
            Green & Clean • Versione Dipendenti (Sola visualizzazione turni)
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // OPERATOR MOBILE DASHBOARD
  // ----------------------------------------------------
  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full pb-10">
      {/* HEADER SUPERIORE */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 font-bold text-base">
            {operator.firstName ? operator.firstName.charAt(0) : 'O'}
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight text-slate-900 dark:text-slate-100">
              {operator.firstName} {operator.lastName}
            </h2>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Operatore #{operator.username}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          title="Esci"
          className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-rose-600 hover:border-rose-300 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* CONTENUTO PRINCIPALE */}
      <main className="p-4 space-y-5">
        {/* DATA E ORA LIVE */}
        <div className="text-center py-1">
          <p className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
            {format(currentTime, 'EEEE, d MMMM yyyy', { locale: it })}
          </p>
          <div className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100 font-mono mt-0.5">
            {format(currentTime, 'HH:mm:ss')}
          </div>
        </div>

        {/* FEEDBACK TIMBRATURA */}
        {clockSuccessMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 font-bold text-center text-sm shadow-sm animate-in fade-in zoom-in-95">
            {clockSuccessMessage}
          </div>
        )}

        {/* ============================================================== */}
        {/* CARD TIMBRATURA RAPIDA                                         */}
        {/* ============================================================== */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-lg border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Stato Turno di Oggi
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                shiftStatus === 'not_started'
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  : shiftStatus === 'in_progress'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
              }`}
            >
              {shiftStatus === 'not_started' && 'Non Iniziato'}
              {shiftStatus === 'in_progress' && (isCurrentlyInPause ? 'In Pausa ☕' : 'In Servizio 🟢')}
              {shiftStatus === 'completed' && 'Turno Concluso ✅'}
            </span>
          </div>

          {/* Dettaglio timbrature odierne */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Entrata Odierna</span>
              <span className="font-bold text-base text-slate-800 dark:text-slate-200">
                {todayEntry?.timestamp?.toDate
                  ? format(todayEntry.timestamp.toDate(), 'HH:mm')
                  : '--:--'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Uscita Odierna</span>
              <span className="font-bold text-base text-slate-800 dark:text-slate-200">
                {todayExit?.timestamp?.toDate
                  ? format(todayExit.timestamp.toDate(), 'HH:mm')
                  : '--:--'}
              </span>
            </div>
          </div>

          {/* PULSANTI DI TIMBRATURA SMART */}
          {shiftStatus === 'not_started' && (
            <button
              onClick={() => handleClockAction('entrata')}
              disabled={isClocking}
              className="w-full h-18 py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-xl rounded-2xl shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-3"
            >
              {isClocking ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Play className="h-6 w-6 fill-current" />
                  TIMBRA ENTRATA
                </>
              )}
            </button>
          )}

          {shiftStatus === 'in_progress' && (
            <div className="space-y-2.5">
              <button
                onClick={() => handleClockAction('uscita')}
                disabled={isClocking}
                className="w-full h-18 py-4 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-black text-xl rounded-2xl shadow-xl shadow-rose-600/30 transition-all flex items-center justify-center gap-3"
              >
                {isClocking ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Square className="h-6 w-6 fill-current" />
                    TIMBRA USCITA
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {!isCurrentlyInPause ? (
                  <button
                    onClick={() => handleClockAction('pausa')}
                    disabled={isClocking}
                    className="h-11 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Coffee className="h-4 w-4" />
                    Inizia Pausa
                  </button>
                ) : (
                  <button
                    onClick={() => handleClockAction('fine_pausa')}
                    disabled={isClocking}
                    className="h-11 border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 col-span-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Termina Pausa
                  </button>
                )}

                {!isCurrentlyInPause && (
                  <div className="flex items-center justify-center text-[11px] text-slate-400 font-medium">
                    In servizio dal mattino
                  </div>
                )}
              </div>
            </div>
          )}

          {shiftStatus === 'completed' && (
            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center space-y-1">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Hai già completato la timbratura per oggi!
              </p>
              <p className="text-xs text-slate-500">
                Entrata:{' '}
                {todayEntry?.timestamp?.toDate &&
                  format(todayEntry.timestamp.toDate(), 'HH:mm')}{' '}
                — Uscita:{' '}
                {todayExit?.timestamp?.toDate &&
                  format(todayExit.timestamp.toDate(), 'HH:mm')}
              </p>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* RIEPILOGO MENSILE SMART (Ore Ordinarie, Straordinari, Malattia) */}
        {/* ============================================================== */}
        <section className="space-y-3">
          {/* Mese selezionato con navigazione */}
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-lg text-slate-900 dark:text-slate-100 capitalize">
              Riepilogo {format(selectedMonth, 'MMMM yyyy', { locale: it })}
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedMonth((p) => subMonths(p, 1))}
                className="h-8 w-8 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSelectedMonth(new Date())}
                className="px-2.5 h-8 text-[11px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Oggi
              </button>
              <button
                onClick={() => setSelectedMonth((p) => addMonths(p, 1))}
                className="h-8 w-8 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 4 Card compatte e chiare per il dipendente */}
          <div className="grid grid-cols-2 gap-3">
            {/* ORE ORDINARIE */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Clock className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Ore Ordinarie</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {computedSummary ? `${computedSummary.ordinaryHours}h` : '0h'}
              </div>
              <p className="text-[11px] text-slate-400">
                {computedSummary ? `${computedSummary.ordinaryWorkedDays} giorni lavorati` : '0 giorni'}
              </p>
            </div>

            {/* ORE STRAORDINARIE */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
              <div className="flex items-center gap-2 text-amber-500">
                <Flame className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Straordinari</span>
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {computedSummary ? `${computedSummary.overtimeHours}h` : '0h'}
              </div>
              <p className="text-[11px] text-slate-400">Oltre monte ore contrattuale</p>
            </div>

            {/* GIORNI MALATTIA */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
              <div className="flex items-center gap-2 text-rose-500">
                <HeartPulse className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Malattia</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {computedSummary ? `${computedSummary.malattiaDays} gg` : '0 gg'}
              </div>
              <p className="text-[11px] text-slate-400">Giorni certificati INPS</p>
            </div>

            {/* FERIE E PERMESSI */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
              <div className="flex items-center gap-2 text-blue-500">
                <Sun className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Ferie / Permessi</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {computedSummary
                  ? `${computedSummary.ferieDays} gg / ${computedSummary.permessoHours}h`
                  : '0 gg'}
              </div>
              <p className="text-[11px] text-slate-400">Ferie godute e permessi</p>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* AGENDA & STORICO TURNI DEL MESE (SOLA LETTURA)                 */}
        {/* ============================================================== */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              Agenda Turni ({agendaDays.length})
            </h3>
            <span className="text-xs font-medium text-slate-400">Sola visualizzazione</span>
          </div>

          {agendaDays.length === 0 ? (
            <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 space-y-1">
              <Calendar className="h-8 w-8 mx-auto opacity-40" />
              <p className="font-semibold text-sm">Nessuna timbratura registrata questo mese.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {agendaDays.map((item, idx) => {
                const entry = item.events.find((e) => e.type === 'entrata');
                const exit = item.events.find((e) => e.type === 'uscita');
                const isApproved = item.events.some((e) => e.status === 'confermata');
                const isPending = item.events.some((e) => e.status === 'sospesa');

                const entryTime = entry?.timestamp?.toDate
                  ? format(entry.timestamp.toDate(), 'HH:mm')
                  : '--:--';
                const exitTime = exit?.timestamp?.toDate
                  ? format(exit.timestamp.toDate(), 'HH:mm')
                  : '--:--';

                // Ore approvate se presenti dall'amministratore
                const approvedOrd = entry?.approvedOrdinaryHours;
                const approvedOver = entry?.approvedOvertimeHours;

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 capitalize">
                        {format(item.date, 'EEEE d MMMM', { locale: it })}
                      </span>

                      {/* BADGE STATO AMMINISTRATORE */}
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Approvato
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
                          <Clock className="h-3 w-3" />
                          In attesa
                        </span>
                      ) : null}
                    </div>

                    {/* ORARI TIMBRATI */}
                    {item.events.length > 0 && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Entrata</span>
                            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                              {entryTime}
                            </span>
                          </div>
                          <span className="text-slate-300">→</span>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Uscita</span>
                            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                              {exitTime}
                            </span>
                          </div>
                        </div>

                        {/* Totale ore approvate se disponibili */}
                        {(approvedOrd !== undefined || approvedOver !== undefined) && (
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px]">Ore Riconosciute</span>
                            <span className="font-extrabold text-xs text-emerald-600 dark:text-emerald-400">
                              {approvedOrd || 0}h ord
                              {approvedOver ? ` + ${approvedOver}h str` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* EVENTUALI RICHIESTE (Ferie / Malattia / Permesso) */}
                    {item.requests.map((req, rIdx) => (
                      <div
                        key={rIdx}
                        className="text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between font-semibold"
                      >
                        <span className="capitalize text-slate-600 dark:text-slate-300">
                          {req.type === 'malattia' && '🤒 Malattia'}
                          {req.type === 'ferie' && '🏖️ Ferie'}
                          {req.type === 'permesso' && '⏱️ Permesso'}
                          {req.type === 'straordinario' && '⚡ Straordinario'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {req.hours ? `${req.hours}h` : 'Giornata'}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
