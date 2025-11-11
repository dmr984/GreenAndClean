'use client';

import React from 'react';
import { ClockWidget, type Shift } from "@/components/dashboard/clock-widget";
import { WorkSchedule } from '@/components/dashboard/work-schedule';


export function OperatorDashboard() {
  const [shifts, setShifts] = React.useState<Shift[]>([]);

  // Function to update shifts from storage, can be passed to child components
  const refreshShifts = () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('shifts');
    setShifts(stored ? JSON.parse(stored) : []);
  };

  React.useEffect(() => {
    refreshShifts();
    window.addEventListener('storage', refreshShifts);
    return () => window.removeEventListener('storage', refreshShifts);
  }, []);


  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
        <div className="lg:col-span-1">
          <ClockWidget onShiftComplete={refreshShifts} />
        </div>
        <div className="lg:col-span-1">
          <WorkSchedule shifts={shifts} />
        </div>
      </div>
    </>
  );
}
