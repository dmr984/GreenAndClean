'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { it } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shift } from './clock-widget';
import { ScrollArea } from '../ui/scroll-area';

interface WorkScheduleProps {
    shifts: Shift[];
}

export function WorkSchedule({ shifts }: WorkScheduleProps) {
  const [selectedDayShifts, setSelectedDayShifts] = React.useState<Shift[]>([]);
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [popoverTarget, setPopoverTarget] = React.useState<HTMLElement | null>(null);

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
  
  const sortedCompletedShifts = shifts
    .filter(s => s.startTime && s.endTime)
    .sort((a,b) => new Date(b.startTime!).getTime() - new Date(a.startTime!).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">I Tuoi Turni</CardTitle>
        <CardDescription>
          Visualizza i tuoi turni completati nel calendario o nella lista.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="calendar">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="calendar">Calendario</TabsTrigger>
            <TabsTrigger value="list">Turni Recenti</TabsTrigger>
          </TabsList>
          <TabsContent value="calendar" className="flex justify-center pt-4">
             <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
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
          </TabsContent>
          <TabsContent value="list">
             <ScrollArea className="h-72 w-full">
                {sortedCompletedShifts.length > 0 ? (
                    <div className='space-y-4 p-1'>
                        {sortedCompletedShifts.map(shift => (
                             <div key={shift.id} className="p-3 rounded-md border bg-muted/50">
                                <p className="font-semibold">{new Date(shift.date).toLocaleDateString('it-IT', {weekday: 'long', day: 'numeric', month: 'long'})}</p>
                                <div className="flex justify-between items-center text-sm text-muted-foreground">
                                    <span>Entrata: {new Date(shift.startTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}</span>
                                    <span>Uscita: {new Date(shift.endTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                             </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-16">
                        <p>Nessun turno completato da mostrare.</p>
                    </div>
                )}
             </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
