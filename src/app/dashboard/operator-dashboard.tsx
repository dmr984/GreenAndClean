'use client';

import React from 'react';
import { ClockWidget, type Shift } from "@/components/dashboard/clock-widget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { it } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Helper to get shifts from localStorage
const getShiftsFromStorage = (): Shift[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('shifts');
  return stored ? JSON.parse(stored) : [];
};

export function OperatorDashboard() {
  const [shifts, setShifts] = React.useState<Shift[]>([]);
  const [selectedDayShifts, setSelectedDayShifts] = React.useState<Shift[]>([]);
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [popoverTarget, setPopoverTarget] = React.useState<HTMLElement | null>(null);

  // Function to update shifts from storage, can be passed to ClockWidget
  const refreshShifts = () => {
    setShifts(getShiftsFromStorage());
  };

  React.useEffect(() => {
    refreshShifts();
    window.addEventListener('storage', refreshShifts);
    return () => window.removeEventListener('storage', refreshShifts);
  }, []);

  const completedDays = shifts
    .filter(shift => shift.startTime && shift.endTime)
    .map(shift => new Date(shift.date));
  
  const modifiers = {
    completed: completedDays,
  };
  
  const modifiersStyles = {
    completed: { 
        backgroundColor: 'hsl(var(--primary) / 0.3)', 
        color: 'hsl(var(--primary-foreground))',
        borderRadius: '0.5rem'
    },
  };

  const handleDayClick = (day: Date, modifiers: { completed?: boolean }, e: React.MouseEvent<HTMLButtonElement>) => {
    if (modifiers.completed) {
      const dayString = day.toISOString().split('T')[0];
      const shiftsForDay = shifts.filter(s => s.date === dayString && s.startTime && s.endTime);
      setSelectedDayShifts(shiftsForDay);
      setPopoverTarget(e.currentTarget);
      setIsPopoverOpen(true);
    } else {
      setSelectedDayShifts([]);
      setIsPopoverOpen(false);
      setPopoverTarget(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
        <div className="lg:col-span-1">
          <ClockWidget onShiftComplete={refreshShifts} />
        </div>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-2xl">I Tuoi Turni</CardTitle>
            <CardDescription>
              Visualizza i giorni in cui hai lavorato. Clicca su un giorno verde per vedere i dettagli.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                {/* The trigger is now virtual, managed by state */}
                <div ref={setPopoverTarget} />
              </PopoverTrigger>
              <Calendar
                mode="single"
                className="rounded-md"
                locale={it}
                modifiers={modifiers}
                modifiersStyles={modifiersStyles}
                onDayClick={(day, mods, e) => handleDayClick(day, mods, e.currentTarget)}
              />
              {selectedDayShifts.length > 0 && (
                 <PopoverContent className="w-80" style={{ zIndex: 100 }}>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Dettaglio Turno</h4>
                      <p className="text-sm text-muted-foreground">
                        Orari del {new Date(selectedDayShifts[0].date).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {selectedDayShifts.map(shift => (
                         <div key={shift.id} className="grid grid-cols-2 items-center gap-4 text-sm">
                           <span className="font-medium">Entrata:</span>
                           <span className="text-right">{new Date(shift.startTime!).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                           <span className="font-medium">Uscita:</span>
                           <span className="text-right">{new Date(shift.endTime!).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                         </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
