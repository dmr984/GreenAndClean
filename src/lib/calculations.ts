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


export type DailyDetail = {
    date: Date;
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo' | 'festa';
    shift: {
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
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes > 45) {
        return hours + 1;
    }
    if (remainingMinutes > 15) {
        return hours + 0.5;
    }
    return hours;
};


export const roundOvertimeHours = (minutes: number, calculationType: 'hourly' | 'half_hourly' = 'hourly'): number => {
    if (minutes <= 0) return 0;

    const totalHours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes >= 50) {
        return totalHours + 1;
    }
    return totalHours;
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
        const contractualStartDateTime = set(clockInTime, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });

        const isWorkDay = (schedule.totalHours || 0) > 0;
        
        if (isWorkDay) { // Logic for regular workdays
            const minutesLate = (clockInTime.getTime() - contractualStartDateTime.getTime()) / (1000 * 60);
            if (minutesLate <= 15) { 
                calculationStartTime = contractualStartDateTime;
            } else {
                const minutes = clockInTime.getMinutes();
                const roundedTime = set(clockInTime, { seconds: 0, milliseconds: 0 });
                if (minutes > 15 && minutes <= 45) {
                    roundedTime.setMinutes(30);
                } else if (minutes > 45) {
                    roundedTime.setHours(roundedTime.getHours() + 1, 0);
                } else {
                    roundedTime.setMinutes(0);
                }
                calculationStartTime = roundedTime;
            }
        } else { // Logic for non-workdays (like Sunday) where a start time is still provided
             calculationStartTime = contractualStartDateTime;
        }
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

    // 4. Calculate Total Worked Milliseconds from the correct start time
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

export const calculateHours = (shift: { date: Date, events: Timbratura[] }, schedule: DailySchedule | undefined, ignoreContractualStart: boolean = false, overtimeCalculation?: 'hourly' | 'half_hourly'): { ordinary: number, overtime: number, leave: number, worked: number, break: number, calculationStart: Date | null, calculationEnd: Date | null } => {
    
    const { workedMinutes, breakMinutes, calculationStart } = calculateShiftDetails(shift.events, schedule, ignoreContractualStart);

    const contractualHours = schedule?.totalHours || 0;
    const contractualMinutes = contractualHours * 60;
    
    const clockInEvent = shift.events.find(e => e.type === 'entrata');
    const isMakeupShift = !!clockInEvent?.makeupOfDay;

    const isWorkDay = isMakeupShift || (contractualHours > 0 && !isPublicHoliday(shift.date));
    
    if (!isWorkDay) {
        const overtime = roundOvertimeHours(workedMinutes, overtimeCalculation);
        const calcEnd = calculationStart ? new Date(calculationStart.getTime() + (overtime * 60 + breakMinutes) * 60000) : null;
        return {
            ordinary: 0,
            overtime,
            leave: 0,
            worked: workedMinutes,
            break: breakMinutes,
            calculationStart,
            calculationEnd: calcEnd,
        };
    }

    const ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
    const overtimeMinutes = Math.max(0, workedMinutes - contractualMinutes);

    const ordinaryHours = roundOrdinaryHours(ordinaryMinutes);
    const overtimeHours = roundOvertimeHours(overtimeMinutes, overtimeCalculation);

    const leaveHours = isWorkDay && ordinaryHours < contractualHours ? contractualHours - ordinaryHours : 0;

    const totalCalculatedMinutes = (ordinaryHours + overtimeHours) * 60;
    const calculationEnd = calculationStart ? new Date(calculationStart.getTime() + totalCalculatedMinutes * 60000 + breakMinutes * 60000) : null;

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
        let dailySchedule = operator.workSchedule[dayName];
        const dayString = day.toDateString();
        const isHoliday = isPublicHoliday(day);
        
        const workedEventsRaw = dailyTimbrature[dayString];
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

        
        if (isHoliday && !workedEventsRaw) {
             details.push({ date: day, status: 'festa', request: null, shift: null, note: dailyNote?.note });
        } else if (workedEventsRaw) {
            const dayShifts: { date: Date, events: Timbratura[] }[] = [];
            let currentShiftEvents: Timbratura[] = [];
            const sortedEvents = [...workedEventsRaw].sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

            for (const event of sortedEvents) {
                currentShiftEvents.push(event);
                if (event.type === 'uscita') {
                    const clockInTime = currentShiftEvents.find(e => e.type === 'entrata')?.timestamp.toDate();
                    if(clockInTime) {
                        dayShifts.push({
                            date: day,
                            events: currentShiftEvents,
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
            let finalCalcStart: Date | undefined = undefined;
            let finalCalcEnd: Date | undefined = undefined;


            dayShifts.forEach(shift => {
                 const ignoreContractualStart = shift.events.find(e => e.type === 'entrata')?.ignoreContractualStart || false;
                 const { ordinary, overtime, calculationStart, calculationEnd } = calculateHours(shift, dailySchedule, ignoreContractualStart, operator.overtimeCalculation);
                 totalOrdinary += ordinary;
                 totalOvertime += overtime;
                 allDayEvents.push(...shift.events);
                 if (calculationStart) finalCalcStart = calculationStart;
                 if (calculationEnd) finalCalcEnd = calculationEnd;
            });
            
            const permissionHours = monthlyData.requests
                .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
                .reduce((sum, r) => sum + (r.hours || 0), 0);
            
            details.push({
                date: day,
                status: 'lavorato',
                request: null,
                shift: {
                    events: allDayEvents.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis()),
                    contractualHours,
                    ordinaryHours: totalOrdinary,
                    overtimeHours: totalOvertime, 
                    permissionHours: permissionHours,
                    calculationStart: finalCalcStart,
                    calculationEnd: finalCalcEnd,
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
