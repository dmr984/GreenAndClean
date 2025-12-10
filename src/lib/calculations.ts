// src/lib/calculations.ts

import { Timestamp } from 'firebase/firestore';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, set, startOfDay } from 'date-fns';
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
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    isOvertime?: boolean;
    isAuto?: boolean;
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
};

type Shift = {
    date: Date;
    events: Timbratura[];
    contractualHours: number;
    workedMinutes: number;
    ordinaryHours: number;
    overtimeHours: number;
    permissionHours: number;
    isPureOvertime: boolean;
};

export type DailyDetail = {
    date: Date;
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo' | 'festa';
    shift: Shift | null;
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

// Standalone rounding functions, rewritten to be correct.
const roundOrdinaryHours = (minutes: number): number => {
    if (minutes <= 0) return 0;
    const halfHours = Math.floor(minutes / 30);
    const remaining = minutes % 30;
    return (halfHours * 0.5) + (remaining >= 25 ? 0.5 : 0);
};

const roundOvertimeHours = (minutes: number): number => {
    if (minutes <= 0) return 0;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return hours + (remaining >= 50 ? 1 : 0);
};


export const calculateShiftDetails = (events: Timbratura[], schedule: DailySchedule | undefined): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date| null, breakMinutes: number } => {
    const clockInEvent = events.find(e => e.type === 'entrata');
    const clockOutEvent = events.find(e => e.type === 'uscita');

    if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null, calculationEnd: null, breakMinutes: 0 };

    const clockInTime = clockInEvent.timestamp.toDate();
    let calculationStartTime = clockInTime;

    // Apply contractual start time rule
    if (schedule?.startTime) {
        const [h, m] = schedule.startTime.split(':').map(Number);
        const contractualStart = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        if (clockInTime < contractualStart) {
            calculationStartTime = contractualStart;
        }
    }
    
    // Calculate total break duration in milliseconds
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

    const clockOutTime = clockOutEvent.timestamp.toDate();
    const totalMillis = clockOutTime.getTime() - calculationStartTime.getTime();
    const workedMillis = totalMillis - breakDurationMillis;
    const workedMinutes = workedMillis > 0 ? Math.round(workedMillis / (1000 * 60)) : 0;
    
    // This function now ONLY returns raw minutes and calculation boundaries.
    // The division into ordinary/overtime and rounding happens in processMonthlyData.
    
    // Calculate the reference end time
    const finalOrdinaryMinutes = roundOrdinaryHours(workedMinutes) * 60;
    const finalOvertimeMinutes = roundOvertimeHours(Math.max(0, workedMinutes - finalOrdinaryMinutes)) * 60;
    const totalCalculatedMinutes = finalOrdinaryMinutes + finalOvertimeMinutes;
    const calculatedEndTime = new Date(calculationStartTime.getTime() + (totalCalculatedMinutes * 1000 * 60) + breakDurationMillis);

    return { 
        workedMinutes: workedMinutes,
        calculationStart: calculationStartTime,
        calculationEnd: calculatedEndTime,
        breakMinutes: Math.round(breakDurationMillis / 60000)
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
            
            // Get raw worked minutes from calculateShiftDetails
            const { workedMinutes } = calculateShiftDetails(events, dailySchedule);
           
            let ordinaryMinutes = 0;
            let overtimeMinutes = 0;

            if (!isWorkDay) { // This is a pure overtime day (e.g., Saturday)
                ordinaryMinutes = 0;
                overtimeMinutes = workedMinutes;
            } else { // This is a regular work day
                const contractualMinutes = contractualHours * 60;
                ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
                overtimeMinutes = Math.max(0, workedMinutes - ordinaryMinutes);
            }
            
            // Apply rounding rules at the end
            const ordinaryHours = roundOrdinaryHours(ordinaryMinutes);
            const overtimeHours = roundOvertimeHours(overtimeMinutes);

            const permissionHours = monthlyData.requests
                .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
                .reduce((sum, r) => sum + (r.hours || 0), 0);
            
            // Get manual overtime requests for THIS specific day
            const manualOvertimeForDay = monthlyData.requests
                .filter(r => r.type === 'straordinario' && isSameDay(r.startDate.toDate(), day))
                .reduce((sum, r) => sum + (r.hours || 0), 0);
            
            details.push({
                date: day,
                status: 'lavorato',
                request: null,
                shift: {
                    date: day,
                    events,
                    contractualHours,
                    workedMinutes,
                    ordinaryHours,
                    overtimeHours: overtimeHours + manualOvertimeForDay, // Add manual overtime to the day's total
                    permissionHours,
                    isPureOvertime: !isWorkDay
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
    
    // Calculate final summary totals from the processed daily details
    const totalOrdinary = details.reduce((sum, d) => sum + (d.shift?.ordinaryHours || 0), 0);
    // The daily overtime already includes manual requests, so this sum is now correct.
    const totalOvertime = details.reduce((sum, d) => sum + (d.shift?.overtimeHours || 0), 0);

    // Permission hours are calculated from all approved requests in the month
    const totalPermesso = monthlyData.requests
        .filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval))
        .reduce((sum, r) => sum + (r.hours || 0), 0);
            
    let ferieDays = 0;
    let malattiaDays = 0;

    const processedLeaveDays = new Set<string>();
    monthlyData.requests.forEach(req => {
        if (req.type === 'ferie' || req.type === 'malattia') {
            for (let day = startOfDay(req.startDate.toDate()); day <= startOfDay(req.endDate.toDate()); day.setDate(day.getDate() + 1)) {
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
        workedDays: details.filter(d => d.status === 'lavorato').length,
        ordinaryHours: totalOrdinary,
        overtimeHours: totalOvertime,
        ferieDays,
        permessoHours: totalPermesso,
        malattiaDays,
    };

    return {
        monthlySummary,
        dailyDetails: details.sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
};
