'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, CheckCircle, Package, Fingerprint, Clock, Briefcase, Plus, Minus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type User = {
  id: string;
  name: string;
  code: string;
  location: string;
  role: string;
  expectedHours?: number;
};

type LeaveRequest = { id: string; user: string; type: string; from: string; to: string; status: string; };
type SupplyRequest = { id: string; user: string; items: { [key: string]: number }; status: string; };
type Shift = { id: string; startTime: string | null; endTime: string | null; pauses: { startTime: string; endTime: string | null }[] };

const getUsersFromStorage = (): User[] => {
  if (typeof window === 'undefined') return [];
  const storedUsers = localStorage.getItem('app-users');
  return storedUsers ? JSON.parse(storedUsers) : [];
};

const saveUsersToStorage = (users: User[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('app-users', JSON.stringify(users));
  window.dispatchEvent(new Event('storage'));
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

const getAvatarFallback = (name: string) => {
    if (!name) return "??";
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

const calculateDuration = (start: string | null, end: string | null, pauses: { startTime: string; endTime: string | null }[]) => {
    if (!start || !end) return { total: 'N/A', pause: 'N/A', worked: 'N/A', totalMinutes: 0 };

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const totalMillis = endTime - startTime;
    
    const pauseMillis = pauses
        .filter(p => p.endTime)
        .reduce((acc, p) => acc + (new Date(p.endTime!).getTime() - new Date(p.startTime).getTime()), 0);

    const workedMillis = totalMillis - pauseMillis;

    const format = (ms: number) => {
        if (ms < 0) ms = 0;
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };
    
    return {
        total: format(totalMillis),
        pause: format(pauseMillis),
        worked: format(workedMillis),
        totalMinutes: Math.floor(workedMillis / 60000),
    };
};


export default function UserProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const { toast } = useToast();

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [supplyRequests, setSupplyRequests] = useState<SupplyRequest[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    let foundUser: User | undefined;
    const users = getUsersFromStorage();
    foundUser = users.find(u => u.id === userId);
    
    setUser(foundUser || null);

    if (foundUser) {
        const allLeaves = getFromStorage<LeaveRequest[]>('leave-requests', []);
        setLeaveRequests(allLeaves.filter(r => r.user === foundUser!.name));

        const allSupplies = getFromStorage<SupplyRequest[]>('supply-requests', []);
        setSupplyRequests(allSupplies.filter(r => r.user === foundUser!.name));

        const allShifts = getFromStorage<Shift[]>('shifts', []);
        // NOTE: Shifts don't have user associated, this would need a rework of the clock-in logic
        // For now, we assume we show all shifts, but ideally this would be filtered by user ID.
        setShifts(allShifts.filter(s => s.endTime)); // Only show completed shifts
    }

    setLoading(false);
  }, [userId]);

  const handleExpectedHoursChange = (amount: number) => {
      if (!user) return;
      
      const currentHours = user.expectedHours || 0;
      const newHours = Math.max(0, currentHours + amount);

      const updatedUser = { ...user, expectedHours: newHours };
      setUser(updatedUser);

      const allUsers = getUsersFromStorage();
      const updatedUsers = allUsers.map(u => u.id === userId ? updatedUser : u);
      saveUsersToStorage(updatedUsers);

      toast({ title: "Ore aggiornate", description: `Ore giornaliere previste impostate a ${newHours}.` });
  };


  if (loading) {
    return (
        <>
            <div className="flex items-center gap-4 mb-4"> <Skeleton className="h-10 w-64" /> </div>
            <Card>
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
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

  return (
    <>
        <div className="flex items-center gap-4 mb-4">
            <h2 className="text-3xl font-bold tracking-tight">Profilo Operatore</h2>
        </div>
        <div className="grid gap-8">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <Avatar className="h-20 w-20">
                        <AvatarFallback className="text-3xl">{getAvatarFallback(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <CardTitle className="text-3xl">{user.name}</CardTitle>
                        <CardDescription className="text-lg">Codice: {user.code} | Luogo: {user.location}</CardDescription>
                    </div>
                     <div className="flex items-center gap-2">
                        <Label htmlFor="expected-hours" className="text-lg">Ore Previste:</Label>
                         <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleExpectedHoursChange(-1)}> <Minus className="h-4 w-4" /> </Button>
                            <span className="min-w-[40px] text-center font-bold text-xl">{user.expectedHours || 0}</span>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleExpectedHoursChange(1)}> <Plus className="h-4 w-4" /> </Button>
                        </div>
                     </div>
                </CardHeader>
            </Card>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Fingerprint /> Timbrature e Ore</CardTitle>
                    <CardDescription>Riepilogo dei turni di lavoro completati.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {shifts.length > 0 ? (
                        <div className="max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Lavorato</TableHead>
                                        <TableHead>Straordinario</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shifts.map(shift => {
                                        const duration = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
                                        const expectedMinutes = (user.expectedHours || 0) * 60;
                                        const overtimeMinutes = Math.max(0, duration.totalMinutes - expectedMinutes);
                                        const overtimeHours = `${String(Math.floor(overtimeMinutes / 60)).padStart(2, '0')}:${String(overtimeMinutes % 60).padStart(2, '0')}`;
                                        
                                        return (
                                            <TableRow key={shift.id}>
                                                <TableCell>{new Date(shift.startTime!).toLocaleDateString('it-IT')}</TableCell>
                                                <TableCell className="font-mono">{duration.worked}</TableCell>
                                                <TableCell className="font-mono font-bold text-primary">{overtimeMinutes > 0 ? overtimeHours : '-'}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            <p>Nessuna timbratura recente da mostrare.</p>
                        </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Briefcase /> Richieste Recenti</CardTitle>
                    <CardDescription>Ultime richieste di ferie e forniture.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <h3 className="font-semibold mb-2 flex items-center gap-2"><CheckCircle className="h-4 w-4"/>Ferie e Permessi</h3>
                     {leaveRequests.length > 0 ? (
                        <div className="max-h-40 overflow-y-auto mb-4 border rounded-md">
                           <Table>
                             <TableBody>
                                {leaveRequests.map(req => (
                                   <TableRow key={req.id}>
                                      <TableCell>{req.type} ({new Date(req.from).toLocaleDateString('it-IT')})</TableCell>
                                      <TableCell className="text-right"><Badge variant={req.status === 'Approvata' ? 'default' : req.status === 'Rifiutata' ? 'destructive' : 'secondary'}>{req.status}</Badge></TableCell>
                                   </TableRow>
                                ))}
                             </TableBody>
                           </Table>
                        </div>
                     ) : <p className="text-sm text-muted-foreground mb-4">Nessuna richiesta di ferie.</p>}

                     <h3 className="font-semibold mb-2 flex items-center gap-2"><Package className="h-4 w-4"/>Forniture</h3>
                     {supplyRequests.length > 0 ? (
                        <div className="max-h-40 overflow-y-auto border rounded-md">
                           <Table>
                              <TableBody>
                                {supplyRequests.map(req => (
                                   <TableRow key={req.id}>
                                      <TableCell>{Object.keys(req.items).join(', ')}</TableCell>
                                      <TableCell className="text-right"><Badge variant={req.status === 'Approvata' ? 'default' : req.status === 'Rifiutata' ? 'destructive' : 'secondary'}>{req.status}</Badge></TableCell>
                                   </TableRow>
                                ))}
                              </TableBody>
                           </Table>
                        </div>
                     ) : <p className="text-sm text-muted-foreground">Nessuna richiesta di forniture.</p>}
                  </CardContent>
                </Card>
              </div>
        </div>
    </>
  );
}
