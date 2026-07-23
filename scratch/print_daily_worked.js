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

// Run with today = July 1st, 2026, but let's see why the numbers are different
// Wait! Let's check how many shifts are actually processed if today is, say, June 20th.
// Let's print daily details for both cases where the sum of worked hours is 33.5 or 30.5.
// Let's write a loop to find which value of "today" gives 33.5 or 30.5!

const start = new Date('2026-06-01T00:00:00');
const end = new Date('2026-07-02T00:00:00');

for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const today = new Date(d);
    
    // Override Date
    const originalDate = global.Date;
    global.Date = class extends originalDate {
        constructor(...args) {
            if (args.length === 0) return new originalDate(today.getTime());
            return new originalDate(...args);
        }
    };
    global.Date.now = () => today.getTime();
    
    // EOM Page
    const eomResult = processMonthlyData(currentMonth, operator, {
        timbrature: timbrature,
        requests: requests,
        dailyNotes: [],
        straordinari: []
    });

    const ordHrs = eomResult.monthlySummary.ordinaryHours;
    const ordDays = eomResult.monthlySummary.ordinaryWorkedDays;

    if (ordHrs === 30.5 || ordHrs === 33.5) {
        console.log(`Today: ${today.toISOString().split('T')[0]} -> ordinaryHours: ${ordHrs}, ordinaryWorkedDays: ${ordDays}`);
    }

    global.Date = originalDate;
}
