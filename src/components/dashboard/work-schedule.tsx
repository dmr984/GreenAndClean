'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { it } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shift } from './clock-widget';
import { ScrollArea } from '../ui/scroll-area';

type LeaveRequest = {
  id: string;
  user: string;
  type: string;
  from: string;
  to: string;
  status: 'In attesa' | 'Approvata' | 'Rifiutata';
};

interface WorkScheduleProps {
    shifts: Shift[];
    leaveRequests: LeaveRequest[];
}

export function WorkSchedule({ shifts, leaveRequests }: WorkScheduleProps) {
  const [selectedDayInfo, setSelectedDayInfo] = React.useState<{ shifts: Shift[], leave: LeaveRequest | null } | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [popoverTarget, setPopoverTarget] = React.useState<HTMLElement | null>(null);

  const completedDays = shifts.map(shift => new Date(shift.date));
  
  const getDatesBetween = (startDate: Date, endDate: Date) => {
    const dates = [];
    let currentDate = new Date(startDate.toISOString().split('T')[0]);
    const lastDate = new Date(endDate.toISOString().split('T')[0]);
    while (currentDate <= lastDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  };
  
  const approvedVacationDays = leaveRequests
    .filter(req => req.status === 'Approvata' && req.type === 'Ferie')
    .flatMap(req => getDatesBetween(new Date(req.from), new Date(req.to)));

  const approvedSicknessDays = leaveRequests
    .filter(req => req.status === 'Approvata' && req.type === 'Malattia')
    .flatMap(req => getDatesBetween(new Date(req.from), new Date(req.to)));

  const modifiers = {
    completed: completedDays,
    vacation: approvedVacationDays,
    sickness: approvedSicknessDays,
  };
  
  const modifiersStyles = {
    completed: { 
        backgroundColor: 'hsl(142 71% 85%)', // Verde
        color: 'hsl(142 90% 25%)',
        borderRadius: '0.5rem'
    },
    vacation: {
        backgroundColor: 'hsl(48 95% 85%)', // Giallo
        color: 'hsl(48 90% 25%)',
        borderRadius: '0.5rem'
    },
    sickness: {
        backgroundColor: 'hsl(0 84% 85%)', // Rosso
        color: 'hsl(0 90% 25%)',
        borderRadius: '0.5rem'
    },
  };

  const handleDayClick = (day: Date, modifiers: { completed?: boolean, vacation?: boolean, sickness?: boolean }, e: React.MouseEvent<HTMLButtonElement>) => {
    if (modifiers.completed || modifiers.vacation || modifiers.sickness) {
      const dayString = day.toISOString().split('T')[0];
      const shiftsForDay = shifts.filter(s => s.date === dayString);
      const leaveForDay = leaveRequests.find(req => {
        if(req.status !== 'Approvata') return false;
        const from = new Date(req.from).getTime();
        const to = new Date(req.to).getTime();
        const clickedDay = new Date(dayString).getTime();
        return clickedDay >= from && clickedDay <= to;
      }) || null;

      setSelectedDayInfo({ shifts: shiftsForDay, leave: leaveForDay });
      setPopoverTarget(e.currentTarget);
      setIsPopoverOpen(true);
    } else {
      setSelectedDayInfo(null);
      setIsPopoverOpen(false);
      setPopoverTarget(null);
    }
  };
  
  const sortedCompletedShifts = [...shifts]
    .sort((a,b) => new Date(b.startTime!).getTime() - new Date(a.startTime!).getTime())
    .slice(0, 30); // Show only the last 30 shifts

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Storico Turni Approvati</CardTitle>
        <CardDescription>
          Visualizza i tuoi turni approvati, ferie e malattie nel calendario o nella lista.
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
              {selectedDayInfo && (
                 <PopoverContent className="w-80" style={{ zIndex: 100 }}>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Dettaglio Giorno</h4>
                      <p className="text-sm text-muted-foreground">
                        Eventi del {new Date(selectedDayInfo.shifts[0]?.date || selectedDayInfo.leave!.from).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                    
                    {selectedDayInfo.shifts.length > 0 && (
                        <div className="grid gap-2">
                            <h5 className='text-sm font-semibold'>Turno di Lavoro</h5>
                            {selectedDayInfo.shifts.map(shift => (
                                <div key={shift.id} className="grid grid-cols-2 items-center gap-4 text-sm">
                                <span className="font-medium">Entrata:</span>
                                <span className="text-right">{new Date(shift.startTime!).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span className="font-medium">Uscita:</span>
                                <span className="text-right">{new Date(shift.endTime!).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            ))}
                        </div>
                    )}
                     {selectedDayInfo.leave && (
                        <div className="grid gap-2">
                            <h5 className='text-sm font-semibold'>{selectedDayInfo.leave.type}</h5>
                            <p className="text-sm text-muted-foreground">Approvato</p>
                        </div>
                    )}
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
                        <p>Nessun turno approvato da mostrare.</p>
                    </div>
                )}
             </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
