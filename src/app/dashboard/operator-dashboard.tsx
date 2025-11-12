'use client';

import React, { useMemo } from 'react';
import { ClockWidget, type Shift } from "@/components/dashboard/clock-widget";
import { WorkSchedule } from '@/components/dashboard/work-schedule';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CalendarCheck, Hourglass, TrendingUp, Megaphone, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  expectedHours?: number;
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

type Announcement = {
  id: string;
  title: string;
  content: string;
  date: string;
  recipients: string[]; // 'all' or array of user IDs
  read?: boolean;
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

const StatCard = ({ icon, label, value, badgeCount }: { icon: React.ReactNode, label: string, value: string | number, badgeCount?: number }) => (
    <Card className="relative">
         {badgeCount && badgeCount > 0 && 
            <Badge variant="destructive" className="absolute -top-2 -right-2">{badgeCount}</Badge>
         }
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
            <div className="text-muted-foreground">{icon}</div>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

const calculateDuration = (start: string | null, end: string | null, pauses: Shift['pauses']) => {
    if (!start || !end) return { workedMinutes: 0 };

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    
    const pauseMillis = pauses
        .filter(p => p.endTime)
        .reduce((acc, p) => acc + (new Date(p.endTime!).getTime() - new Date(p.startTime).getTime()), 0);

    const workedMillis = endTime - startTime - pauseMillis;
    return { workedMinutes: Math.floor(workedMillis / 60000) };
};

const formatMinutesToHours = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function OperatorDashboard() {
  const [shifts, setShifts] = React.useState<Shift[]>([]);
  const [leaveRequests, setLeaveRequests] = React.useState<LeaveRequest[]>([]);
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
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

        const allAnnouncements = getFromStorage<Announcement[]>('announcements', []);
        const readAnnouncements = getFromStorage<string[]>('read-announcements', []);
        
        const userAnnouncements = allAnnouncements
            .filter(a => a.recipients.includes('all') || a.recipients.includes(currentUser.id))
            .map(a => ({...a, read: readAnnouncements.includes(a.id)}));

        setAnnouncements(userAnnouncements);
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

    const totalOvertimeMinutes = approvedShifts.reduce((total, shift) => {
        const { workedMinutes } = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
        const expectedMinutes = (user?.expectedHours || 0) * 60;
        const overtime = Math.max(0, workedMinutes - expectedMinutes);
        return total + overtime;
    }, 0);


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

    const unreadAnnouncements = announcements.filter(a => !a.read).length;

    return {
        workedDays,
        vacationDays,
        permitHours: formatMinutesToHours(permitMinutes),
        overtime: formatMinutesToHours(totalOvertimeMinutes),
        unreadAnnouncements,
    };
}, [shifts, leaveRequests, announcements, user]);

  const markAnnouncementAsRead = (announcementId: string) => {
    const readAnnouncements = getFromStorage<string[]>('read-announcements', []);
    if (!readAnnouncements.includes(announcementId)) {
        const updatedRead = [...readAnnouncements, announcementId];
        localStorage.setItem('read-announcements', JSON.stringify(updatedRead));
        refreshData(); // Re-render to update the 'read' state
    }
  }


  if (!user) {
    return <div>Caricamento dati operatore...</div>;
  }
  
  const approvedShifts = shifts.filter(s => s.status === 'Approvato');
  const recentAnnouncements = announcements.slice(0, 3);

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4 md:mb-8">
            <StatCard icon={<TrendingUp className="h-5 w-5"/>} label="Giorni Lavorati" value={summaryStats.workedDays} />
            <StatCard icon={<CalendarCheck className="h-5 w-5"/>} label="Giorni Ferie" value={summaryStats.vacationDays} />
            <StatCard icon={<Hourglass className="h-5 w-5"/>} label="Ore Permesso" value={summaryStats.permitHours} />
            <StatCard icon={<Timer className="h-5 w-5"/>} label="Straordinari" value={summaryStats.overtime} />
      </div>

      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
        <div className="lg:col-span-1">
          <ClockWidget onShiftComplete={refreshData} userId={user.id} userName={user.username} />
          
          <Card className="mt-4 md:mt-8">
            <CardHeader>
                <CardTitle>Annunci Recenti</CardTitle>
                <CardDescription>
                  Le ultime comunicazioni dall'amministrazione.
                  {summaryStats.unreadAnnouncements > 0 && 
                      <Badge variant="destructive" className="ml-2">{summaryStats.unreadAnnouncements} Nuov{summaryStats.unreadAnnouncements > 1 ? 'i' : 'o'}</Badge>
                  }
                </CardDescription>
            </CardHeader>
            <CardContent>
                {recentAnnouncements.length > 0 ? (
                    <div className="space-y-4">
                        {recentAnnouncements.map(ann => (
                             <Card key={ann.id} className={ann.read ? "bg-muted/50" : ""}>
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-center">
                                       <CardTitle className="text-base">{ann.title}</CardTitle>
                                       {!ann.read && <Badge variant="destructive">Nuovo</Badge>}
                                    </div>
                                    <CardDescription>{new Date(ann.date).toLocaleString('it-IT')}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm whitespace-pre-wrap">{ann.content}</p>
                                    {!ann.read && (
                                        <div className="text-right mt-2">
                                            <Button variant="link" size="sm" onClick={() => markAnnouncementAsRead(ann.id)}>Segna come letto</Button>
                                        </div>
                                    )}
                                </CardContent>
                             </Card>
                        ))}
                    </div>
                ): (
                    <p className="text-muted-foreground text-center py-8">Nessun annuncio recente.</p>
                )}
                 <Link href="/dashboard/announcements" className="w-full">
                    <Button variant="outline" className="w-full mt-4">Vedi tutti gli annunci</Button>
                </Link>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-1">
          <WorkSchedule shifts={approvedShifts} leaveRequests={leaveRequests} />
        </div>
      </div>
    </>
  );
}
