import { startOfDay } from 'date-fns';

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
    return new Date(year, month - 1, day);
};

const generateHolidaysForYear = (year: number): Date[] => {
    const easterSunday = getEasterSunday(year);
    const easterMonday = new Date(easterSunday);
    easterMonday.setDate(easterSunday.getDate() + 1);

    return [
        // Fixed holidays
        new Date(year, 0, 1),   // Capodanno
        new Date(year, 0, 6),   // Epifania
        new Date(year, 3, 25),  // Festa della Liberazione
        new Date(year, 4, 1),   // Festa dei Lavoratori
        new Date(year, 5, 2),   // Festa della Repubblica
        new Date(year, 7, 15),  // Ferragosto
        new Date(year, 10, 1),  // Ognissanti
        new Date(year, 11, 8),  // Immacolata Concezione
        new Date(year, 11, 25), // Natale
        new Date(year, 11, 26), // Santo Stefano

        // Dynamic holidays
        easterSunday,
        easterMonday,
    ];
};

// Generate holidays for a few years to be safe
const holidays2026 = generateHolidaysForYear(2026);
const holidays2027 = generateHolidaysForYear(2027);


// Combine and export a set of date strings for efficient lookup
const holidaySet = new Set(
    [...holidays2026, ...holidays2027].map(d => startOfDay(d).toISOString())
);

export const isPublicHoliday = (date: Date): boolean => {
    return holidaySet.has(startOfDay(date).toISOString());
};
