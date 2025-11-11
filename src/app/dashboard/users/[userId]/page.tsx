

'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, Package, Fingerprint, Briefcase, Plus, Minus, Clock, PauseCircle, Timer, AlarmClockOff, CalendarDays, Hourglass, TrendingUp, CalendarCheck, MapPin } from 'lucide-react';
import React, { useEffect, useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

type Geolocation = {
  latitude: number;
  longitude: number;
};

type User = {
  id: string;
  username: string;
  password?: string;
  location?: string;
  role: 'admin' | 'operator';
  expectedHours?: number;
};

type LeaveRequest = { id: string; user: string; type: string; from: string; to: string; timeFrom?: string; timeTo?: string; status: 'In attesa' | 'Approvata' | 'Rifiutata'; reason?: string };
type SupplyRequest = { id: string; user: string; items: { [key: string]: number }; status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale'; fulfilledItems?: { [key: string]: number }; };
type Pause = { 
  startTime: string; 
  endTime: string | null;
  startLocation?: Geolocation;
  endLocation?: Geolocation;
};
type Shift = { 
  id: string; 
  userId: string;
  startTime: string | null; 
  endTime: string | null; 
  startLocation?: Geolocation;
  endLocation?: Geolocation;
  pauses: Pause[];
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

const calculateDuration = (start: string | null, end: string | null, pauses: Pause[]) => {
    if (!start || !end) return { total: 'N/A', pause: 'N/A', worked: 'N/A', workedMinutes: 0 };

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    
    const pauseMillis = pauses
        .filter(p => p.endTime)
        .reduce((acc, p) => acc + (new Date(p.endTime!).getTime() - new Date(p.startTime).getTime()), 0);

    const workedMillis = endTime - startTime - pauseMillis;

    const format = (ms: number) => {
        if (ms < 0) ms = 0;
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };
    
    return {
        total: format(endTime - startTime),
        pause: format(pauseMillis),
        worked: format(workedMillis),
        workedMinutes: Math.floor(workedMillis / 60000),
    };
};

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case "Approvata": return "default";
        case "In attesa": return "secondary";
        case "Rifiutata": return "destructive";
        case "Parziale": return "outline";
        default: return "secondary";
    }
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
  const [supplyRequests, setSupplyRequests] = useState<SupplyRequest[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!firestore || !userId) return;

      setLoading(true);
      
      const userDocRef = doc(firestore, 'app-users', userId);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const foundUser = { id: userDoc.id, ...userDoc.data() } as User;
        setUser(foundUser);
        
        const allLeaves = getFromStorage<LeaveRequest[]>('leave-requests', []);
        setLeaveRequests(allLeaves.filter(r => r.user === foundUser.username).sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime()));

        const allSupplies = getFromStorage<SupplyRequest[]>('supply-requests', []);
        setSupplyRequests(allSupplies.filter(r => r.user === foundUser.username).sort((a,b) => b.id.localeCompare(a.id)));

        const allShifts = getFromStorage<Shift[]>('shifts', []);
        setShifts(allShifts.filter(s => s.userId === foundUser.id && s.endTime).sort((a,b) => new Date(b.startTime!).getTime() - new Date(a.startTime!).getTime()));
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    fetchUserData();
  }, [userId, firestore]);

  const summaryStats = useMemo(() => {
    if (!user) return null;

    // 1. Worked Days - Corrected Logic
    const workedDayDates = new Set(
        shifts
            .filter(s => s.startTime && s.endTime)
            .map(s => new Date(s.startTime!).toISOString().split('T')[0])
    );
    const workedDays = workedDayDates.size;

    // 2. Overtime
    const totalOvertimeMinutes = shifts.reduce((total, shift) => {
        const { workedMinutes } = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
        const expectedMinutes = (user.expectedHours || 0) * 60;
        const overtime = Math.max(0, workedMinutes - expectedMinutes);
        return total + overtime;
    }, 0);

    // 3. Vacation Days
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

    // 4. Permit Hours
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
  
  const LocationLink = ({ location }: { location?: Geolocation }) => {
    if (!location) return null;
    return (
      <a
        href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        <MapPin className="h-3 w-3" />
        <span>Vedi Mappa</span>
      </a>
    );
  };

  const StatCard = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) => (
    <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
        <div className="text-primary">{icon}</div>
        <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="font-bold text-lg">{value}</div>
        </div>
    </div>
  );

  return (
    <>
        <div className="flex items-center gap-4 mb-4">
            <h2 className="text-3xl font-bold tracking-tight">Profilo Operatore</h2>
        </div>
        <div className="grid gap-8">
            <Card>
                 <CardHeader className="flex flex-col xl:flex-row items-start gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-1">
                        <Avatar className="h-20 w-20">
                            <AvatarFallback className="text-3xl">{getAvatarFallback(user.username)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <CardTitle className="text-3xl">{user.username}</CardTitle>
                            <CardDescription className="text-base flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
                               <span>Password: {user.password}</span>
                               <span className="hidden sm:inline">|</span>
                               <span>Luogo: {user.location}</span>
                            </CardDescription>
                             <div className="flex items-center gap-2 mt-2">
                                <Label htmlFor="expected-hours" className="text-base shrink-0">Ore Previste:</Label>
                                 <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleExpectedHoursChange(-1)}> <Minus className="h-4 w-4" /> </Button>
                                    <span className="min-w-[32px] text-center font-bold text-lg">{user.expectedHours || 0}</span>
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleExpectedHoursChange(1)}> <Plus className="h-4 w-4" /> </Button>
                                </div>
                             </div>
                        </div>
                    </div>
                     {summaryStats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-2 gap-2 w-full xl:max-w-xs mt-4 xl:mt-0 p-2 border rounded-lg">
                            <StatCard icon={<CalendarDays className="h-6 w-6"/>} label="Giorni Lavorati" value={summaryStats.workedDays} />
                            <StatCard icon={<TrendingUp className="h-6 w-6"/>} label="Straordinari" value={summaryStats.overtime} />
                            <StatCard icon={<CalendarCheck className="h-6 w-6"/>} label="Giorni Ferie" value={summaryStats.vacationDays} />
                            <StatCard icon={<Hourglass className="h-6 w-6"/>} label="Ore Permesso" value={summaryStats.permitHours} />
                        </div>
                     )}
                </CardHeader>
            </Card>

            <Tabs defaultValue="shifts">
                 <TabsList className="flex flex-col md:flex-row h-auto w-full md:w-auto md:inline-flex">
                    <TabsTrigger value="shifts" className="w-full md:w-auto justify-start md:justify-center gap-2"><Fingerprint className="h-4 w-4"/>Timbrature</TabsTrigger>
                    <TabsTrigger value="leaves" className="w-full md:w-auto justify-start md:justify-center gap-2"><CheckCircle className="h-4 w-4"/>Ferie e Permessi</TabsTrigger>
                    <TabsTrigger value="supplies" className="w-full md:w-auto justify-start md:justify-center gap-2"><Package className="h-4 w-4"/>Richieste Forniture</TabsTrigger>
                </TabsList>

                <TabsContent value="shifts">
                    <Card>
                        <CardHeader>
                            <CardTitle>Storico Timbrature e Ore</CardTitle>
                            <CardDescription>Riepilogo dei turni di lavoro completati, con dettaglio ore e straordinari.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[500px] w-full">
                            {shifts.length > 0 ? (
                                <div className="space-y-4">
                                {shifts.map(shift => {
                                    const duration = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
                                    const expectedMinutes = (user.expectedHours || 0) * 60;
                                    const overtimeMinutes = Math.max(0, duration.workedMinutes - expectedMinutes);
                                    const overtimeHours = formatMinutesToHours(overtimeMinutes);
                                    
                                    return (
                                        <Card key={shift.id}>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-lg">{new Date(shift.startTime!).toLocaleDateString('it-IT', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                    <div className="flex items-center gap-2"><Clock className="text-primary"/> <span>Ingresso:</span></div>
                                                    <div className="font-mono text-right flex items-center justify-end gap-2">{new Date(shift.startTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})} <LocationLink location={shift.startLocation} /></div>
                                                    
                                                    <div className="flex items-center gap-2"><AlarmClockOff className="text-primary"/> <span>Uscita:</span></div>
                                                    <div className="font-mono text-right flex items-center justify-end gap-2">{new Date(shift.endTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})} <LocationLink location={shift.endLocation} /></div>
                                                </div>
                                                <hr/>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                    <div className="flex items-center gap-2 text-muted-foreground"><PauseCircle /> <span>Pause:</span></div>
                                                    <div className="font-mono text-right font-semibold text-muted-foreground">{duration.pause}</div>

                                                    <div className="flex items-center gap-2"><Briefcase/> <span>Ore Lavorate:</span></div>
                                                    <div className="font-mono text-right font-bold">{duration.worked}</div>
                                                    
                                                    <div className="flex items-center gap-2"><Timer /> <span>Straordinario:</span></div>
                                                    <div className={`font-mono text-right font-bold ${overtimeMinutes > 0 ? 'text-primary' : ''}`}>{overtimeMinutes > 0 ? overtimeHours : '-'}</div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )
                                })}
                                </div>
                            ) : (
                                <div className="text-center text-muted-foreground py-16">
                                    <p>Nessuna timbratura completata da mostrare.</p>
                                </div>
                            )}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
                 <TabsContent value="leaves">
                    <Card>
                        <CardHeader><CardTitle>Storico Richieste Ferie e Permessi</CardTitle></CardHeader>
                        <CardContent>
                             <ScrollArea className="h-[400px]">
                             {leaveRequests.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Periodo</TableHead>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead>Motivo</TableHead>
                                            <TableHead className="text-right">Stato</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                    {leaveRequests.map(req => {
                                        const fromDate = new Date(req.from).toLocaleDateString('it-IT');
                                        const toDate = new Date(req.to).toLocaleDateString('it-IT');
                                        let period = fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;
                                        if (req.type === 'Permesso' && req.timeFrom && req.timeTo) {
                                            period += ` (${req.timeFrom}-${req.timeTo})`;
                                        }
                                       return(
                                        <TableRow key={req.id}>
                                            <TableCell className="font-medium">{period}</TableCell>
                                            <TableCell>{req.type}</TableCell>
                                            <TableCell className="text-muted-foreground truncate max-w-xs">{req.reason || '-'}</TableCell>
                                            <TableCell className="text-right"><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></TableCell>
                                        </TableRow>
                                       )
                                    })}
                                    </TableBody>
                                </Table>
                             ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di ferie o permesso trovata.</p>}
                             </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>

                 <TabsContent value="supplies">
                    <Card>
                        <CardHeader><CardTitle>Storico Richieste Forniture</CardTitle></CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[400px]">
                            {supplyRequests.length > 0 ? (
                                <div className="space-y-4">
                                {supplyRequests.map(req => (
                                    <Card key={req.id}>
                                        <CardHeader className="flex flex-row justify-between items-center pb-3">
                                             <p className="font-semibold">Richiesta del {new Date().toLocaleDateString('it-IT')}</p>
                                             <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                                        </CardHeader>
                                        <CardContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Prodotto</TableHead>
                                                        <TableHead className="text-center">Qt. Richiesta</TableHead>
                                                        <TableHead className="text-center">Qt. Consegnata</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Object.entries(req.items).map(([name, qty]) => (
                                                        <TableRow key={name}>
                                                            <TableCell>{name}</TableCell>
                                                            <TableCell className="text-center">{qty}</TableCell>
                                                            <TableCell className="text-center font-bold">{req.fulfilledItems ? req.fulfilledItems[name] ?? 0 : '-'}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                ))}
                                </div>
                            ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di forniture trovata.</p>}
                           </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    </>
  );
}

    

