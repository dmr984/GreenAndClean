// src/lib/calculations.ts

import { Timestamp } from 'firebase/firestore';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, set, startOfDay, addDays, subDays } from 'date-fns';
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
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    isOvertime?: boolean;
    isAuto?: boolean;
    ignoreContractualStart?: boolean;
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

type Shift = {
    date: Date;
    events: Timbratura[];
    contractualHours: number;
    workedMinutes: number;
    ordinaryMinutes: number;
    overtimeMinutes: number;
    isPureOvertime: boolean;
};


export type DailyDetail = {
    date: Date;
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo' | 'festa';
    shift: {
        events: Timbratura[];
        contractualHours: number;
        ordinaryHours: number;
        overtimeHours: number;
        permissionHours: number;
    } | null;
    request: Request | null;
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
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes >= 45) {
        return hours + 1;
    }
    if (remainingMinutes >= 15) {
        return hours + 0.5;
    }
    return hours;
};


export const roundOvertimeHours = (minutes: number, calculationType: 'hourly' | 'half_hourly' = 'hourly'): number => {
    if (minutes <= 0) return 0;
    
    // Default hourly logic (triggers at 50 mins)
    const totalHours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const additionalHours = remainingMinutes >= 50 ? 1 : 0;
    return totalHours + additionalHours;
};


export const calculateShiftDetails = (events: Timbratura[], schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date | null, breakMinutes: number, contractualEndTime: Date | null } => {
    const clockInEvent = events.find(e => e.type === 'entrata');
    const clockOutEvent = events.find(e => e.type === 'uscita');

    if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null, calculationEnd: null, breakMinutes: 0, contractualEndTime: null };

    const clockInTime = clockInEvent.timestamp.toDate();
    let calculationStartTime = clockInTime;
    
    // 1. Determine Calculation Start Time
    if (schedule?.startTime && !ignoreContractualStart) {
        const [h, m] = schedule.startTime.split(':').map(Number);
        calculationStartTime = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
    }
    
    const clockOutTime = clockOutEvent.timestamp.toDate();

    // 2. Determine Contractual End Time
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


    // 3. Calculate Break Duration
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

    // 4. Calculate Total Worked Milliseconds
    const totalMillis = clockOutTime.getTime() - calculationStartTime.getTime();
    const workedMillis = totalMillis > 0 ? totalMillis - breakDurationMillis : 0;
    const workedMinutes = workedMillis > 0 ? Math.floor(workedMillis / (1000 * 60)) : 0;

    return { 
        workedMinutes,
        calculationStart: calculationStartTime,
        calculationEnd: clockOutTime,
        breakMinutes: Math.floor(breakDurationMillis / 60000),
        contractualEndTime: contractualEndTime
    };
};

export const calculateHours = (shift: Shift, schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false): { ordinary: number, overtime: number, leave: number, worked: number, break: number } => {
    
    const { workedMinutes, breakMinutes, contractualEndTime } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart);

    const contractualHours = schedule?.totalHours || 0;
    const contractualMinutes = contractualHours * 60;
    
    const isWorkDay = contractualHours > 0 && !isPublicHoliday(shift.date);
    
    if (!isWorkDay) {
        return {
            ordinary: 0,
            overtime: roundOvertimeHours(workedMinutes),
            leave: 0,
            worked: workedMinutes,
            break: breakMinutes
        };
    }

    // Strict separation between ordinary and overtime minutes
    const ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
    const overtimeMinutes = Math.max(0, workedMinutes - contractualMinutes);

    const ordinaryHours = roundOrdinaryHours(ordinaryMinutes);
    const overtimeHours = roundOvertimeHours(overtimeMinutes);

    const leaveHours = isWorkDay && ordinaryHours < contractualHours ? contractualHours - ordinaryHours : 0;

    return { 
        ordinary: ordinaryHours, 
        overtime: overtimeHours, 
        leave: leaveHours,
        worked: workedMinutes,
        break: breakMinutes
    };
};


export const processMonthlyData = (
    currentMonth: Date,
    operator: Operator,
    monthlyData: { timbrature: Timbratura[], requests: Request[] }
): { monthlySummary: MonthlySummary, dailyDetails: DailyDetail[] } => {
    
    const monthInterval = { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) };
    const today = startOfDay(new Date());

    const dailyTimbrature = monthlyData.timbrature.reduce((acc, t) => {
        const dayString = t.timestamp.toDate().toDateString();
        if (!acc[dayString]) acc[dayString] = [];
        acc[dayString].push(t);
        return acc;
    }, {} as Record<string, Timbratura[]>);

    const allDaysOfMonth = eachDayOfInterval(monthInterval);
    const details: DailyDetail[] = [];
    
    // Process each day of the month to create daily details
    for (const day of allDaysOfMonth) {
        if (day > today) continue;

        const dayName = dayIndexToName[getDay(day)];
        const dailySchedule = operator.workSchedule[dayName];
        const contractualHours = dailySchedule?.totalHours || 0;
        const dayString = day.toDateString();
        const isHoliday = isPublicHoliday(day);
        const isWorkDay = contractualHours > 0 && !isHoliday;

        const leaveRequest = monthlyData.requests.find(r =>
            (r.type === 'ferie' || r.type === 'malattia') &&
            isWithinInterval(day, { start: r.startDate.toDate(), end: r.endDate.toDate() })
        );

        const workedEventsRaw = dailyTimbrature[dayString];
        
        if (isHoliday && !workedEventsRaw) {
             details.push({ date: day, status: 'festa', request: null, shift: null });
        } else if (workedEventsRaw) {
            const events = [...workedEventsRaw].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            const clockInTime = events.find(e => e.type === 'entrata')?.timestamp.toDate();
            const clockOutTime = events.find(e => e.type === 'uscita')?.timestamp.toDate();

            if (!clockInTime || !clockOutTime) {
                 if (isWorkDay) details.push({ date: day, status: 'mancata_timbratura', request: null, shift: null });
                 else details.push({ date: day, status: 'riposo', request: null, shift: null });
                 continue;
            }
            
            const ignoreContractualStart = events.find(e => e.type === 'entrata')?.ignoreContractualStart || false;
            
            const shiftForCalc: Shift = {
                date: day,
                events: events,
                contractualHours: contractualHours,
                workedMinutes: 0, ordinaryMinutes: 0, overtimeMinutes: 0, // temp values
                isPureOvertime: !isWorkDay
            };

            const { ordinary, overtime } = calculateHours(shiftForCalc, dailySchedule, ignoreContractualStart);

            const permissionHours = monthlyData.requests
                .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
                .reduce((sum, r) => sum + (r.hours || 0), 0);
            
            details.push({
                date: day,
                status: 'lavorato',
                request: null,
                shift: {
                    events,
                    contractualHours,
                    ordinaryHours: ordinary,
                    overtimeHours: overtime, 
                    permissionHours: permissionHours,
                },
            });
        } else if (leaveRequest && isWorkDay) {
            details.push({ date: day, status: leaveRequest.type, request: leaveRequest, shift: null });
        } else if (isWorkDay) {
             details.push({ date: day, status: 'mancata_timbratura', request: null, shift: null });
        } else {
             details.push({ date: day, status: 'riposo', request: null, shift: null });
        }
    }
    
    // =================================================================
    // SUMMARIZE (Based on the daily details we just calculated)
    // =================================================================
    const totalOrdinaryHours = details.reduce((sum, d) => sum + (d.shift?.ordinaryHours || 0), 0);
    const totalOvertimeHours = details.reduce((sum, d) => sum + (d.shift?.overtimeHours || 0), 0);
    
    const workedDays = details.filter(d => {
        // A day is a "worked day" if it's a contractual day and the status is 'lavorato'.
        const dayName = dayIndexToName[getDay(d.date)];
        const isContractualDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
        return d.status === 'lavorato' && isContractualDay;
    }).length;
    
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
