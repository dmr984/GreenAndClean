'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, Package, Briefcase, Plus, Minus, Clock, PauseCircle, Timer, AlarmClockOff, CalendarDays, Hourglass, TrendingUp, CalendarCheck, MapPin, Trash2 } from 'lucide-react';
import React, { useEffect, useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


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

const saveToStorage = <T,>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('storage'));
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

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedShiftToDelete, setSelectedShiftToDelete] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<'shifts' | 'leaves' | 'supplies'>('shifts');


  const fetchAllData = async () => {
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

  useEffect(() => {
    fetchAllData();
  }, [userId, firestore]);

  const summaryStats = useMemo(() => {
    if (!user) return null;

    const workedDayDates = new Set(
        shifts
            .filter(s => s.startTime && s.endTime)
            .map(s => new Date(s.startTime!).toISOString().split('T')[0])
    );
    const workedDays = workedDayDates.size;

    const totalOvertimeMinutes = shifts.reduce((total, shift) => {
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

  const openDeleteConfirmation = (shiftId: string) => {
    setSelectedShiftToDelete(shiftId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteShift = () => {
    if (!selectedShiftToDelete) return;
    const allShifts = getFromStorage<Shift[]>('shifts', []);
    const updatedShifts = allShifts.filter(s => s.id !== selectedShiftToDelete);
    saveToStorage('shifts', updatedShifts);
    setShifts(updatedShifts.filter(s => s.userId === userId && s.endTime)); // Update component state
    toast({ title: "Timbratura eliminata", description: "La timbratura è stata rimossa con successo.", variant: "destructive"});
    setIsDeleteDialogOpen(false);
    setSelectedShiftToDelete(null);
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
    <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
            <div className="text-muted-foreground">{icon}</div>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
  );

  const SectionButton = ({ icon, label, value, isActive, onClick }: { icon: React.ReactNode, label: string, value: 'shifts' | 'leaves' | 'supplies', isActive: boolean, onClick: () => void }) => (
    <Card 
        className={`text-center cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
        onClick={onClick}
    >
        <CardHeader>
            <div className={`mx-auto h-12 w-12 flex items-center justify-center rounded-lg ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-primary'}`}>
                {icon}
            </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
            <p className="font-semibold text-lg">{label}</p>
        </CardContent>
    </Card>
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
                  <div className="grid gap-4 sm:grid-cols-2">
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
                value="shifts" 
                icon={<Briefcase className="h-6 w-6"/>} 
                isActive={activeSection === 'shifts'} 
                onClick={() => setActiveSection('shifts')} 
            />
            <SectionButton 
                label="Ferie e Permessi" 
                value="leaves" 
                icon={<CheckCircle className="h-6 w-6"/>} 
                isActive={activeSection === 'leaves'} 
                onClick={() => setActiveSection('leaves')} 
            />
            <SectionButton 
                label="Richieste Forniture" 
                value="supplies" 
                icon={<Package className="h-6 w-6"/>} 
                isActive={activeSection === 'supplies'} 
                onClick={() => setActiveSection('supplies')} 
            />
        </div>

        <div>
            {activeSection === 'shifts' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Storico Timbrature e Ore</CardTitle>
                        <CardDescription>Riepilogo dei turni di lavoro completati, con dettaglio ore e straordinari.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[500px] w-full pr-4">
                        {shifts.length > 0 ? (
                            <div className="space-y-4">
                            {shifts.map(shift => {
                                const duration = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
                                const expectedMinutes = (user.expectedHours || 0) * 60;
                                const overtimeMinutes = Math.max(0, duration.workedMinutes - expectedMinutes);
                                const overtimeHours = formatMinutesToHours(overtimeMinutes);
                                
                                return (
                                    <Card key={shift.id} className="overflow-hidden">
                                        <CardHeader className="flex flex-row justify-between items-start bg-muted/30 p-4">
                                            <CardTitle className="text-lg">{new Date(shift.startTime!).toLocaleDateString('it-IT', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}</CardTitle>
                                            <Button variant="ghost" size="icon" onClick={() => openDeleteConfirmation(shift.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                <span className="sr-only">Elimina timbratura</span>
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="p-4">
                                         <div className="relative w-full overflow-x-auto">
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6 gap-2 text-sm min-w-[500px] py-2">
                                                <div className="flex items-center gap-2 font-medium shrink-0">
                                                    <div className="flex items-center gap-2"><Clock className="text-primary h-5 w-5"/>Ingresso:</div>
                                                    <div className="font-mono flex items-center gap-2">
                                                        <span>{new Date(shift.startTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}</span>
                                                        {shift.startLocation && (
                                                        <Link href={`https://www.google.com/maps/search/?api=1&query=${shift.startLocation.latitude},${shift.startLocation.longitude}`} target="_blank" rel="noopener noreferrer">
                                                            <MapPin className="h-4 w-4 text-blue-500 hover:text-blue-700" />
                                                        </Link>
                                                        )}
                                                    </div>
                                                </div>
                                                 <div className="flex items-center gap-2 font-medium shrink-0">
                                                    <div className="flex items-center gap-2"><AlarmClockOff className="text-primary h-5 w-5"/>Uscita:</div>
                                                    <div className="font-mono flex items-center gap-2">
                                                        <span>{new Date(shift.endTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}</span>
                                                        {shift.endLocation && (
                                                        <Link href={`https://www.google.com/maps/search/?api=1&query=${shift.endLocation.latitude},${shift.endLocation.longitude}`} target="_blank" rel="noopener noreferrer">
                                                            <MapPin className="h-4 w-4 text-blue-500 hover:text-blue-700" />
                                                        </Link>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <hr className="my-2"/>
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6 gap-2 text-sm min-w-[500px] py-2">
                                                <div className="flex items-center gap-2 text-muted-foreground shrink-0"><PauseCircle className="h-5 w-5"/>Pause: <span className="font-mono font-semibold text-foreground">{duration.pause}</span></div>
                                                <div className="flex items-center gap-2 font-medium shrink-0"><Briefcase className="h-5 w-5"/>Ore Lavorate: <span className="font-mono font-bold">{duration.worked}</span></div>
                                                <div className="flex items-center gap-2 font-medium shrink-0"><Timer className="h-5 w-5"/>Straordinario: <span className={`font-mono font-bold ${overtimeMinutes > 0 ? 'text-primary' : ''}`}>{overtimeMinutes > 0 ? overtimeHours : '-'}</span></div>
                                            </div>
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
            )}
             {activeSection === 'leaves' && (
                <Card>
                    <CardHeader><CardTitle>Storico Richieste Ferie e Permessi</CardTitle></CardHeader>
                    <CardContent>
                         <ScrollArea className="h-[400px]">
                         {leaveRequests.length > 0 ? (
                            <div className="relative w-full overflow-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Periodo</th>
                                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tipo</th>
                                            <th className="px-4 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Motivo</th>
                                            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Stato</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                    {leaveRequests.map(req => {
                                        const fromDate = new Date(req.from).toLocaleDateString('it-IT');
                                        const toDate = new Date(req.to).toLocaleDateString('it-IT');
                                        let period = fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;
                                        if (req.type === 'Permesso' && req.timeFrom && req.timeTo) {
                                            period += ` (${req.timeFrom}-${req.timeTo})`;
                                        }
                                    return(
                                        <tr key={req.id} className="border-b">
                                            <td className="p-4 align-middle font-medium">{period}</td>
                                            <td className="p-4 align-middle">{req.type}</td>
                                            <td className="p-4 align-middle text-muted-foreground truncate max-w-xs hidden sm:table-cell">{req.reason || '-'}</td>
                                            <td className="p-4 align-middle text-right"><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></td>
                                        </tr>
                                    )
                                    })}
                                    </tbody>
                                </table>
                            </div>
                         ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di ferie o permesso trovata.</p>}
                         </ScrollArea>
                    </CardContent>
                </Card>
            )}

             {activeSection === 'supplies' && (
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
                                        <div className="relative w-full overflow-auto">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b">
                                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Prodotto</th>
                                                        <th className="px-4 py-2 text-center font-medium text-muted-foreground">Qt. Richiesta</th>
                                                        <th className="px-4 py-2 text-center font-medium text-muted-foreground">Qt. Consegnata</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Object.entries(req.items).map(([name, qty]) => (
                                                        <tr key={name} className="border-b">
                                                            <td className="p-4 align-middle">{name}</td>
                                                            <td className="p-4 align-middle text-center">{qty}</td>
                                                            <td className="p-4 align-middle text-center font-bold">{req.fulfilledItems ? req.fulfilledItems[name] ?? 0 : '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            </div>
                        ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di forniture trovata.</p>}
                       </ScrollArea>
                    </CardContent>
                </Card>
            )}
        </div>
        

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione non può essere annullata. La timbratura verrà eliminata in modo permanente.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setSelectedShiftToDelete(null)}>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteShift}>Conferma Eliminazione</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
