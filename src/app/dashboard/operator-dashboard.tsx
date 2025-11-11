'use client';

import React from 'react';
import { ClockWidget, type Shift } from "@/components/dashboard/clock-widget";
import { WorkSchedule } from '@/components/dashboard/work-schedule';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

export function OperatorDashboard() {
  const [shifts, setShifts] = React.useState<Shift[]>([]);
  const [user, setUser] = React.useState<UserData | null>(null);

  // Function to update shifts from storage, can be passed to child components
  const refreshShifts = React.useCallback(() => {
    if (typeof window === 'undefined') return;

    const storedUser = localStorage.getItem('user');
    if(storedUser) {
        const currentUser = JSON.parse(storedUser);
        setUser(currentUser);
        const storedShifts = localStorage.getItem('shifts');
        const allShifts: Shift[] = storedShifts ? JSON.parse(storedShifts) : [];
        setShifts(allShifts.filter(s => s.userId === currentUser.id));
    }
  }, []);

  React.useEffect(() => {
    refreshShifts();
    window.addEventListener('storage', refreshShifts);
    return () => window.removeEventListener('storage', refreshShifts);
  }, [refreshShifts]);

  if (!user) {
    return <div>Caricamento dati operatore...</div>;
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
        <div className="lg:col-span-1">
          <ClockWidget onShiftComplete={refreshShifts} userId={user.id} userName={user.username} />
        </div>
        <div className="lg:col-span-1">
          <WorkSchedule shifts={shifts} />
        </div>
      </div>
    </>
  );
}
