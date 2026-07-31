// src/lib/calculations.ts

import { Timestamp } from 'firebase/firestore';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, set, startOfDay, addDays, subDays, parse, endOfDay as dateFnsEndOfDay, isSunday } from 'date-fns';
import { isPublicHoliday } from '@/lib/holidays';
import { it } from 'date-fns/locale';

// Type Definitions
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number;
};

type WorkSchedule = {
    [key in DayOfWeek]?: DailySchedule;
};

type Operator = {
    id: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    workSchedule: WorkSchedule;
    entryTolerance?: number;
    ordinaryHalfHourTrigger?: number;
    ordinaryHourTrigger?: number;
    scheduleType?: 'daily' | 'monthly';
    monthlyContractualHours?: number;
    overtimeHalfHourTrigger?: number;
    overtimeHourTrigger?: number;
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
    sickLeaveRate?: number;
    employmentStartDate?: Timestamp;
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    isOvertime?: boolean;
    isAuto?: boolean;
    ignoreContractualStart?: boolean;
    makeupOfDay?: string; // ISO date string 'YYYY-MM-DD'
    shiftId?: string;
    approvedOrdinaryHours?: number; // Manually approved hours
    approvedOvertimeHours?: number;  // Manually approved hours
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario' | 'recupero_straordinari';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    deductFromOvertime?: boolean;
    associatedShiftId?: string;
    dailyCosts?: { [date: string]: number };
};

export type DailyNote = {
    date: string;
    note?: string; // Legacy field, keeping for compatibility if used
    privateNote?: string;
    publicNote?: string;
    showOnMonthlyReport?: boolean;
    showOnEOMReport?: boolean;
};


type Shift = {
    date: Date;
    events: Timbratura[];
    contractualHours: number;
    workedMinutes: number;
    ordinaryMinutes: number;
    overtimeMinutes: number;
    isPureOvertime: boolean;
};


type SingleShiftBlock = {
    events: Timbratura[];
    calculationStart?: Date;
    calculationEnd?: Date;
};

export type DailyDetail = {
    date: Date;
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo' | 'festa' | 'in_corso' | 'recupero_effettuato' | 'vuoto';
    shift: {
        allShifts?: SingleShiftBlock[];
        events: Timbratura[];
        contractualHours: number;
        ordinaryHours: number;
        overtimeHours: number;
        permissionHours: number;
        recuperoHours: number;
        calculationStart?: Date;
        calculationEnd?: Date;
    } | null;
    request: Request | null;
    note?: DailyNote;
    makeupPerformedFor?: string;
    makeupActivityFor?: string[];
};


export type MonthlySummary = {
    ordinaryWorkedDays: number;
    ordinaryHours: number;
    overtimeHours: number;
    ferieCost: number; 
    permessoCost: number;
    absenceDays: number;
    malattiaCost: number;
    ferieDays: number;
    ferieHours: number;
    permessoHours: number;
    malattiaDays: number;
    festiveHours: number;
    estimatedTotalCost: number;
    expectedMonthlyHours: number;
    recuperoStraordinariHours?: number;
    isPermessoDeductedFromOvertime?: boolean;
    totalDueOverride?: number;
};

export const roundOrdinaryHours = (minutes: number): number => {
    if (minutes <= 0) return 0;
    const totalHalfHours = Math.floor(minutes / 30);
    const remainingMinutes = minutes % 30;
    return (totalHalfHours / 2) + (remainingMinutes >= 25 ? 0.5 : 0);
};


export const roundOvertimeHours = (minutes: number, halfHourTrigger: number = 25, hourTrigger: number = 45): number => {
    if (minutes <= 0) return 0;
    
    const totalHours = Math.floor(minutes / 60);
    const extraMinutes = minutes % 60;
    
    let extraHours = 0;
    if (extraMinutes >= hourTrigger) {
        extraHours = 1;
    } else if (extraMinutes >= halfHourTrigger) {
        extraHours = 0.5;
    }
    
    return totalHours + extraHours;
};

export const calculatePureOvertime = (
    shift: { events: { type: string, timestamp: Timestamp }[] },
    operator: Operator,
    manualBreak?: { start: string, end: string }
): number => {
    const clockInEvent = shift.events.find(e => e.type === 'entrata');
    const clockOutEvent = shift.events.find(e => e.type === 'uscita');

    if (!clockInEvent || !clockOutEvent) return 0;
    
    const clockInTime = clockInEvent.timestamp.toDate();
    const clockOutTime = clockOutEvent.timestamp.toDate();
    const schedule = getScheduleForDate(operator, clockInTime);

    let referenceStartTime = clockInTime;
    
    if (schedule?.startTime) {
        const [h, m] = schedule.startTime.split(':').map(Number);
        const contractualStart = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        if (clockInTime < contractualStart) {
            referenceStartTime = contractualStart;
        }
    }
    
    let breakDurationMillis = 0;
    if (manualBreak) {
        const createTimestamp = (time: string): Date => {
            const [h,m] = time.split(':').map(Number);
            return set(clockInTime, { hours: h, minutes: m });
        }
        breakDurationMillis = createTimestamp(manualBreak.end).getTime() - createTimestamp(manualBreak.start).getTime();
    } else {
        let breakStartTs: Timestamp | null = null;
        const sortedEvents = [...shift.events].sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
        for (const e of sortedEvents) {
            if (e.type === 'pausa') breakStartTs = e.timestamp;
            if (e.type === 'fine_pausa' && breakStartTs) {
                breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
                breakStartTs = null;
            }
        }
    }

    const effectiveMillis = clockOutTime.getTime() - referenceStartTime.getTime() - breakDurationMillis;
    const effectiveMinutes = effectiveMillis > 0 ? Math.floor(effectiveMillis / (1000 * 60)) : 0;

    return roundOvertimeHours(effectiveMinutes, operator.overtimeHalfHourTrigger, operator.overtimeHourTrigger);
}



export const getScheduleForDate = (operator: Operator | undefined | null, date: Date): DailySchedule | undefined => {
    if (!operator || !operator.workSchedule) return undefined;
    const dayName = dayIndexToName[getDay(date)];
    
    // Check if workScheduleHistory exists
    const history = (operator as any).workScheduleHistory;
    if (history && Array.isArray(history) && history.length > 0) {
        const sortedHistory = [...history].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
        const dateStr = format(date, 'yyyy-MM-dd');
        const activeHistoryItem = sortedHistory.find(h => h.effectiveDate <= dateStr);
        if (activeHistoryItem && activeHistoryItem.workSchedule && activeHistoryItem.workSchedule[dayName]) {
            return activeHistoryItem.workSchedule[dayName];
        }
    }

    const currentDaySchedule = operator.workSchedule[dayName];
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // The 14:30 reference start time prior to July 17 applies ONLY to Francesco Marino
    const isFrancescoMarino = 
        (operator.firstName?.trim().toLowerCase() === 'francesco' && operator.lastName?.trim().toLowerCase() === 'marino') ||
        operator.username?.trim().toLowerCase().includes('francesco') ||
        (operator as any).name?.trim().toLowerCase().includes('francesco marino');

    if (isFrancescoMarino && dateStr <= '2026-07-16') {
        return {
            totalHours: currentDaySchedule?.totalHours || 4,
            startTime: '14:30',
            endTime: '18:30',
            breakMinutes: currentDaySchedule?.breakMinutes || 0
        };
    }
    
    return currentDaySchedule;
};

export const calculateShiftDetails = (
    events: Timbratura[], 
    schedule: DailySchedule | undefined, 
    ignoreContractualStart: boolean = false, 
    operator?: Operator
): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date | null, breakMinutes: number, contractualEndTime: Date | null, earlyOvertimeHours: number } => {
    const clockInEvent = events.find(e => e.type === 'entrata');
    const clockOutEvent = events.find(e => e.type === 'uscita');

    if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null, calculationEnd: null, breakMinutes: 0, contractualEndTime: null, earlyOvertimeHours: 0 };

    const clockInTime = clockInEvent.timestamp.toDate();
    let calculationStartTime = clockInTime;
    
    // Check early morning entrance rules:
    // Before 05:30 -> 2 hours overtime
    // Before 06:30 (between 05:30 and 06:29) -> 1 hour overtime
    const clockInMinutesOfDay = clockInTime.getHours() * 60 + clockInTime.getMinutes();
    let earlyOvertimeHours = 0;
    if (clockInMinutesOfDay < 5 * 60 + 30) { // before 05:30
        earlyOvertimeHours = 2;
    } else if (clockInMinutesOfDay < 6 * 60 + 30) { // before 06:30
        earlyOvertimeHours = 1;
    }

    const effectiveSchedule = (operator && clockInTime) ? getScheduleForDate(operator, clockInTime) : schedule;
    const customRefStart = (clockInEvent as any).customReferenceStart;
    const activeStartTime = customRefStart || effectiveSchedule?.startTime;

    // 1. Determine Calculation Start Time
    if (earlyOvertimeHours > 0) {
        if (activeStartTime && !ignoreContractualStart) {
            const [h, m] = activeStartTime.split(':').map(Number);
            calculationStartTime = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        } else {
            calculationStartTime = set(clockInTime, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 });
        }
    } else if (activeStartTime && !ignoreContractualStart) {
        // --- Logic for operators WITH a contractual start time ---
        const [h, m] = activeStartTime.split(':').map(Number);
        const contractualStartDateTime = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });

        const minutesLate = (clockInTime.getTime() - contractualStartDateTime.getTime()) / (1000 * 60);

        const activeEntryTolerance = operator?.entryTolerance ?? 15;

        if (minutesLate <= activeEntryTolerance) { // Includes clocking in early, up to tolerance
            calculationStartTime = contractualStartDateTime;
        } else {
            // If more than tolerance late, round to the next half hour
            const roundedTime = set(clockInTime, { seconds: 0, milliseconds: 0 });
            if (roundedTime.getMinutes() > 30) {
                roundedTime.setHours(roundedTime.getHours() + 1, 0);
            } else {
                roundedTime.setMinutes(30);
            }
            calculationStartTime = roundedTime;
        }
    } else {
        // --- Universal rounding logic for operators WITHOUT a contractual start time ---
        const minutes = clockInTime.getMinutes();
        const roundedTime = set(clockInTime, { seconds: 0, milliseconds: 0 });

        if (minutes > 0 && minutes <= 15) {
            roundedTime.setMinutes(0);
        } else if (minutes > 15 && minutes <= 45) {
            roundedTime.setMinutes(30);
        } else if (minutes > 45) {
            roundedTime.setHours(roundedTime.getHours() + 1, 0);
        }
        calculationStartTime = roundedTime;
    }
    
    const clockOutTime = clockOutEvent.timestamp.toDate();

    // 2. Determine Calculation End Time
    const clockOutMinutes = clockOutTime.getMinutes();
    let calculationEndTime = set(clockOutTime, { seconds: 0, milliseconds: 0 });

    // 3. Determine Contractual End Time first, to check if it's overtime
    let contractualEndTime: Date | null = null;
    if (schedule) {
       const breakDuration = schedule.breakMinutes || 0;
       if (schedule.endTime) {
            const [h, m] = schedule.endTime.split(':').map(Number);
            contractualEndTime = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        } else if (schedule.totalHours) {
            let startBaseForEnd = calculationStartTime;
            if (schedule.startTime) {
                 const [h, m] = schedule.startTime.split(':').map(Number);
                 startBaseForEnd = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
            }
            contractualEndTime = new Date(startBaseForEnd.getTime() + (schedule.totalHours * 60 + breakDuration) * 60 * 1000);
        }
    }

    const isMonthly = operator?.scheduleType === 'monthly';
    const isOvertimeExit = isMonthly ? false : (contractualEndTime ? clockOutTime > contractualEndTime : false);
    
    // Choose which triggers to use
    const hTrigger = isOvertimeExit ? (operator?.overtimeHourTrigger ?? 45) : (operator?.ordinaryHourTrigger ?? 45);
    const hhTrigger = isOvertimeExit ? (operator?.overtimeHalfHourTrigger ?? 25) : (operator?.ordinaryHalfHourTrigger ?? 25);

    if (clockOutMinutes >= hTrigger) {
        calculationEndTime.setHours(calculationEndTime.getHours() + 1, 0);
    } else if (clockOutMinutes >= hhTrigger) {
        calculationEndTime.setMinutes(30);
    } else {
        calculationEndTime.setMinutes(0);
    }

    // 4. Calculate Break Duration
    let breakDurationMillis = 0;
    let breakStartTs: Timestamp | null = null;
    const sortedEvents = [...events].sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    for (const e of sortedEvents) {
        if (e.type === 'pausa') breakStartTs = e.timestamp;
        if (e.type === 'fine_pausa' && breakStartTs) {
            breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
            breakStartTs = null;
        }
    }

    // 5. Calculate Total Worked Milliseconds from the correct start time
    const totalMillis = calculationEndTime.getTime() - calculationStartTime.getTime();
    const workedMillis = totalMillis > 0 ? totalMillis - breakDurationMillis : 0;
    const workedMinutes = workedMillis > 0 ? Math.floor(workedMillis / (1000 * 60)) : 0;

    return { 
        workedMinutes,
        calculationStart: calculationStartTime,
        calculationEnd: calculationEndTime,
        breakMinutes: Math.floor(breakDurationMillis / 60000),
        contractualEndTime: contractualEndTime,
        earlyOvertimeHours
    };
};

export const calculateHours = (
    shift: { date: Date, events: Timbratura[] }, 
    schedule: DailySchedule | undefined, 
    ignoreContractualStart: boolean = false, 
    operator?: Operator
): { ordinary: number, overtime: number, leave: number, worked: number, break: number, calculationStart: Date | null, calculationEnd: Date | null } => {
    const clockInEvent = shift.events.find(e => e.type === 'entrata');
    
    // Check if the shift was manually approved with specific hours
    if (clockInEvent?.status === 'confermata' && typeof clockInEvent.approvedOrdinaryHours === 'number') {
        const approvedOrdinary = clockInEvent.approvedOrdinaryHours || 0;
        const approvedOvertime = clockInEvent.approvedOvertimeHours || 0;
        // Still calculate the real worked minutes for display
        const { workedMinutes, breakMinutes, calculationStart, calculationEnd } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart, operator);
        
        return {
            ordinary: approvedOrdinary,
            overtime: approvedOvertime,
            leave: 0, // When manually setting hours, we assume leave is handled separately
            worked: workedMinutes,
            break: breakMinutes,
            calculationStart,
            calculationEnd,
        };
    }

    const { workedMinutes, breakMinutes, calculationStart, calculationEnd, earlyOvertimeHours } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart, operator);
    
    const isMonthly = operator?.scheduleType === 'monthly';
    const contractualHours = (isMonthly ? Infinity : schedule?.totalHours) || 0;
    const contractualMinutes = contractualHours * 60;
    const isMakeupShift = !!clockInEvent?.makeupOfDay;
    const isWorkDay = isMakeupShift || contractualHours > 0;
    
    if (!isWorkDay && !isMonthly) {
        const overtime = roundOvertimeHours(workedMinutes, operator?.overtimeHalfHourTrigger, operator?.overtimeHourTrigger) + (earlyOvertimeHours || 0);
        return { ordinary: 0, overtime, leave: 0, worked: workedMinutes, break: breakMinutes, calculationStart, calculationEnd };
    }

    const ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
    const overtimeMinutes = Math.max(0, workedMinutes - contractualMinutes);
    const ordinaryHours = roundOrdinaryHours(ordinaryMinutes); // Internally handles half-hour blocks based on exact workedMinutes
    const overtimeHours = roundOvertimeHours(overtimeMinutes, operator?.overtimeHalfHourTrigger, operator?.overtimeHourTrigger) + (earlyOvertimeHours || 0);
    
    // Monthly workers never accrue daily leave (Infinity check prevents it), skip if IS monthly
    // Per gli operatori mensili non calcoliamo automaticamente i permessi per coprire i "buchi" giornalieri.
    // Il calcolo si basa sul monte ore mensile totale.
    const leaveHours = (!isMonthly && isWorkDay && ordinaryHours < contractualHours) ? contractualHours - ordinaryHours : 0;

    return { 
        ordinary: ordinaryHours, 
        overtime: overtimeHours, 
        leave: leaveHours,
        worked: workedMinutes,
        break: breakMinutes,
        calculationStart,
        calculationEnd
    };
};


export const processMonthlyData = (
    currentMonth: Date,
    operator: Operator,
    data: { 
        timbrature: Timbratura[], 
        requests: Request[], 
        dailyNotes?: DailyNote[], 
        straordinari?: { 
            id: string; 
            events: { type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita'; timestamp: Timestamp; }[]; 
            status: 'in_corso' | 'in_attesa_di_approvazione' | 'approvato' | 'rifiutato'; 
            date: Timestamp; 
            approvedHours?: number 
        }[],
        employmentStartDate?: Date,
        overrides?: any
    }
): { monthlySummary: MonthlySummary, dailyDetails: DailyDetail[] } => {
    
    const monthInterval = { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) };
    const today = startOfDay(new Date());

    // Prioritize explicitly passed start date, otherwise use operator field if it exists
    const effectiveEmploymentStartDate = data.employmentStartDate || (operator.employmentStartDate ? operator.employmentStartDate.toDate() : undefined);

    const detailsMap = new Map<string, DailyDetail>();
    const allDaysOfMonth = eachDayOfInterval(monthInterval);

    allDaysOfMonth.forEach(day => {
        const dayISO = startOfDay(day).toISOString();
        detailsMap.set(dayISO, {
            date: day,
            status: 'vuoto', // Initial status
            shift: null,
            request: null,
        });
    });

    const allTimbrature = data.timbrature.filter(t => t.timestamp && typeof t.timestamp.toDate === 'function');
    
    const modernEvents = allTimbrature.filter(e => e.shiftId);
    const legacyEvents = allTimbrature.filter(e => !e.shiftId);

    const shiftsToProcess: { events: Timbratura[], date: Date }[] = [];

    // Process modern events by shiftId
    const modernShiftsById: { [id: string]: Timbratura[] } = {};
    modernEvents.forEach(timbratura => {
        if (timbratura.shiftId) {
            if (!modernShiftsById[timbratura.shiftId]) {
                modernShiftsById[timbratura.shiftId] = [];
            }
            modernShiftsById[timbratura.shiftId].push(timbratura);
        }
    });

    Object.values(modernShiftsById).forEach(events => {
        const entrataEvent = events.find(e => e.type === 'entrata');
        if (entrataEvent) {
             const effectiveDate = entrataEvent.makeupOfDay
                ? parse(entrataEvent.makeupOfDay, 'yyyy-MM-dd', new Date())
                : entrataEvent.timestamp.toDate();
            shiftsToProcess.push({ events, date: effectiveDate });
        }
    });

    // Process legacy events by day
    const legacyShiftsByDay: { [date: string]: Timbratura[] } = {};
    legacyEvents.forEach(event => {
        const dayString = format(event.timestamp.toDate(), 'yyyy-MM-dd');
        if (!legacyShiftsByDay[dayString]) {
            legacyShiftsByDay[dayString] = [];
        }
        legacyShiftsByDay[dayString].push(event);
    });

    Object.values(legacyShiftsByDay).forEach(events => {
        const entrataEvent = events.find(e => e.type === 'entrata');
         if (entrataEvent) {
            const effectiveDate = entrataEvent.makeupOfDay
                ? parse(entrataEvent.makeupOfDay, 'yyyy-MM-dd', new Date())
                : entrataEvent.timestamp.toDate();
            shiftsToProcess.push({ events, date: effectiveDate });
        }
    });
    
    const makeupTargets: { [key: string]: string[] } = {};
    shiftsToProcess.forEach(({ events }) => {
        const entrataEvent = events.find(e => e.type === 'entrata');
        if (entrataEvent && entrataEvent.makeupOfDay) {
            const physicalDate = entrataEvent.timestamp.toDate();
            const physicalDateISO = startOfDay(physicalDate).toISOString();
            const effectiveDate = parse(entrataEvent.makeupOfDay, 'yyyy-MM-dd', new Date());

            if (!makeupTargets[physicalDateISO]) {
                makeupTargets[physicalDateISO] = [];
            }
            const makeupNote = format(effectiveDate, 'dd MMM', { locale: it });
            if (!makeupTargets[physicalDateISO].includes(makeupNote)) {
                makeupTargets[physicalDateISO].push(makeupNote);
            }
        }
    });


    shiftsToProcess.forEach(({ events, date }) => {
        if (!isWithinInterval(date, monthInterval)) {
            return;
        }

        const effectiveDateISO = startOfDay(date).toISOString();
        const detail = detailsMap.get(effectiveDateISO);
        if (!detail) return;

        const dailySchedule = getScheduleForDate(operator, date);
        
        const isShiftComplete = events.some(e => e.type === 'uscita');
        const physicalDate = events.find(e => e.type === 'entrata')!.timestamp.toDate();
        const isTodayAndInProgress = isSameDay(physicalDate, today) && !isShiftComplete;

        if (isTodayAndInProgress) {
            detail.status = 'in_corso';
        } else {
            detail.status = 'lavorato';
        }
        
        const hoursResult = calculateHours({ date, events }, dailySchedule, events.find(e=>e.type==='entrata')?.ignoreContractualStart, operator);

        if (!detail.shift) {
            detail.shift = {
                events: [], allShifts: [], contractualHours: 0,
                ordinaryHours: 0, overtimeHours: 0, permissionHours: 0, recuperoHours: 0,
            };
        }
        
        detail.shift.events.push(...events);
        detail.shift.allShifts = detail.shift.allShifts || [];
        detail.shift.allShifts.push({
            events,
            calculationStart: hoursResult.calculationStart || undefined,
            calculationEnd: hoursResult.calculationEnd || undefined
        });

        detail.shift.ordinaryHours += hoursResult.ordinary;
        detail.shift.overtimeHours += hoursResult.overtime;
        
        if (events.find(e => e.type === 'entrata')?.makeupOfDay) {
            detail.makeupPerformedFor = format(physicalDate, 'dd MMM', { locale: it });
            const physicalDateISO = startOfDay(physicalDate).toISOString();
            const physicalDayDetail = detailsMap.get(physicalDateISO);
            if (physicalDayDetail) {
                physicalDayDetail.makeupActivityFor = physicalDayDetail.makeupActivityFor || [];
                if (!physicalDayDetail.makeupActivityFor.includes(format(date, 'dd MMM', { locale: it }))) {
                    physicalDayDetail.makeupActivityFor.push(format(date, 'dd MMM', { locale: it }));
                }
            }
        }
    });

    data.straordinari?.forEach(straordinario => {
        const day = straordinario.date.toDate();
        if (!isWithinInterval(day, monthInterval)) return;
        
        const dayISO = startOfDay(day).toISOString();
        const detail = detailsMap.get(dayISO);
        if (!detail) return;
        
        if (straordinario.status === 'approvato') {
            detail.status = 'lavorato';
            const overtimeHours = straordinario.approvedHours ?? calculatePureOvertime(straordinario, operator);

            if (!detail.shift) {
                detail.shift = { events: [], contractualHours: 0, ordinaryHours: 0, overtimeHours: 0, permissionHours: 0, recuperoHours: 0 };
            }
            detail.shift.overtimeHours += overtimeHours;
            detail.shift.events.push(...(straordinario.events as unknown as Timbratura[]));
            detail.shift.allShifts = detail.shift.allShifts || [];
            detail.shift.allShifts.push({ events: straordinario.events as unknown as Timbratura[] });
        }
    });

    detailsMap.forEach(detail => {
        const leaveRequest = data.requests.find(r => (r.type === 'ferie' || r.type === 'malattia') && isWithinInterval(detail.date, { start: startOfDay(r.startDate.toDate()), end: dateFnsEndOfDay(r.endDate.toDate()) }));
        if (leaveRequest) {
            detail.status = leaveRequest.type as 'ferie' | 'malattia';
            detail.request = leaveRequest;
            detail.shift = null;
        }

        const dayReqs = data.requests.filter(r => r.status === 'approvato' && (r.type === 'permesso' || r.type === 'recupero_straordinari') && isSameDay(r.startDate.toDate(), detail.date));
        const effectivePermissionHours = dayReqs.reduce((max, r) => Math.max(max, r.hours || 0), 0);
        const deductPermissi = data.requests.filter(r => r.status === 'approvato' && r.type === 'permesso' && r.deductFromOvertime === true && isSameDay(r.startDate.toDate(), detail.date));
        const deductHours = deductPermissi.reduce((sum, r) => sum + (r.hours || 0), 0);

        if (detail.shift) {
            detail.shift.permissionHours = effectivePermissionHours;
            detail.shift.recuperoHours = 0;
        }

        const dailyNote = data.dailyNotes?.find(n => n.date === format(detail.date, 'yyyy-MM-dd'));
        if (dailyNote) {
            detail.note = { ...dailyNote };
        }

        const isConfirmedShift = detail.shift && detail.shift.events.length > 0 && detail.shift.events.every(e => e.status === 'confermata');
        if (deductHours > 0 && isConfirmedShift) {
            const noteText = `${deductHours} ${deductHours === 1 ? 'ora' : 'ore'} di permesso compensate da straordinari`;
            if (!detail.note) {
                detail.note = {
                    date: format(detail.date, 'yyyy-MM-dd'),
                    publicNote: noteText,
                    showOnMonthlyReport: true,
                    showOnEOMReport: true
                };
            } else {
                detail.note.publicNote = detail.note.publicNote ? `${detail.note.publicNote} (${noteText})` : noteText;
            }
        }

        if (detail.status === 'vuoto') {
            const isBeforeEmployment = effectiveEmploymentStartDate && startOfDay(detail.date) < startOfDay(effectiveEmploymentStartDate);

            const dayName = dayIndexToName[getDay(detail.date)];
            const isWorkDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
            const isHoliday = isPublicHoliday(detail.date);
            
            const makeupNote = makeupTargets[startOfDay(detail.date).toISOString()];
            
            if (isBeforeEmployment) {
                detail.status = 'vuoto';
            } else if (makeupNote && makeupNote.length > 0) {
                detail.makeupActivityFor = makeupNote;
                detail.status = 'riposo';
            } else if (isHoliday) {
                detail.status = 'festa';
            } else if (isWorkDay && detail.date < today) {
                detail.status = 'mancata_timbratura';
            } else if (!isWorkDay && detail.date <= today) {
                detail.status = 'riposo';
            }
        }

        // Apply manual overrides from Foglio Presenze (Viceversa Sync)
        const opId = operator.id;
        const day = format(detail.date, 'd');
        const manualStatus = data.overrides?.[`${opId}-O-${day}`];
        if (manualStatus) {
            if (manualStatus === 'P') detail.status = 'lavorato';
            else if (manualStatus === 'A') detail.status = 'mancata_timbratura';
            else if (manualStatus === 'M') detail.status = 'malattia';
            else if (manualStatus === 'F') detail.status = 'ferie';
            else if (manualStatus === 'FG') detail.status = 'festa';
            else if (manualStatus === '/') detail.status = 'riposo';
        }
    });
    
    const dailyDetails = Array.from(detailsMap.values()).filter(d => {
        // Only include days up to today. Future days should not appear in any report/calculation.
        return d.date <= today;
    });


    let totalOrdinaryHours = 0;
    let totalOvertimeHours = 0;
    let totalFerieCost = 0;
    let totalPermessoCost = 0;
    let totalMalattiaCost = 0;
    let ordinaryWorkedDays = 0;
    let absenceDays = 0;
    let ferieDays = 0;
    let ferieHours = 0;
    let malattiaDays = 0;
    let festiveHours = 0;
    let expectedMonthlyHours = 0;

    dailyDetails.forEach(detail => {
        if (!isWithinInterval(detail.date, monthInterval)) return;
        
        // A shift is considered approved/confirmed only if all its events are 'confermata' or overridden manually by admin
        const opId = operator.id;
        const day = format(detail.date, 'd');
        const manualStatus = data.overrides?.[`${opId}-O-${day}`];
        const isApprovedShift = (detail.shift && detail.shift.events.length > 0 && detail.shift.events.every(e => e.status === 'confermata')) || manualStatus === 'P';

        if ((detail.status === 'lavorato' || detail.status === 'in_corso') && isApprovedShift) {
            const dayName = dayIndexToName[getDay(detail.date)];
            const isContractualDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
            const isHoliday = isPublicHoliday(detail.date);

            if (isContractualDay && !isHoliday) {
                ordinaryWorkedDays++;
            }

            if (detail.shift) {
                totalOrdinaryHours += detail.shift.ordinaryHours;
                totalOvertimeHours += detail.shift.overtimeHours;
                if (isSunday(detail.date) || isHoliday) {
                    festiveHours += detail.shift.ordinaryHours + detail.shift.overtimeHours;
                }
            }
        }
        switch (detail.status) {
            case 'ferie':
                ferieDays++;
                const dayNameFerie = dayIndexToName[getDay(detail.date)];
                ferieHours += operator.workSchedule[dayNameFerie]?.totalHours || 8;
                break;
            case 'malattia':
                malattiaDays++;
                break;
            case 'mancata_timbratura':
                absenceDays++;
                break;
        }

        // Calculate expected hours for the month
        const dayName = dayIndexToName[getDay(detail.date)];
        expectedMonthlyHours += operator.workSchedule[dayName]?.totalHours || 0;
    });
    
    totalFerieCost = 0; totalMalattiaCost = 0; totalPermessoCost = 0;
    data.requests.forEach(req => {
        if (req.status !== 'approvato' || !req.dailyCosts) return;
        for (const dateStr in req.dailyCosts) {
            const cost = req.dailyCosts[dateStr];
            if (isWithinInterval(parse(dateStr, 'yyyy-MM-dd', new Date()), monthInterval)) {
                if (req.type === 'ferie') totalFerieCost += cost;
                else if (req.type === 'malattia') totalMalattiaCost += cost;
                else if (req.type === 'permesso') totalPermessoCost += cost;
            }
        }
    });

    const totalPermessoHours = data.requests
        .filter(r => r.status === 'approvato' && r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval))
        .reduce((sum, r) => sum + (r.hours || 0), 0);
    
    let totalRecuperoStraordinariHours = 0;
    const recuperoRequestsByDay = new Map<string, number>();

    data.requests.forEach(r => {
        if (r.status !== 'approvato') return;
        const reqDate = r.startDate?.toDate ? r.startDate.toDate() : null;
        if (!reqDate || !isWithinInterval(reqDate, monthInterval)) return;

        const isRecupero = r.type === 'recupero_straordinari' || (r.type === 'permesso' && r.deductFromOvertime === true);
        if (!isRecupero) return;

        const dayISO = startOfDay(reqDate).toISOString();
        const dayDetail = detailsMap.get(dayISO);

        const opId = operator.id;
        const day = format(reqDate, 'd');
        const manualStatus = data.overrides?.[`${opId}-O-${day}`];
        const isApprovedShift = dayDetail?.shift && dayDetail.shift.events.length > 0 && 
            (dayDetail.shift.events.every(e => e.status === 'confermata') || manualStatus === 'P');

        // Overtime deduction ONLY applies if there is a confirmed/approved shift on that day
        if (isApprovedShift) {
            const current = recuperoRequestsByDay.get(dayISO) || 0;
            recuperoRequestsByDay.set(dayISO, Math.max(current, r.hours || 0));
        }
    });

    recuperoRequestsByDay.forEach(hours => {
        totalRecuperoStraordinariHours += hours;
    });

    // Adjust total ordinary and overtime hours by the recovered hours
    // Subtract from overtime, add to ordinary
    totalOrdinaryHours += totalRecuperoStraordinariHours;
    totalOvertimeHours -= totalRecuperoStraordinariHours;
    if (totalOvertimeHours < 0) {
        totalOvertimeHours = 0;
    }
    
    if (operator.scheduleType === 'monthly' && operator.monthlyContractualHours) {
        const totalWorked = totalOrdinaryHours + totalOvertimeHours;
        const target = operator.monthlyContractualHours;
        if (totalWorked > target) {
             totalOrdinaryHours = target;
             totalOvertimeHours = totalWorked - target;
        } else {
             totalOrdinaryHours = totalWorked;
             totalOvertimeHours = 0;
        }
    }

    const monthlySummary: MonthlySummary = {
        ordinaryWorkedDays, absenceDays, ordinaryHours: totalOrdinaryHours,
        overtimeHours: totalOvertimeHours, ferieCost: totalFerieCost,
        permessoCost: totalPermessoCost, ferieDays, ferieHours,
        permessoHours: totalPermessoHours, malattiaDays, malattiaCost: totalMalattiaCost,
        festiveHours,
        estimatedTotalCost: 0, // Will calculate below
        expectedMonthlyHours,
        recuperoStraordinariHours: totalRecuperoStraordinariHours,
        isPermessoDeductedFromOvertime: totalRecuperoStraordinariHours > 0
    };

    // Apply summary overrides from Foglio Presenze or Manual Rettifiche (Viceversa Sync)
    const opId = operator.id;
    if (data.overrides) {
        // Map Foglio Presenze Sum Columns to Summary Fields
        // Index 2: Per ferie (Hours), Index 9: Retribuiti (Ferie Days), Index 5: Carenza (Malattia Days)
        if (data.overrides[`${opId}-S-sum-9`] !== undefined) {
            const val = parseFloat(data.overrides[`${opId}-S-sum-9`]);
            if (!isNaN(val)) monthlySummary.ferieDays = val;
        }
        if (data.overrides[`${opId}-S-sum-2`] !== undefined) {
            const val = parseFloat(data.overrides[`${opId}-S-sum-2`]);
            if (!isNaN(val)) monthlySummary.ferieHours = val;
        }
        if (data.overrides[`${opId}-S-sum-5`] !== undefined) {
            const val = parseFloat(data.overrides[`${opId}-S-sum-5`]);
            if (!isNaN(val)) monthlySummary.malattiaDays = val;
        }
        if (data.overrides[`${opId}-S-sum-1`] !== undefined) {
            const val = parseFloat(data.overrides[`${opId}-S-sum-1`]);
            if (!isNaN(val)) monthlySummary.permessoHours = val;
        }
        // Direct property overrides from Situazione Attuale
        if (data.overrides[`${opId}-ferieDays`] !== undefined) monthlySummary.ferieDays = data.overrides[`${opId}-ferieDays`];
        if (data.overrides[`${opId}-malattiaDays`] !== undefined) monthlySummary.malattiaDays = data.overrides[`${opId}-malattiaDays`];
        if (data.overrides[`${opId}-permessoHours`] !== undefined) monthlySummary.permessoHours = data.overrides[`${opId}-permessoHours`];
        if (data.overrides[`${opId}-totalDueOverride`] !== undefined) monthlySummary.totalDueOverride = data.overrides[`${opId}-totalDueOverride`];
    }

    // Calculate estimated cost
    let rate = operator.hourlyRate || 0;
    if (operator.salaryType === 'fixed' && !operator.hourlyRate && operator.fixedSalary) {
        // Fallback for calculating overtime rate if hourlyRate isn't specified
        const monthlyHours = operator.monthlyContractualHours || expectedMonthlyHours || 160; 
        rate = operator.fixedSalary / monthlyHours;
    }
    const overtimeRate = operator.overtimeRate || (rate * 1.2); // Default 20% increase if not specified

    if (operator.salaryType === 'fixed' && operator.fixedSalary) {
        monthlySummary.estimatedTotalCost = operator.fixedSalary + (totalOvertimeHours * overtimeRate);
    } else {
        monthlySummary.estimatedTotalCost = (totalOrdinaryHours * rate) + (totalOvertimeHours * overtimeRate);
    }

    return {
        monthlySummary,
        dailyDetails: dailyDetails.sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
};