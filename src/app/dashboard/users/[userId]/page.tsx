'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, Package, Briefcase, Plus, Minus, CalendarDays, Hourglass, TrendingUp, CalendarCheck, ClipboardCheck } from 'lucide-react';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';


type User = {
  id: string;
  username: string;
  password?: string;
  location?: string;
  role: 'admin' | 'operator';
  expectedHours?: number;
};

type LeaveRequest = { id: string; operatorId: string; type: string; from: string; to: string; timeFrom?: string; timeTo?: string; status: 'In attesa' | 'Approvata' | 'Rifiutata'; reason?: string };
type Shift = { 
  id: string; 
  userId: string;
  startTime: string | null; 
  endTime: string | null; 
  pauses: { startTime: string; endTime: string | null }[];
  status: 'In attesa' | 'Approvato';
};

const getAvatarFallback = (name: string) => {
    if (!name) return "??";
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

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


export default function UserProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const { toast } = useToast();
  const firestore = useFirestore();

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const fetchAllData = useCallback(async () => {
    if (!firestore || !userId) return;

    setLoading(true);
    
    try {
        const userDocRef = doc(firestore, 'app-users', userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const foundUser = { id: userDoc.id, ...userDoc.data() } as User;
            setUser(foundUser);
        } else {
            setUser(null);
        }
    } catch (e) {
        setUser(null);
    }

    setLoading(false);
  }, [userId, firestore]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!firestore || !userId) return;

    const shiftsQuery = query(collection(firestore, 'shifts'), where('userId', '==', userId));
    const unsubShifts = onSnapshot(shiftsQuery, snapshot => {
        setShifts(snapshot.docs.map(d => ({id: d.id, ...d.data()} as Shift)).filter(s => s.endTime));
    });

    const leavesQuery = query(collection(firestore, 'leave-requests'), where('operatorId', '==', userId));
    const unsubLeaves = onSnapshot(leavesQuery, snapshot => {
        setLeaveRequests(snapshot.docs.map(d => ({id: d.id, ...d.data()} as LeaveRequest)));
    });

    return () => {
        unsubShifts();
        unsubLeaves();
    };
  }, [userId, firestore]);

  const summaryStats = useMemo(() => {
    if (!user) return null;

    const approvedShifts = shifts.filter(s => s.status === 'Approvato');
    const workedDayDates = new Set(
        approvedShifts
            .filter(s => s.startTime && s.endTime)
            .map(s => new Date(s.startTime!).toISOString().split('T')[0])
    );
    const workedDays = workedDayDates.size;

    const totalOvertimeMinutes = approvedShifts.reduce((total, shift) => {
        const { workedMinutes } = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
        const expectedMinutes = (user.expectedHours || 0) * 60;
        const overtime = Math.max(0, workedMinutes - expectedMinutes);
        return total + overtime;
    }, 0);

    const vacationDays = leaveRequests.reduce((total, req) => {
        if (req.status === 'Approvata' && req.type === 'Ferie') {
            const start = new Date(req.from);
            const end = new Date(req.to);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
            return total + diffDays;
        }
        return total;
    }, 0);

    const permitMinutes = leaveRequests.reduce((total, req) => {
        if (req.status === 'Approvata' && req.type === 'Permesso' && req.timeFrom && req.timeTo) {
            const [fromHours, fromMinutes] = req.timeFrom.split(':').map(Number);
            const [toHours, toMinutes] = req.timeTo.split(':').map(Number);
            const start = new Date();
            start.setHours(fromHours, fromMinutes, 0, 0);
            const end = new Date();
            end.setHours(toHours, toMinutes, 0, 0);
            const diffMillis = end.getTime() - start.getTime();
            return total + (diffMillis / (1000 * 60));
        }
        return total;
    }, 0);

    return {
        workedDays,
        overtime: formatMinutesToHours(totalOvertimeMinutes),
        vacationDays,
        permitHours: formatMinutesToHours(permitMinutes),
    };
  }, [shifts, leaveRequests, user]);


  const handleExpectedHoursChange = async (amount: number) => {
      if (!user || !firestore) return;
      
      const currentHours = user.expectedHours || 0;
      const newHours = Math.max(0, currentHours + amount);

      const updatedUser = { ...user, expectedHours: newHours };
      setUser(updatedUser);

      const userDocRef = doc(firestore, 'app-users', userId);
      try {
          await updateDoc(userDocRef, { expectedHours: newHours });
          toast({ title: "Ore aggiornate", description: `Ore giornaliere previste impostate a ${newHours}.` });
      } catch (e) {
          toast({ title: "Errore", description: "Impossibile aggiornare le ore.", variant: "destructive" });
          setUser(user);
      }
  };

  if (loading) {
    return (
        <>
            <div className="flex items-center gap-4 mb-4"> <Skeleton className="h-10 w-64" /> </div>
            <Card>
                <CardHeader className="flex flex-col md:flex-row items-start md:items-center gap-4">
                    <Skeleton className="h-20 w-20 rounded-full" />
                    <div className="flex-1 space-y-2"> <Skeleton className="h-8 w-48" /> <Skeleton className="h-6 w-64" /> </div>
                </CardHeader>
                <CardContent> <Skeleton className="h-48 w-full" /> </CardContent>
            </Card>
        </>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold mb-4">Utente non trovato</h2>
        <p className="text-muted-foreground mb-4">L'utente che stai cercando non esiste.</p>
         <Button asChild>
          <Link href="/dashboard/users">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna agli Operatori
          </Link>
        </Button>
      </div>
    );
  }
  
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

  const SectionButton = ({ icon, label, href }: { icon: React.ReactNode, label: string, href: string }) => (
    <Link href={href} className="block">
        <Card className="text-center transition-all hover:bg-muted/50 hover:ring-2 hover:ring-primary">
            <CardHeader>
                <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-lg bg-muted text-primary">
                    {icon}
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <p className="font-semibold text-lg">{label}</p>
            </CardContent>
        </Card>
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
        <h2 className="text-3xl font-bold tracking-tight">Profilo Operatore</h2>
        
        <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start gap-4">
                 <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-2xl">{getAvatarFallback(user.username)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                    <CardTitle className="text-2xl">{user.username}</CardTitle>
                    <CardDescription className="text-base flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 gap-y-1">
                       <span>Password: {user.password}</span>
                       <span>Luogo: {user.location}</span>
                    </CardDescription>
                     <div className="flex items-center gap-2 mt-4">
                        <Label htmlFor="expected-hours" className="text-base shrink-0">Ore Previste:</Label>
                         <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleExpectedHoursChange(-1)}> <Minus className="h-4 w-4" /> </Button>
                            <span className="min-w-[32px] text-center font-bold text-lg">{user.expectedHours || 0}</span>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleExpectedHoursChange(1)}> <Plus className="h-4 w-4" /> </Button>
                        </div>
                     </div>
                </div>
            </CardHeader>
        </Card>

         {summaryStats && (
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Riepilogo Attività</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 grid-cols-2">
                        <StatCard icon={<CalendarDays className="h-5 w-5"/>} label="Giorni Lavorati" value={summaryStats.workedDays} />
                        <StatCard icon={<TrendingUp className="h-5 w-5"/>} label="Straordinari" value={summaryStats.overtime} />
                        <StatCard icon={<CalendarCheck className="h-5 w-5"/>} label="Giorni Ferie" value={summaryStats.vacationDays} />
                        <StatCard icon={<Hourglass className="h-5 w-5"/>} label="Ore Permesso" value={summaryStats.permitHours} />
                    </div>
                </CardContent>
            </Card>
         )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SectionButton 
                label="Timbrature" 
                href={`/dashboard/users/${userId}/shifts`} 
                icon={<Briefcase className="h-6 w-6"/>} 
            />
            <SectionButton 
                label="Ferie e Permessi" 
                href={`/dashboard/users/${userId}/leaves`}
                icon={<CheckCircle className="h-6 w-6"/>} 
            />
            <SectionButton 
                label="Richieste Forniture" 
                href={`/dashboard/users/${userId}/supplies`}
                icon={<Package className="h-6 w-6"/>} 
            />
        </div>
    </div>
  );
}
