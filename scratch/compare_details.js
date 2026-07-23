const fs = require('fs');

class Timestamp {
    constructor(seconds, nanoseconds) {
        this.seconds = seconds;
        this.nanoseconds = nanoseconds;
    }
    toDate() {
        return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
    }
    toMillis() {
        return this.seconds * 1000 + this.nanoseconds / 1000000;
    }
}

const rawTimbrature = JSON.parse(fs.readFileSync('C:\\Users\\Utente\\.gemini\\antigravity\\brain\\348af26c-5bec-47f1-abc8-9d766c3153e5\\.system_generated\\steps\\110\\output.txt', 'utf8'));
const timbrature = rawTimbrature.documents.map(d => {
    const tsStr = d.fields.timestamp.timestampValue;
    const date = new Date(tsStr);
    return {
        id: d.name.split('/').pop(),
        type: d.fields.type.stringValue,
        timestamp: new Timestamp(Math.floor(date.getTime() / 1000), (date.getTime() % 1000) * 1000000),
        status: d.fields.status.stringValue,
        shiftId: d.fields.shiftId?.stringValue,
        isAuto: d.fields.isAuto?.booleanValue,
        isOvertime: d.fields.isOvertime?.booleanValue,
        ignoreContractualStart: d.fields.ignoreContractualStart?.booleanValue,
        makeupOfDay: d.fields.makeupOfDay?.stringValue,
        approvedOrdinaryHours: d.fields.approvedOrdinaryHours ? Number(d.fields.approvedOrdinaryHours.integerValue) : undefined,
        approvedOvertimeHours: d.fields.approvedOvertimeHours ? Number(d.fields.approvedOvertimeHours.integerValue) : undefined,
    };
});

const requests = [
    {
        id: 'GJjEvkrjq6oJIyKH2sfj',
        type: 'ferie',
        status: 'approvato',
        startDate: new Timestamp(Math.floor(new Date('2026-06-23T22:00:00Z').getTime() / 1000), 0),
        endDate: new Timestamp(Math.floor(new Date('2026-06-23T22:00:00Z').getTime() / 1000), 0),
        dailyCosts: { '2026-06-24': 30 }
    }
];

const operator = {
    id: 'TzfQ87SIB7dwvbNIx9SC',
    username: '000007',
    firstName: 'Diana',
    lastName: 'Sarcone',
    hourlyRate: 7.5,
    overtimeRate: 8,
    monthlyContractualHours: 36,
    salaryType: 'hourly',
    scheduleType: 'monthly',
    workSchedule: {
        monday: { totalHours: 3 },
        tuesday: { totalHours: 3 },
        wednesday: { totalHours: 3 },
        thursday: { totalHours: 3 },
        friday: { totalHours: 3 }
    }
};

const { processMonthlyData } = require('../src/lib/calculations.ts');

const currentMonth = new Date('2026-06-01');

// Run with different values of "today" (let's say July 1st, or June 20th)
const todayDates = [
    new Date('2026-06-20T12:00:00'),
    new Date('2026-07-01T12:00:00')
];

todayDates.forEach(today => {
    // We mock global Date inside processMonthlyData if it uses new Date().
    // Since calculations.ts uses `new Date()` for today, we can temporarily spy or override Date
    const originalDate = global.Date;
    global.Date = class extends originalDate {
        constructor(...args) {
            if (args.length === 0) {
                return new originalDate(today.getTime());
            }
            return new originalDate(...args);
        }
    };
    global.Date.now = () => today.getTime();

    console.log(`\n=================== Simulation with today = ${today.toISOString().split('T')[0]} ===================`);
    
    // EOM Page
    const eomResult = processMonthlyData(currentMonth, operator, {
        timbrature: timbrature,
        requests: requests,
        dailyNotes: [],
        straordinari: []
    });

    // Shifts Page
    const cleanTimbrature = timbrature.filter(e => e.status !== 'rifiutata');
    const legacyShiftsByDay = {};
    const modernShifts = [];
    
    // Reconstruct modernShifts
    const shiftsById = {};
    cleanTimbrature.filter(e => e.shiftId).forEach(event => {
        if (!shiftsById[event.shiftId]) shiftsById[event.shiftId] = [];
        shiftsById[event.shiftId].push(event);
    });
    for (const id in shiftsById) {
        modernShifts.push({ events: shiftsById[id] });
    }
    // Reconstruct legacyShifts
    cleanTimbrature.filter(e => !e.shiftId).forEach(event => {
        const day = event.timestamp.toDate().toISOString().split('T')[0];
        if (!legacyShiftsByDay[day]) legacyShiftsByDay[day] = [];
        legacyShiftsByDay[day].push(event);
    });
    const legacyShifts = Object.values(legacyShiftsByDay).map(events => ({ events }));
    
    const allShifts = [...modernShifts, ...legacyShifts];
    const shiftsPageTimbrature = allShifts.flatMap(s => s.events);

    const shiftsResult = processMonthlyData(currentMonth, operator, {
        timbrature: shiftsPageTimbrature,
        requests: requests,
        dailyNotes: [],
        straordinari: []
    });

    console.log('\nEOM Result:');
    console.log('ordinaryHours:', eomResult.monthlySummary.ordinaryHours);
    console.log('ordinaryWorkedDays:', eomResult.monthlySummary.ordinaryWorkedDays);
    console.log('festiveHours:', eomResult.monthlySummary.festiveHours);
    console.log('ferieDays:', eomResult.monthlySummary.ferieDays);
    console.log('ferieHours:', eomResult.monthlySummary.ferieHours);

    console.log('\nShifts Result:');
    console.log('ordinaryHours:', shiftsResult.monthlySummary.ordinaryHours);
    console.log('ordinaryWorkedDays:', shiftsResult.monthlySummary.ordinaryWorkedDays);
    console.log('festiveHours:', shiftsResult.monthlySummary.festiveHours);
    console.log('ferieDays:', shiftsResult.monthlySummary.ferieDays);
    console.log('ferieHours:', shiftsResult.monthlySummary.ferieHours);

    // Restore Date
    global.Date = originalDate;
});
