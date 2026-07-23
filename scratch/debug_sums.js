process.env.TZ = 'Europe/Rome';
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

const rawTimbrature = JSON.parse(fs.readFileSync('C:\\Users\\Utente\\.gemini\\antigravity\\brain\\348af26c-5bec-47f1-abc8-9d766c3153e5\\.system_generated\\steps\\175\\output.txt', 'utf8'));
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
        approvedOrdinaryHours: d.fields.approvedOrdinaryHours ? Number(d.fields.approvedOrdinaryHours.integerValue || d.fields.approvedOrdinaryHours.doubleValue) : undefined,
        approvedOvertimeHours: d.fields.approvedOvertimeHours ? Number(d.fields.approvedOvertimeHours.integerValue || d.fields.approvedOvertimeHours.doubleValue) : undefined,
    };
});

const operator = {
    id: 'WMBVZ7Ri73twfMApqX87',
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

const currentMonth = new Date('2026-06-01T00:00:00');
const today = new Date('2026-07-01T12:00:00'); // July 1st midday

const originalDate = global.Date;
global.Date = class extends originalDate {
    constructor(...args) {
        if (args.length === 0) return new originalDate(today.getTime());
        return new originalDate(...args);
    }
};
global.Date.now = () => today.getTime();

const eomResult = processMonthlyData(currentMonth, operator, {
    timbrature: timbrature,
    requests: [],
    dailyNotes: [],
    straordinari: []
});

const cleanTimbrature = timbrature.filter(e => e.status !== 'rifiutata');
const legacyShiftsByDay = {};
const modernShifts = [];
const shiftsById = {};
cleanTimbrature.filter(e => e.shiftId).forEach(event => {
    if (!shiftsById[event.shiftId]) shiftsById[event.shiftId] = [];
    shiftsById[event.shiftId].push(event);
});
for (const id in shiftsById) {
    modernShifts.push({ events: shiftsById[id] });
}
cleanTimbrature.filter(e => !e.shiftId).forEach(event => {
    const dayString = event.timestamp.toDate().toLocaleDateString('sv');
    if (!legacyShiftsByDay[dayString]) legacyShiftsByDay[dayString] = [];
    legacyShiftsByDay[dayString].push(event);
});
const legacyShifts = Object.values(legacyShiftsByDay).map(events => ({ events }));
const allShifts = [...modernShifts, ...legacyShifts];
const shiftsPageTimbrature = allShifts.flatMap(s => s.events);

const shiftsResult = processMonthlyData(currentMonth, operator, {
    timbrature: shiftsPageTimbrature,
    requests: [],
    dailyNotes: [],
    straordinari: []
});

console.log('--- Comparison with Real Empty Requests ---');
console.log(`EOM Page:    ${eomResult.monthlySummary.ordinaryHours}h (${eomResult.monthlySummary.ordinaryWorkedDays}gg)`);
console.log(`Shifts Page: ${shiftsResult.monthlySummary.ordinaryHours}h (${shiftsResult.monthlySummary.ordinaryWorkedDays}gg)`);

global.Date = originalDate;
