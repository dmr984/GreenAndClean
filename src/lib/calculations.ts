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

// Arrotondamento per ore ordinarie: scatta alla mezz'ora se si superano i 25 minuti.
const roundOrdinaryHours = (minutes: number): number => {
    if (minutes <= 0) return 0;
    const hours = minutes / 60;
    const decimalPart = hours - Math.floor(hours);

    if (decimalPart > 0.916) { // ~55 minuti
        return Math.ceil(hours);
    }
    if (decimalPart > 0.416) { // ~25 minuti
        return Math.floor(hours) + 0.5;
    }
    return Math.floor(hours);
};

// Arrotondamento per ore straordinarie in base alla preferenza dell'operatore.
const roundOvertimeHours = (minutes: number, calculationType: 'hourly' | 'half_hourly' = 'hourly'): number => {
    if (minutes <= 0) return 0;

    if (calculationType === 'half_hourly') {
        // Logica a mezz'ora: scatta a 25/55 minuti
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        let extra = 0;
        if (remainingMinutes >= 55) {
            extra = 1;
        } else if (remainingMinutes >= 25) {
            extra = 0.5;
        }
        return hours + extra;
    }
    
    // Logica oraria di default: scatta a 50 minuti
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours + (remainingMinutes >= 50 ? 1 : 0);
};



export const calculateShiftDetails = (events: Timbratura[], schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date | null, breakMinutes: number } => {
    const clockInEvent = events.find(e => e.type === 'entrata');
    const clockOutEvent = events.find(e => e.type === 'uscita');

    if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null, calculationEnd: null, breakMinutes: 0 };

    const clockInTime = clockInEvent.timestamp.toDate();
    let calculationStartTime = clockInTime;

    if (schedule?.startTime && !ignoreContractualStart) {
        const [h, m] = schedule.startTime.split(':').map(Number);
        const contractualStart = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
        if (clockInTime < contractualStart) {
            calculationStartTime = contractualStart;
        }
    }

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
    const workedMillis = totalMillis > 0 ? totalMillis - breakDurationMillis : 0;
    const workedMinutes = workedMillis > 0 ? Math.floor(workedMillis / (1000 * 60)) : 0;
    
    const finalCalculationEnd = new Date(calculationStartTime.getTime() + workedMillis + breakDurationMillis);

    return { 
        workedMinutes,
        calculationStart: calculationStartTime,
        calculationEnd: finalCalculationEnd,
        breakMinutes: Math.floor(breakDurationMillis / 60000)
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
    
    // Process each day of the month
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
            const ignoreContractualStart = events.find(e => e.type === 'entrata')?.ignoreContractualStart || false;
            
            const { workedMinutes } = calculateShiftDetails(events, dailySchedule, ignoreContractualStart);
           
            let ordinaryMinutes = 0;
            let overtimeMinutes = 0;

            if (isWorkDay) {
                 const contractualMinutes = contractualHours * 60;
                 ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
                 overtimeMinutes = Math.max(0, workedMinutes - ordinaryMinutes);
            } else {
                ordinaryMinutes = 0;
                overtimeMinutes = workedMinutes;
            }
            
            const permissionHours = monthlyData.requests
                .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
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
                    ordinaryHours: roundOrdinaryHours(ordinaryMinutes),
                    overtimeHours: roundOvertimeHours(overtimeMinutes, operator.overtimeCalculation), 
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
    
    // =================================================================
    // SUMMARIZE
    // =================================================================
    const totalOrdinary = details.reduce((sum, d) => sum + (d.shift?.ordinaryHours || 0), 0);
    
    // SOURCE OF TRUTH: Sum the daily calculated (and rounded) overtime hours from shifts.
    const totalOvertimeFromShifts = details.reduce((sum, d) => sum + (d.shift?.overtimeHours || 0), 0);
    
    // Add manually approved overtime requests that are NOT associated with a shift
    const manualOvertimeHours = monthlyData.requests
        .filter(r => r.type === 'straordinario' && isWithinInterval(r.startDate.toDate(), monthInterval) && !r.associatedShiftId)
        .reduce((sum, r) => sum + (r.hours || 0), 0);

    const totalOvertime = totalOvertimeFromShifts + manualOvertimeHours;

    const totalPermesso = monthlyData.requests
        .filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval))
        .reduce((sum, r) => sum + (r.hours || 0), 0);
            
    let ferieDays = 0;
    let malattiaDays = 0;

    const processedLeaveDays = new Set<string>();
    monthlyData.requests.forEach(req => {
        if (req.type === 'ferie' || req.type === 'malattia') {
            const startDate = startOfDay(req.startDate.toDate());
            const endDate = startOfDay(req.endDate.toDate());

            for (let day = new Date(startDate); day <= endDate; day = addDays(day, 1)) {
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
