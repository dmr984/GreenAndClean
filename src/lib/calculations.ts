// src/lib/calculations.ts

import { Timestamp } from 'firebase/firestore';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, set, startOfDay, addDays, subDays, parse } from 'date-fns';
import { isPublicHoliday } from '@/lib/holidays';

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
    hourlyRate?: number;
    overtimeRate?: number;
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
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo' | 'festa';
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
};


export type MonthlySummary = {
    workedDays: number;
    ordinaryHours: number;
    overtimeHours: number;

    ferieDays: number;
    permessoHours: number;
    malattiaDays: number;
};

export const roundOrdinaryHours = (minutes: number): number => {
    if (minutes <= 0) return 0;
    const totalHalfHours = Math.floor(minutes / 30);
    const remainingMinutes = minutes % 30;
    return (totalHalfHours / 2) + (remainingMinutes >= 25 ? 0.5 : 0);
};


export const roundOvertimeHours = (
  startTime: Date,
  endTime: Date
): number => {
  if (endTime <= startTime) {
    return 0;
  }

  let hours = 0;
  let nextMilestone = new Date(startTime);
  nextMilestone.setMinutes(nextMilestone.getMinutes() + 50);

  while (endTime >= nextMilestone) {
    hours++;
    nextMilestone.setHours(nextMilestone.getHours() + 1);
  }

  return hours;
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
    const dayName = dayIndexToName[getDay(clockInTime)];
    const schedule = operator.workSchedule[dayName];

    let referenceStartTime = clockInTime;
    // For non-workdays (overtime), if there's a start time set, ALWAYS use it if clock-in is before it.
    if (schedule?.startTime) {
        const [h, m] = schedule.startTime.split(':').map(Number);
        const contractualStart = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        if (clockInTime < contractualStart) {
            referenceStartTime = contractualStart;
        }
    }
    
    const clockOutTime = clockOutEvent.timestamp.toDate();
    
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
    const effectiveEndTime = new Date(clockOutTime.getTime() - breakDurationMillis);

    return roundOvertimeHours(referenceStartTime, effectiveEndTime);
}



export const calculateShiftDetails = (events: Timbratura[], schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false, overtimeCalculation?: 'hourly' | 'half_hourly'): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date | null, breakMinutes: number, contractualEndTime: Date | null } => {
    const clockInEvent = events.find(e => e.type === 'entrata');
    const clockOutEvent = events.find(e => e.type === 'uscita');

    if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null, calculationEnd: null, breakMinutes: 0, contractualEndTime: null };

    const clockInTime = clockInEvent.timestamp.toDate();
    let calculationStartTime = clockInTime;
    const isWorkDay = (schedule?.totalHours || 0) > 0 && !isPublicHoliday(clockInTime);
    
    // 1. Determine Calculation Start Time
    if (schedule?.startTime && !ignoreContractualStart) {
        const [h, m] = schedule.startTime.split(':').map(Number);
        const contractualStartDateTime = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });

        const minutesLate = (clockInTime.getTime() - contractualStartDateTime.getTime()) / (1000 * 60);

        if (minutesLate <= 15) { // Includes clocking in early, up to 15 mins late
            calculationStartTime = contractualStartDateTime;
        } else {
            const minutes = clockInTime.getMinutes();
            const roundedTime = set(clockInTime, { seconds: 0, milliseconds: 0 });

            if (minutes > 0 && minutes <= 30) {
                roundedTime.setMinutes(30);
            } else if (minutes > 30) {
                roundedTime.setHours(roundedTime.getHours() + 1, 0);
            } else { // minutes === 0
                 roundedTime.setMinutes(0);
            }
            calculationStartTime = roundedTime;
        }
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
        // Since it's not a workday, all time is calculated as pure overtime
        const clockOutTime = shift.events.find(e => e.type === 'uscita')?.timestamp.toDate();
        const clockInTimeToUse = calculationStart || clockInEvent?.timestamp.toDate();
        if (!clockOutTime || !clockInTimeToUse) {
             return { ordinary: 0, overtime: 0, leave: 0, worked: 0, break: 0, calculationStart: null, calculationEnd: null };
        }
        const overtime = roundOvertimeHours(clockInTimeToUse, new Date(clockOutTime.getTime() - breakMinutes * 60000));
        
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
    const overtimeHours = calculationStart ? roundOvertimeHours(calculationStart, new Date(calculationStart.getTime() + overtimeMinutes * 60000)) : 0;

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
    monthlyData: { timbrature: Timbratura[], requests: Request[], dailyNotes?: DailyNote[] }
): { monthlySummary: MonthlySummary, dailyDetails: DailyDetail[] } => {
    
    const monthInterval = { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) };
    const today = startOfDay(new Date());

    const allDaysOfMonth = eachDayOfInterval(monthInterval);
    const details: DailyDetail[] = [];
    
    // Process each day of the month to create daily details
    for (const day of allDaysOfMonth) {
        if (day > today) continue;

        const dayName = dayIndexToName[getDay(day)];
        let dailySchedule = operator.workSchedule[dayName];
        
        const isHoliday = isPublicHoliday(day);
        
        const workedEventsRaw = monthlyData.timbrature.filter(t => isSameDay(t.timestamp.toDate(), day));
        
        const makeupShiftInfo = workedEventsRaw?.find(e => e.type === 'entrata' && e.makeupOfDay);
        
        // If it's a makeup shift, use the schedule of the day being made up
        if (makeupShiftInfo?.makeupOfDay) {
            const makeupDate = parse(makeupShiftInfo.makeupOfDay, 'yyyy-MM-dd', new Date());
            const makeupDayName = dayIndexToName[getDay(makeupDate)];
            dailySchedule = operator.workSchedule[makeupDayName];
        }
        
        const contractualHours = dailySchedule?.totalHours || 0;
        let isWorkDay = contractualHours > 0 && !isHoliday;
        if(makeupShiftInfo) isWorkDay = true;
        
        // Check if this day was a contractual day but was made up on another day
        const isMadeUpElsewhere = monthlyData.timbrature.some(t => {
             return t.makeupOfDay === format(day, 'yyyy-MM-dd');
        });
        if (isMadeUpElsewhere) {
            isWorkDay = false; 
        }

        const leaveRequest = monthlyData.requests.find(r =>
            (r.type === 'ferie' || r.type === 'malattia') &&
            isWithinInterval(day, { start: r.startDate.toDate(), end: r.endDate.toDate() })
        );

        const dailyNote = monthlyData.dailyNotes?.find(n => n.date === format(day, 'yyyy-MM-dd'));

        
        if (isHoliday && !workedEventsRaw.length) {
             details.push({ date: day, status: 'festa', request: null, shift: null, note: dailyNote?.note });
        } else if (workedEventsRaw.length > 0) {
            const dayShifts: SingleShiftBlock[] = [];
            let currentShiftEvents: Timbratura[] = [];
            const sortedEvents = [...workedEventsRaw].sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

            for (const event of sortedEvents) {
                currentShiftEvents.push(event);
                if (event.type === 'uscita') {
                    const clockInTime = currentShiftEvents.find(e => e.type === 'entrata')?.timestamp.toDate();
                    if(clockInTime) {
                        const ignoreContractualStart = currentShiftEvents.find(e => e.type === 'entrata')?.ignoreContractualStart || false;
                        const { calculationStart, calculationEnd } = calculateHours({ date: day, events: currentShiftEvents }, dailySchedule, ignoreContractualStart, operator.overtimeCalculation);
                        
                        dayShifts.push({
                            events: currentShiftEvents,
                            calculationStart: calculationStart || undefined,
                            calculationEnd: calculationEnd || undefined
                        });
                    }
                    currentShiftEvents = []; 
                }
            }
            
            if (dayShifts.length === 0) {
                 if (isWorkDay) details.push({ date: day, status: 'mancata_timbratura', request: null, shift: null, note: dailyNote?.note });
                 else details.push({ date: day, status: 'riposo', request: null, shift: null, note: dailyNote?.note });
                 continue;
            }

            let totalOrdinary = 0;
            let totalOvertime = 0;
            const allDayEvents: Timbratura[] = [];
            
            dayShifts.forEach(shiftBlock => {
                 const ignoreContractualStart = shiftBlock.events.find(e => e.type === 'entrata')?.ignoreContractualStart || false;
                 const hoursResult = calculateHours({ date: day, events: shiftBlock.events }, dailySchedule, ignoreContractualStart, operator.overtimeCalculation);
                 totalOrdinary += hoursResult.ordinary;
                 totalOvertime += hoursResult.overtime;
                 allDayEvents.push(...shiftBlock.events);
            });
            
            const permissionHours = monthlyData.requests
                .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
                .reduce((sum, r) => sum + (r.hours || 0), 0);
            
            const { calculationStart, calculationEnd } = calculateHours({ date: day, events: allDayEvents }, dailySchedule, allDayEvents.find(e => e.type === 'entrata')?.ignoreContractualStart || false, operator.overtimeCalculation);

            details.push({
                date: day,
                status: 'lavorato',
                request: null,
                shift: {
                    allShifts: dayShifts,
                    events: allDayEvents.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis()),
                    contractualHours,
                    ordinaryHours: totalOrdinary,
                    overtimeHours: totalOvertime, 
                    permissionHours: permissionHours,
                    calculationStart: calculationStart || undefined,
                    calculationEnd: calculationEnd || undefined
                },
                note: dailyNote?.note,
            });
        } else if (leaveRequest && isWorkDay) {
            details.push({ date: day, status: leaveRequest.type, request: leaveRequest, shift: null, note: dailyNote?.note });
        } else if (isWorkDay) {
             details.push({ date: day, status: 'mancata_timbratura', request: null, shift: null, note: dailyNote?.note });
        } else {
             details.push({ date: day, status: 'riposo', request: null, shift: null, note: dailyNote?.note });
        }
    }
    
    // =================================================================
    // SUMMARIZE (Based on the daily details we just calculated)
    // =================================================================
    const totalOrdinaryHours = details.reduce((sum, d) => sum + (d.shift?.ordinaryHours || 0), 0);
    const totalOvertimeHours = details.reduce((sum, d) => sum + (d.shift?.overtimeHours || 0), 0);
    
    // A worked day is a day with a shift that produced ordinary hours.
    const workedDays = details.filter(d => d.status === 'lavorato' && d.shift && d.shift.ordinaryHours > 0).length;
    
    const totalPermesso = monthlyData.requests
        .filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval))
        .reduce((sum, r) => sum + (r.hours || 0), 0);
            
    let ferieDays = 0;
    let malattiaDays = 0;

    const processedLeaveDays = new Set<string>();
    monthlyData.requests.forEach(req => {
        if (req.type === 'ferie' || req.type === 'malattia') {
            for (let day = new Date(req.startDate.toDate()); day <= req.endDate.toDate(); day.setDate(day.getDate() + 1)) {
                 if (day > today) continue;
                const dayString = day.toDateString();
                if (isWithinInterval(day, monthInterval) && !processedLeaveDays.has(dayString)) {
                    const dayName = dayIndexToName[getDay(day)];
                    if ((operator.workSchedule[dayName]?.totalHours || 0) > 0 && !isPublicHoliday(day)) {
                        if (req.type === 'ferie') ferieDays++;
                        if (req.type === 'malattia') malattiaDays++;
                        processedLeaveDays.add(dayString);
                    }
                }
            }
        }
    });

    const monthlySummary: MonthlySummary = {
        workedDays: workedDays,
        ordinaryHours: totalOrdinaryHours,
        overtimeHours: totalOvertimeHours,
        ferieDays,
        permessoHours: totalPermesso,
        malattiaDays,
    };

    return {
        monthlySummary,
        dailyDetails: details.sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
};
