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
    overtimeCalculation?: 'hourly' | 'half_hourly';
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
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
};

type DailyNote = {
    note: string;
    date: string;
}

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
    note?: string;
    makeupPerformedFor?: string;
};


export type MonthlySummary = {
    workedDays: number;
    ordinaryHours: number;
    overtimeHours: number;
    holidayHoursPayable: number; 
    absenceDays: number;

    ferieDays: number;
    ferieHours: number; // Added to show total hours for ferie
    permessoHours: number;
    malattiaDays: number;
};

export const roundOrdinaryHours = (minutes: number): number => {
    if (minutes <= 0) return 0;
    const totalHalfHours = Math.floor(minutes / 30);
    const remainingMinutes = minutes % 30;
    return (totalHalfHours / 2) + (remainingMinutes >= 25 ? 0.5 : 0);
};


export const roundOvertimeHours = (minutes: number, overtimeCalculation: 'hourly' | 'half_hourly' = 'hourly'): number => {
    if (minutes <= 0) return 0;
    
    if (overtimeCalculation === 'half_hourly') {
        const totalHalfHours = Math.floor(minutes / 30);
        const remainingMinutes = minutes % 30;
        return (totalHalfHours / 2) + (remainingMinutes >= 25 ? 0.5 : 0);
    }
    
    // Default 'hourly'
    const totalHours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return totalHours + (remainingMinutes >= 50 ? 1 : 0);
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

    return roundOvertimeHours(effectiveMinutes, operator.overtimeCalculation);
}



export const calculateShiftDetails = (events: Timbratura[], schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false, overtimeCalculation?: 'hourly' | 'half_hourly'): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date | null, breakMinutes: number, contractualEndTime: Date | null } => {
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

    if(overtimeCalculation === 'half_hourly') {
        if(clockOutMinutes >= 25 && clockOutMinutes < 55) {
            calculationEndTime.setMinutes(30);
        } else if (clockOutMinutes >= 55) {
            calculationEndTime.setHours(calculationEndTime.getHours() + 1, 0);
        } else {
            calculationEndTime.setMinutes(0);
        }
    } else { // 'hourly' or undefined
        if (clockOutMinutes >= 50) {
            calculationEndTime.setHours(calculationEndTime.getHours() + 1, 0);
        } else if (clockOutMinutes >= 25) {
             calculationEndTime.setMinutes(30);
        } else {
            calculationEndTime.setMinutes(0);
        }
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

export const calculateHours = (shift: { date: Date, events: Timbratura[] }, schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false, overtimeCalculation?: 'hourly' | 'half_hourly'): { ordinary: number, overtime: number, leave: number, worked: number, break: number, calculationStart: Date | null, calculationEnd: Date | null } => {
    
    const clockInEvent = shift.events.find(e => e.type === 'entrata');
    
    // If the shift is already approved and has manual hours, use them. This is the LAW.
    if (clockInEvent?.status === 'confermata' && typeof clockInEvent.approvedOrdinaryHours === 'number') {
        const approvedOrdinary = clockInEvent.approvedOrdinaryHours || 0;
        const approvedOvertime = clockInEvent.approvedOvertimeHours || 0;
        const { workedMinutes, breakMinutes, calculationStart, calculationEnd } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart, overtimeCalculation);

        return {
            ordinary: approvedOrdinary,
            overtime: approvedOvertime,
            leave: 0, // Leave is calculated separately now based on requests
            worked: workedMinutes,
            break: breakMinutes,
            calculationStart,
            calculationEnd,
        };
    }

    // --- If not approved, proceed with automatic calculation as a suggestion ---
    const { workedMinutes, breakMinutes, calculationStart, calculationEnd } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart, overtimeCalculation);

    const contractualHours = schedule?.totalHours || 0;
    const contractualMinutes = contractualHours * 60;
    
    const isMakeupShift = !!clockInEvent?.makeupOfDay;

    const isWorkDay = isMakeupShift || (contractualHours > 0 && !isPublicHoliday(shift.date));
    
    if (!isWorkDay) {
        // On non-working days, all worked minutes are considered overtime.
        const overtime = roundOvertimeHours(workedMinutes, overtimeCalculation);
        
        return {
            ordinary: 0,
            overtime,
            leave: 0,
            worked: workedMinutes,
            break: breakMinutes,
            calculationStart,
            calculationEnd
        };
    }

    const ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
    const overtimeMinutes = Math.max(0, workedMinutes - contractualMinutes);

    const ordinaryHours = roundOrdinaryHours(ordinaryMinutes);
    const overtimeHours = roundOvertimeHours(overtimeMinutes, overtimeCalculation);

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

    // Group all timbrature by their effective date (makeup day or actual day)
    const eventsByEffectiveDay: { [key: string]: Timbratura[] } = {};
    data.timbrature.forEach(timbratura => {
        const effectiveDate = timbratura.makeupOfDay
            ? parse(timbratura.makeupOfDay, 'yyyy-MM-dd', new Date())
            : timbratura.timestamp.toDate();
        
        const dayString = startOfDay(effectiveDate).toISOString();
        if (!eventsByEffectiveDay[dayString]) {
            eventsByEffectiveDay[dayString] = [];
        }
        eventsByEffectiveDay[dayString].push(timbratura);
    });

    const allDaysOfMonth = eachDayOfInterval(monthInterval);
    const details: DailyDetail[] = [];
    
    // Process each day of the month to create daily details
    for (const day of allDaysOfMonth) {
        const dayISO = startOfDay(day).toISOString();
        const effectiveEventsForDay = eventsByEffectiveDay[dayISO] || []; // Events that COUNT for this day.
        
        const makeupShiftsPhysicallyPerformedOnDay = data.timbrature.filter(t => 
            t.makeupOfDay && 
            isSameDay(t.timestamp.toDate(), day) &&
            !isSameDay(parse(t.makeupOfDay, 'yyyy-MM-dd', new Date()), day)
        );

        const dayName = dayIndexToName[getDay(day)];
        const dailySchedule = operator.workSchedule[dayName];
        const contractualHours = dailySchedule?.totalHours || 0;
        const isWorkDay = contractualHours > 0;

        const isMadeUpElsewhere = data.timbrature.some(t => t.makeupOfDay === format(day, 'yyyy-MM-dd'));
        
        const leaveRequest = data.requests.find(r =>
            (r.type === 'ferie' || r.type === 'malattia') &&
            isWithinInterval(day, { start: startOfDay(r.startDate.toDate()), end: dateFnsEndOfDay(r.endDate.toDate()) })
        );
        
        const isHoliday = isPublicHoliday(day);
        const dailyNote = data.dailyNotes?.find(n => n.date === format(day, 'yyyy-MM-dd'));
        const dayStraordinario = data.straordinari?.find(s => isSameDay(s.date.toDate(), day));

        // --- Determine Daily Status with Priority ---

        if (effectiveEventsForDay.length === 0 && makeupShiftsPhysicallyPerformedOnDay.length > 0) {
            const targetDate = makeupShiftsPhysicallyPerformedOnDay[0].makeupOfDay;
            details.push({
                date: day,
                status: 'recupero_effettuato',
                request: null,
                shift: null,
                note: dailyNote?.note,
                makeupPerformedFor: targetDate ? format(parse(targetDate, 'yyyy-MM-dd', new Date()), 'dd MMM', { locale: it }) : undefined,
            });
        } else if (leaveRequest) {
             details.push({ date: day, status: leaveRequest.type, request: leaveRequest, shift: null, note: dailyNote?.note });
        } else if (isHoliday && effectiveEventsForDay.length === 0 && !dayStraordinario) {
             details.push({ date: day, status: 'festa', request: null, shift: null, note: dailyNote?.note });
        } else if (effectiveEventsForDay.length > 0) {
            const performedOnDate = effectiveEventsForDay[0].timestamp.toDate();
            const isShiftComplete = effectiveEventsForDay.some(e => e.type === 'uscita');
            const isTodayAndInProgress = isSameDay(performedOnDate, today) && !isShiftComplete;

            if (isTodayAndInProgress) {
                 details.push({
                    date: day, // The effective day
                    status: 'in_corso',
                    request: null,
                    shift: {
                        allShifts: [{ events: effectiveEventsForDay }],
                        events: effectiveEventsForDay,
                        contractualHours,
                        ordinaryHours: 0,
                        overtimeHours: 0,
                        permissionHours: 0,
                    },
                    note: dailyNote?.note
                });
                continue;
            }

            const dayShifts: SingleShiftBlock[] = [];
            let currentShiftEvents: Timbratura[] = [];
            const sortedEvents = effectiveEventsForDay.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

            for (const event of sortedEvents) {
                currentShiftEvents.push(event);
                if (event.type === 'uscita') {
                    const clockInTime = currentShiftEvents.find(e => e.type === 'entrata')?.timestamp.toDate();
                    if(clockInTime) {
                        const ignoreContractualStart = currentShiftEvents.find(e => e.type === 'entrata')?.ignoreContractualStart || false;
                        const { calculationStart, calculationEnd } = calculateHours({ date: day, events: currentShiftEvents }, dailySchedule, ignoreContractualStart, operator.overtimeCalculation);
                        dayShifts.push({ events: currentShiftEvents, calculationStart: calculationStart || undefined, calculationEnd: calculationEnd || undefined });
                    }
                    currentShiftEvents = []; 
                }
            }
            if (currentShiftEvents.length > 0) { // Incomplete shift
                dayShifts.push({ events: currentShiftEvents, calculationStart: undefined, calculationEnd: undefined });
            }
            
            let totalOrdinary = 0;
            let totalOvertime = 0;
            
            dayShifts.forEach(shiftBlock => {
                 const ignoreContractualStart = shiftBlock.events.find(e => e.type === 'entrata')?.ignoreContractualStart || false;
                 const hoursResult = calculateHours({ date: day, events: shiftBlock.events }, dailySchedule, ignoreContractualStart, operator.overtimeCalculation);
                 totalOrdinary += hoursResult.ordinary;
                 totalOvertime += hoursResult.overtime;
            });
            
            const permissionHours = data.requests
                .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
                .reduce((sum, r) => sum + (r.hours || 0), 0);
            
            const { calculationStart, calculationEnd } = calculateHours({ date: day, events: effectiveEventsForDay }, dailySchedule, effectiveEventsForDay.find(e => e.type === 'entrata')?.ignoreContractualStart || false, operator.overtimeCalculation);
            
            details.push({
                date: day,
                status: 'lavorato',
                request: null,
                shift: {
                    allShifts: dayShifts,
                    events: sortedEvents,
                    contractualHours,
                    ordinaryHours: totalOrdinary,
                    overtimeHours: totalOvertime, 
                    permissionHours: permissionHours,
                    calculationStart: calculationStart || undefined,
                    calculationEnd: calculationEnd || undefined
                },
                note: dailyNote?.note,
            });
        } else if (dayStraordinario) {
             const overtimeHours = dayStraordinario.status === 'approvato' 
                ? (dayStraordinario.approvedHours ?? calculatePureOvertime(dayStraordinario, operator))
                : calculatePureOvertime(dayStraordinario, operator);
             details.push({
                date: day,
                status: 'lavorato',
                request: null,
                shift: {
                    allShifts: [{ events: dayStraordinario.events as Timbratura[] }],
                    events: dayStraordinario.events as Timbratura[],
                    contractualHours: 0,
                    ordinaryHours: 0,
                    overtimeHours: overtimeHours,
                    permissionHours: 0
                },
                note: dailyNote?.note
             });
        } else if (isWorkDay && day < today && !isMadeUpElsewhere) {
             details.push({ date: day, status: 'mancata_timbratura', request: null, shift: null, note: dailyNote?.note });
        } else if (!isWorkDay) {
             details.push({ date: day, status: 'riposo', request: null, shift: null, note: dailyNote?.note });
        }
    }
    
    // =================================================================
    // SUMMARIZE (Based on the daily details we just calculated)
    // =================================================================
    let totalOrdinaryHours = 0;
    let totalOvertimeHours = 0;
    let workedDays = 0;
    let absenceDays = 0;
    let ferieDays = 0;
    let ferieHours = 0;
    let malattiaDays = 0;

    details.forEach(detail => {
        // Only count data if it falls within the current month being processed
        if (!isWithinInterval(detail.date, monthInterval)) return;
        
        switch (detail.status) {
            case 'recupero_effettuato':
                // This day is just a pointer to work done for another day. Do not count it for anything.
                break;
            case 'lavorato':
                if (detail.shift) {
                    const isConfirmed = detail.shift.events.every(e => e.status === 'confermata');
                    const isStraordinarioApproved = data.straordinari?.find(s => isSameDay(s.date.toDate(), detail.date))?.status === 'approvato';

                    if (isConfirmed || isStraordinarioApproved) {
                         // Only count as a worked day if it resulted in payable hours
                         if (detail.shift.ordinaryHours > 0 || detail.shift.overtimeHours > 0) {
                            workedDays++;
                        }
                        totalOrdinaryHours += detail.shift.ordinaryHours;
                        totalOvertimeHours += detail.shift.overtimeHours;
                    }
                }
                break;
            case 'ferie':
                ferieDays++;
                const dayNameFerie = dayIndexToName[getDay(detail.date)];
                const contractualHoursFerie = operator.workSchedule[dayNameFerie]?.totalHours || 8; // Default to 8 if not defined
                ferieHours += contractualHoursFerie;
                break;
            case 'malattia':
                malattiaDays++;
                break;
            case 'mancata_timbratura':
                absenceDays++;
                break;
            default:
                break;
        }
    });
    
    const totalPermesso = data.requests
        .filter(r => {
            const requestDate = r.startDate.toDate();
            // Check if request is for a single day within the current month
            return r.type === 'permesso' &&
                   isWithinInterval(requestDate, monthInterval) &&
                   isSameDay(requestDate, r.endDate.toDate());
        })
        .reduce((sum, r) => sum + (r.hours || 0), 0);
    
    // Holiday pay is calculated based on vacation days taken
    const holidayHoursPayable = ferieHours;

    const monthlySummary: MonthlySummary = {
        workedDays,
        absenceDays,
        ordinaryHours: totalOrdinaryHours,
        overtimeHours: totalOvertimeHours,
        holidayHoursPayable,
        ferieDays,
        ferieHours,
        permessoHours: totalPermesso,
        malattiaDays,
    };
    
    return {
        monthlySummary,
        dailyDetails: details.sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
};
