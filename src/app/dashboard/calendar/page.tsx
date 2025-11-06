"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const shiftEvents = [
  { date: '2024-08-01', type: 'Turno di Mattina', location: 'Edificio A' },
  { date: '2024-08-02', type: 'Turno di Sera', location: 'Edificio C' },
  { date: '2024-08-05', type: 'Turno di Notte', location: 'Edificio B' },
  { date: '2024-08-06', type: 'Ferie', location: 'N/A' },
  { date: '2024-08-08', type: 'Turno di Mattina', location: 'Edificio A' },
  { date: '2024-08-12', type: 'Turno di Mattina', location: 'Edificio D' },
  { date: '2024-08-13', type: 'Turno di Sera', location: 'Edificio B' },
  { date: '2024-08-14', type: 'Turno di Notte', location: 'Edificio C' },
]

// Helper to parse dates safely for modifiers
const parseDate = (dateStr: string) => new Date(dateStr.replace(/-/g, '/'));

const modifiers = {
  morning: shiftEvents.filter(e => e.type.includes('Mattina')).map(e => parseDate(e.date)),
  evening: shiftEvents.filter(e => e.type.includes('Sera')).map(e => parseDate(e.date)),
  night: shiftEvents.filter(e => e.type.includes('Notte')).map(e => parseDate(e.date)),
  holiday: shiftEvents.filter(e => e.type.includes('Ferie')).map(e => parseDate(e.date)),
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
          <CardTitle>Calendario Turni</CardTitle>
          <CardDescription>Il tuo calendario mensile dei turni. I colori indicano il tipo di turno.</CardDescription>
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
            locale={it}
          />
        </CardContent>
      </Card>
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Dettagli Turno</CardTitle>
          <CardDescription>
            {date ? format(date, 'd MMMM yyyy', { locale: it }) : 'Seleziona una data'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedEvent ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Tipo Turno</h3>
                <p className="text-lg font-semibold">{selectedEvent.type}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Luogo</h3>
                <p className="text-lg font-semibold">{selectedEvent.location}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-center text-muted-foreground">
              <p>Nessun turno programmato per oggi.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
