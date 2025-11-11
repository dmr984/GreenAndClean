'use client';

import React from 'react';
import { ClockWidget } from "@/components/dashboard/clock-widget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { it } from 'date-fns/locale';

export default function Dashboard() {
  const [date, setDate] = React.useState<Date | undefined>(new Date());

  // In a future step, we'll connect this to clock-in data.
  const modifiers = {
    completed: [] as Date[], // Example: new Date(2024, 5, 20)
  };
  
  const modifiersStyles = {
    completed: { backgroundColor: 'hsl(var(--primary) / 0.3)', color: 'hsl(var(--primary-foreground))' },
  };

  return (
    <>
    <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
    <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
      <div className="lg:col-span-1">
         <ClockWidget />
      </div>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-2xl">I Tuoi Turni</CardTitle>
          <CardDescription>
            Visualizza i giorni in cui hai lavorato.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
            <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
                locale={it}
                modifiers={modifiers}
                modifiersStyles={modifiersStyles}
                disabled // The calendar is for display, not interaction
            />
        </CardContent>
      </Card>
    </div>
    </>
  );
}
