'use client';

import React, { useMemo } from 'react';
import { ClockWidget, type Shift } from "@/components/dashboard/clock-widget";
import { WorkSchedule } from '@/components/dashboard/work-schedule';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarCheck, Hourglass, TrendingUp } from 'lucide-react';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

type LeaveRequest = {
  id: string;
  user: string;
  type: string;
  from: string;
  to: string;
  timeFrom?: string;
  timeTo?: string;
  status: 'In attesa' | 'Approvata' | 'Rifiutata';
};

const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const StatCard = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
            <div className="text-muted-foreground">{icon}</div>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

const formatMinutesToHours = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function OperatorDashboard() {
  const [shifts, setShifts] = React.useState<Shift[]>([]);
  const [leaveRequests, setLeaveRequests] = React.useState<LeaveRequest[]>([]);
  const [user, setUser] = React.useState<UserData | null>(null);

  const refreshData = React.useCallback(() => {
    if (typeof window === 'undefined') return;

    const storedUser = localStorage.getItem('user');
    if(storedUser) {
        const currentUser: UserData = JSON.parse(storedUser);
        setUser(currentUser);

        const allShifts = getFromStorage<Shift[]>('shifts', []);
        setShifts(allShifts.filter(s => s.userId === currentUser.id));

        const allLeaveRequests = getFromStorage<LeaveRequest[]>('leave-requests', []);
        setLeaveRequests(allLeaveRequests.filter(r => r.user === currentUser.username));
    }
  }, []);

  React.useEffect(() => {
    refreshData();
    window.addEventListener('storage', refreshData);
    return () => window.removeEventListener('storage', refreshData);
  }, [refreshData]);

  const summaryStats = useMemo(() => {
    const approvedShifts = shifts.filter(s => s.status === 'Approvato');
    const workedDays = new Set(approvedShifts.map(s => new Date(s.startTime!).toISOString().split('T')[0])).size;

    const vacationDays = leaveRequests.reduce((total, req) => {
        if (req.status === 'Approvata' && req.type === 'Ferie') {
            const start = new Date(req.from);
            const end = new Date(req.to);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            return total + diffDays;
        }
        return total;
    }, 0);

    const permitMinutes = leaveRequests.reduce((total, req) => {
        if (req.status === 'Approvata' && req.type === 'Permesso' && req.timeFrom && req.timeTo) {
            const [fromHours, fromMinutes] = req.timeFrom.split(':').map(Number);
            const [toHours, toMinutes] = req.timeTo.split(':').map(Number);
            const start = new Date(0, 0, 0, fromHours, fromMinutes);
            const end = new Date(0, 0, 0, toHours, toMinutes);
            const diffMillis = end.getTime() - start.getTime();
            return total + (diffMillis / (1000 * 60));
        }
        return total;
    }, 0);

    return {
        workedDays,
        vacationDays,
        permitHours: formatMinutesToHours(permitMinutes),
    };
}, [shifts, leaveRequests]);


  if (!user) {
    return <div>Caricamento dati operatore...</div>;
  }
  
  const approvedShifts = shifts.filter(s => s.status === 'Approvato');

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-4 md:mb-8">
            <StatCard icon={<TrendingUp className="h-5 w-5"/>} label="Giorni Lavorati" value={summaryStats.workedDays} />
            <StatCard icon={<CalendarCheck className="h-5 w-5"/>} label="Giorni Ferie" value={summaryStats.vacationDays} />
            <StatCard icon={<Hourglass className="h-5 w-5"/>} label="Ore Permesso" value={summaryStats.permitHours} />
      </div>

      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
        <div className="lg:col-span-1">
          <ClockWidget onShiftComplete={refreshData} userId={user.id} userName={user.username} />
        </div>
        <div className="lg:col-span-1">
          <WorkSchedule shifts={approvedShifts} />
        </div>
      </div>
    </>
  );
}
