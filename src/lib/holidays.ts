import { format } from 'date-fns';

// Note: Easter and Easter Monday are calculated dynamically.
// Other holidays are fixed. This list includes major Italian public holidays.

// Function to calculate Easter Sunday for a given year (Gregorian algorithm)
const getEasterSunday = (year: number): Date => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    // Return local date at midnight
    return new Date(year, month - 1, day);
};

export interface HolidayInfo {
    date: Date;
    name: string;
}

const generateHolidaysForYear = (year: number): HolidayInfo[] => {
    const easterSunday = getEasterSunday(year);
    const easterMonday = new Date(easterSunday);
    easterMonday.setDate(easterSunday.getDate() + 1);

    return [
        // Fixed holidays
        { date: new Date(year, 0, 1), name: 'Capodanno' },
        { date: new Date(year, 0, 6), name: 'Epifania' },
        { date: new Date(year, 3, 25), name: 'Festa della Liberazione' },
        { date: new Date(year, 4, 1), name: 'Festa dei Lavoratori' },
        { date: new Date(year, 5, 2), name: 'Festa della Repubblica' },
        { date: new Date(year, 7, 15), name: 'Ferragosto' },
        { date: new Date(year, 10, 1), name: 'Tutti i Santi (Ognissanti)' },
        { date: new Date(year, 11, 8), name: 'Immacolata Concezione' },
        { date: new Date(year, 11, 25), name: 'Natale' },
        { date: new Date(year, 11, 26), name: 'Santo Stefano' },

        // Dynamic holidays
        { date: easterSunday, name: 'Pasqua' },
        { date: easterMonday, name: "Lunedì dell'Angelo (Pasquetta)" },
    ];
};

// Generate holidays for a range of years
const years = Array.from({ length: 27 }, (_, i) => 2024 + i); // 2024 to 2050
const allHolidays = years.flatMap(year => generateHolidaysForYear(year));

// Map YYYY-MM-DD -> Holiday Name
const holidayMap = new Map<string, string>(
    allHolidays.map(h => [format(h.date, 'yyyy-MM-dd'), h.name])
);

export const isPublicHoliday = (date: Date): boolean => {
    return holidayMap.has(format(date, 'yyyy-MM-dd'));
};

export const getHolidayName = (date: Date): string | null => {
    return holidayMap.get(format(date, 'yyyy-MM-dd')) || null;
};

export const getHolidaysInInterval = (start: Date, end: Date): HolidayInfo[] => {
    const sTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const eTime = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();
    return allHolidays.filter(h => {
        const t = h.date.getTime();
        return t >= sTime && t <= eTime;
    });
};
