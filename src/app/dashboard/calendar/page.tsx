"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { format } from 'date-fns';

const shiftEvents = [
  { date: '2024-08-01', type: 'Morning Shift', location: 'Building A' },
  { date: '2024-08-02', type: 'Evening Shift', location: 'Building C' },
  { date: '2024-08-05', type: 'Night Shift', location: 'Building B' },
  { date: '2024-08-06', type: 'Holiday', location: 'N/A' },
  { date: '2024-08-08', type: 'Morning Shift', location: 'Building A' },
  { date: '2024-08-12', type: 'Morning Shift', location: 'Building D' },
  { date: '2024-08-13', type: 'Evening Shift', location: 'Building B' },
  { date: '2024-08-14', type: 'Night Shift', location: 'Building C' },
]

// Helper to parse dates safely for modifiers
const parseDate = (dateStr: string) => new Date(dateStr.replace(/-/g, '/'));

const modifiers = {
  morning: shiftEvents.filter(e => e.type.includes('Morning')).map(e => parseDate(e.date)),
  evening: shiftEvents.filter(e => e.type.includes('Evening')).map(e => parseDate(e.date)),
  night: shiftEvents.filter(e => e.type.includes('Night')).map(e => parseDate(e.date)),
  holiday: shiftEvents.filter(e => e.type.includes('Holiday')).map(e => parseDate(e.date)),
};

const modifiersStyles = {
  morning: { backgroundColor: 'hsl(var(--primary) / 0.2)' },
  evening: { backgroundColor: 'hsl(var(--secondary))' },
  night: { backgroundColor: 'hsl(var(--muted))' },
  holiday: { backgroundColor: 'hsl(var(--accent) / 0.3)' },
};

export default function CalendarPage() {
  const [date, setDate] = React.useState<Date | undefined>();
  const [selectedEvent, setSelectedEvent] = React.useState<(typeof shiftEvents)[0] | null>(null);

  React.useEffect(() => {
    const initialDate = new Date('2024-08-01');
    setDate(initialDate);
    const eventForToday = shiftEvents.find(e => e.date === format(initialDate, 'yyyy-MM-dd'));
    setSelectedEvent(eventForToday || null);
  }, []);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
        const formattedDate = format(selectedDate, 'yyyy-MM-dd');
        const eventForDay = shiftEvents.find(e => e.date === formattedDate);
        setSelectedEvent(eventForDay || null);
    } else {
        setSelectedEvent(null);
    }
  }

  return (
    <div className="grid gap-8 auto-rows-max md:grid-cols-1 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Work Calendar</CardTitle>
          <CardDescription>Your monthly shift schedule. Colors indicate shift type.</CardDescription>
        </CardHeader>
        <CardContent className="p-2 flex justify-center">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            className="rounded-md"
            modifiers={modifiers}
            modifiersStyles={modifiersStyles}
            defaultMonth={new Date('2024-08-01')}
          />
        </CardContent>
      </Card>
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Schedule Details</CardTitle>
          <CardDescription>
            {date ? format(date, 'MMMM d, yyyy') : 'Select a date'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedEvent ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Shift Type</h3>
                <p className="text-lg font-semibold">{selectedEvent.type}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Location</h3>
                <p className="text-lg font-semibold">{selectedEvent.location}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-center text-muted-foreground">
              <p>No shift scheduled for this day.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
