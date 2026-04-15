// src/lib/calculations.ts

import { Timestamp } from 'firebase/firestore';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, set, startOfDay, addDays, subDays, parse, endOfDay as dateFnsEndOfDay } from 'date-fns';
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
    workSchedule: WorkSchedule;
    overtimeHalfHourTrigger?: number;
    overtimeHourTrigger?: number;
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
    sickLeaveRate?: number;
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
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    associatedShiftId?: string;
    dailyCosts?: { [date: string]: number };
};

type DailyNote = {
    date: string;
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
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo' | 'festa' | 'in_corso' | 'recupero_effettuato';
    shift: {
        allShifts?: SingleShiftBlock[];
        events: Timbratura[];
        contractualHours: number;
        ordinaryHours: number;
        overtimeHours: number;
        permissionHours: number;
        calculationStart?: Date;
        calculationEnd?: Date;
    } | null;
    request: Request | null;
    note?: DailyNote;
    makeupPerformedFor?: string;
    makeupActivityFor?: string[];
};


export type MonthlySummary = {
    workedDays: number;
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
    const dayName = dayIndexToName[getDay(clockInTime)];
    const schedule = operator.workSchedule[dayName];

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



export const calculateShiftDetails = (events: Timbratura[], schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false, halfHourTrigger: number = 25, hourTrigger: number = 45): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date | null, breakMinutes: number, contractualEndTime: Date | null } => {
    const clockInEvent = events.find(e => e.type === 'entrata');
    const clockOutEvent = events.find(e => e.type === 'uscita');

    if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null, calculationEnd: null, breakMinutes: 0, contractualEndTime: null };

    const clockInTime = clockInEvent.timestamp.toDate();
    let calculationStartTime = clockInTime;
    
    // 1. Determine Calculation Start Time
    if (schedule?.startTime && !ignoreContractualStart) {
        // --- Logic for operators WITH a contractual start time ---
        const [h, m] = schedule.startTime.split(':').map(Number);
        const contractualStartDateTime = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });

        const minutesLate = (clockInTime.getTime() - contractualStartDateTime.getTime()) / (1000 * 60);

        if (minutesLate <= 15) { // Includes clocking in early, up to 15 mins late
            calculationStartTime = contractualStartDateTime;
        } else {
            // If more than 15 mins late, round to the next half hour
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

    if (clockOutMinutes >= hourTrigger) {
        calculationEndTime.setHours(calculationEndTime.getHours() + 1, 0);
    } else if (clockOutMinutes >= halfHourTrigger) {
        calculationEndTime.setMinutes(30);
    } else {
        calculationEndTime.setMinutes(0);
    }

    // 3. Determine Contractual End Time
    let contractualEndTime: Date | null = null;
    if (schedule) {
       const breakDuration = schedule.breakMinutes || 0;
       if (schedule.endTime) {
            const [h, m] = schedule.endTime.split(':').map(Number);
            contractualEndTime = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        } else if (schedule.totalHours) {
            contractualEndTime = new Date(calculationStartTime.getTime() + (schedule.totalHours * 60 + breakDuration) * 60 * 1000);
        }
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
        contractualEndTime: contractualEndTime
    };
};

export const calculateHours = (shift: { date: Date, events: Timbratura[] }, schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false, halfHourTrigger: number = 25, hourTrigger: number = 45): { ordinary: number, overtime: number, leave: number, worked: number, break: number, calculationStart: Date | null, calculationEnd: Date | null } => {
    const clockInEvent = shift.events.find(e => e.type === 'entrata');
    
    // Check if the shift was manually approved with specific hours
    if (clockInEvent?.status === 'confermata' && typeof clockInEvent.approvedOrdinaryHours === 'number') {
        const approvedOrdinary = clockInEvent.approvedOrdinaryHours || 0;
        const approvedOvertime = clockInEvent.approvedOvertimeHours || 0;
        // Still calculate the real worked minutes for display
        const { workedMinutes, breakMinutes, calculationStart, calculationEnd } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart, halfHourTrigger, hourTrigger);
        
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

    const { workedMinutes, breakMinutes, calculationStart, calculationEnd } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart, halfHourTrigger, hourTrigger);
    const contractualHours = schedule?.totalHours || 0;
    const contractualMinutes = contractualHours * 60;
    const isMakeupShift = !!clockInEvent?.makeupOfDay;
    const isWorkDay = isMakeupShift || contractualHours > 0;
    
    if (!isWorkDay) {
        const overtime = roundOvertimeHours(workedMinutes, halfHourTrigger, hourTrigger);
        return { ordinary: 0, overtime, leave: 0, worked: workedMinutes, break: breakMinutes, calculationStart, calculationEnd };
    }

    const ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
    const overtimeMinutes = Math.max(0, workedMinutes - contractualMinutes);
    const ordinaryHours = roundOrdinaryHours(ordinaryMinutes);
    const overtimeHours = roundOvertimeHours(overtimeMinutes, halfHourTrigger, hourTrigger);
    const leaveHours = isWorkDay && ordinaryHours < contractualHours ? contractualHours - ordinaryHours : 0;

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
        }[] 
    }
): { monthlySummary: MonthlySummary, dailyDetails: DailyDetail[] } => {
    
    const monthInterval = { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) };
    const today = startOfDay(new Date());

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

        const dayName = dayIndexToName[getDay(date)];
        const dailySchedule = operator.workSchedule[dayName];
        
        const isShiftComplete = events.some(e => e.type === 'uscita');
        const physicalDate = events.find(e => e.type === 'entrata')!.timestamp.toDate();
        const isTodayAndInProgress = isSameDay(physicalDate, today) && !isShiftComplete;

        if (isTodayAndInProgress) {
            detail.status = 'in_corso';
        } else {
            detail.status = 'lavorato';
        }
        
        const hoursResult = calculateHours({ date, events }, dailySchedule, events.find(e=>e.type==='entrata')?.ignoreContractualStart, operator.overtimeHalfHourTrigger, operator.overtimeHourTrigger);

        if (!detail.shift) {
            detail.shift = {
                events: [], allShifts: [], contractualHours: 0,
                ordinaryHours: 0, overtimeHours: 0, permissionHours: 0,
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
                detail.shift = { events: [], contractualHours: 0, ordinaryHours: 0, overtimeHours: 0, permissionHours: 0 };
            }
            detail.shift.overtimeHours += overtimeHours;
            detail.shift.events.push(...straordinario.events);
            detail.shift.allShifts = detail.shift.allShifts || [];
            detail.shift.allShifts.push({ events: straordinario.events });
        }
    });

    detailsMap.forEach(detail => {
        const leaveRequest = data.requests.find(r => (r.type === 'ferie' || r.type === 'malattia') && isWithinInterval(detail.date, { start: startOfDay(r.startDate.toDate()), end: dateFnsEndOfDay(r.endDate.toDate()) }));
        if (leaveRequest) {
            detail.status = leaveRequest.type;
            detail.request = leaveRequest;
            detail.shift = null;
        }

        const permissionHours = data.requests.filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), detail.date)).reduce((sum, r) => sum + (r.hours || 0), 0);
        if (detail.shift) {
            detail.shift.permissionHours = permissionHours;
        }

        const dailyNote = data.dailyNotes?.find(n => n.date === format(detail.date, 'yyyy-MM-dd'));
        if (dailyNote) {
            detail.note = dailyNote;
        }

        if (detail.status === 'vuoto') {
            const dayName = dayIndexToName[getDay(detail.date)];
            const isWorkDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
            const isHoliday = isPublicHoliday(detail.date);
            
            const makeupNote = makeupTargets[startOfDay(detail.date).toISOString()];
            if (makeupNote && makeupNote.length > 0) {
                detail.makeupActivityFor = makeupNote;
                detail.status = 'riposo';
            } else if (isHoliday && isWorkDay) {
                detail.status = 'festa';
            } else if (isWorkDay && detail.date < today) {
                detail.status = 'mancata_timbratura';
            } else if (!isWorkDay && detail.date <= today) {
                detail.status = 'riposo';
            }
        }
    });
    
    const dailyDetails = Array.from(detailsMap.values()).filter(d => {
        if (d.date > today && d.status === 'vuoto') return false;
        return true;
    });


    let totalOrdinaryHours = 0, totalOvertimeHours = 0, workedDays = 0, absenceDays = 0;
    let ferieDays = 0, ferieHours = 0, malattiaDays = 0;

    dailyDetails.forEach(detail => {
        if (!isWithinInterval(detail.date, monthInterval)) return;
        
        if (detail.status === 'lavorato' && detail.shift && detail.shift.ordinaryHours > 0) {
            workedDays++;
        }
        
        totalOrdinaryHours += detail.shift?.ordinaryHours || 0;
        totalOvertimeHours += detail.shift?.overtimeHours || 0;

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
    });
    
    let totalFerieCost = 0, totalMalattiaCost = 0, totalPermessoCost = 0;
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
        .filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval))
        .reduce((sum, r) => sum + (r.hours || 0), 0);
    
    const monthlySummary: MonthlySummary = {
        workedDays, absenceDays, ordinaryHours: totalOrdinaryHours,
        overtimeHours: totalOvertimeHours, ferieCost: totalFerieCost,
        permessoCost: totalPermessoCost, ferieDays, ferieHours,
        permessoHours: totalPermessoHours, malattiaDays, malattiaCost: totalMalattiaCost,
    };

    return {
        monthlySummary,
        dailyDetails: dailyDetails.sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
};
