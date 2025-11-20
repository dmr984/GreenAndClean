'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Play, Square, History, Loader2, Eye, PauseCircle, BedDouble, Stethoscope, AlertCircle, Circle, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useCollection, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, Timestamp, getDocs, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useUser } from '@/hooks/use-user';
import { isSameDay, startOfDay, endOfDay, getDay } from 'date-fns';

type ClockingEvent = {
    id: string;
    userId: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    latitude: number;
    longitude: number;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    viewedByOperator?: boolean;
};

type Shift = {
    startTime: Timestamp;
    endTime: Timestamp | null;
    events: ClockingEvent[];
    workDuration?: string;
    hasUnread?: boolean;
};

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
};

type Operator = {
    id: string;
    username: string;
    role: 'admin' | 'operator';
    workSchedule?: WorkSchedule;
};

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

interface OperatorDashboardProps {
  user: UserData | null; // This prop is now coming from the layout, but we will transition to the hook
}

type LeaveStatus = {
    onLeave: boolean;
    type: 'ferie' | 'malattia' | null;
}

export function OperatorDashboard({ user: propUser }: OperatorDashboardProps) {
  const { user: hookUser, isLoading: isUserLoading } = useUser();
  const authUser = propUser || hookUser;

  const [operator, setOperator] = useState<Operator | null>(null);
  const [time, setTime] = useState(new Date());
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [leaveStatus, setLeaveStatus] = useState<LeaveStatus>({ onLeave: false, type: null });
  const [isNonWorkDayConfirmOpen, setIsNonWorkDayConfirmOpen] = useState(false);
  const [hasUnreadShifts, setHasUnreadShifts] = useState(false);
  const [isShiftDetailsOpen, setIsShiftDetailsOpen] = useState(false);
  const [clockingTypeToConfirm, setClockingTypeToConfirm] = useState<'entrata' | 'uscita' | 'pausa' | 'fine_pausa' | null>(null);
  const [unlockRequestSent, setUnlockRequestSent] = useState(false);
  const [isSubmittingUnlock, setIsSubmittingUnlock] = useState(false);

  const { toast } = useToast();
  const firestore = useFirestore();
  
  // Fetch full operator data including workSchedule
    useEffect(() => {
        if (!firestore || !authUser?.id) {
            setOperator(null);
            return;
        }

        const operatorDocRef = doc(firestore, 'app-users', authUser.id);
        const unsubscribe = onSnapshot(operatorDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            } else {
                setOperator(null);
            }
        });

        return () => unsubscribe();
    }, [firestore, authUser]);

  const { todayTimestamp, tomorrowTimestamp } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = Timestamp.fromDate(today);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTs = Timestamp.fromDate(tomorrow);
    
    return { todayTimestamp: todayTs, tomorrowTimestamp: tomorrowTs };
  }, []);

  const clockingsQuery = useMemoFirebase(() => {
    if (!firestore || !operator?.id) return null;
    
    return query(
      collection(firestore, `app-users/${operator.id}/timbrature`),
      where('timestamp', '>=', todayTimestamp),
      where('timestamp', '<', tomorrowTimestamp),
      orderBy('timestamp', 'asc')
    );
  }, [firestore, operator, todayTimestamp, tomorrowTimestamp]);
  
  // Check for leave and unlock requests
    useEffect(() => {
        if (!firestore || !operator?.id) return;

        const checkLeaveAndUnlockStatus = async () => {
            const today = new Date();
            const startOfToday = startOfDay(today);
            const endOfToday = endOfDay(today);
            
            const requestsQuery = query(
                collection(firestore, `app-users/${operator.id}/requests`),
                where('status', 'in', ['approvato', 'in_attesa'])
            );
            
            const snapshot = await getDocs(requestsQuery);
            let onLeaveToday = false;
            let leaveType: LeaveStatus['type'] = null;
            let unlockRequestExists = false;

            snapshot.forEach(doc => {
                const request = doc.data();
                const startDate = request.startDate.toDate();
                const endDate = request.endDate.toDate();

                if (isWithinInterval(today, { start: startDate, end: endDate })) {
                    if (request.type === 'ferie' || request.type === 'malattia') {
                      onLeaveToday = true;
                      leaveType = request.type;
                    }
                    if (request.type === 'sblocco_timbratura' && request.status === 'in_attesa') {
                       unlockRequestExists = true;
                    }
                }
            });
            setLeaveStatus({ onLeave: onLeaveToday, type: leaveType });
            setUnlockRequestSent(unlockRequestExists);
        };
        checkLeaveAndUnlockStatus();
    }, [firestore, operator]);


  const { data: clockings, isLoading: isLoadingClockings } = useCollection<ClockingEvent>(clockingsQuery);

  const shifts = useMemo((): Shift[] => {
    if (!clockings) return [];

    let unread = false;
    const groupedShifts: Shift[] = [];
    let currentShift: Partial<Shift> & { hasUnread?: boolean } = {};
    const validEvents = clockings.filter(e => e.status !== 'rifiutata');

    for (const event of validEvents) {
        if (event.type === 'entrata') {
            if (currentShift.startTime) {
                groupedShifts.push({
                    startTime: currentShift.startTime,
                    endTime: null,
                    events: currentShift.events || [],
                    hasUnread: currentShift.hasUnread || false,
                });
            }
            currentShift = { startTime: event.timestamp, events: [event], hasUnread: event.viewedByOperator === false };
        } else if (currentShift.startTime) {
            currentShift.events?.push(event);
            if (event.viewedByOperator === false) {
                currentShift.hasUnread = true;
            }
            if (event.type === 'uscita') {
                currentShift.endTime = event.timestamp;
                
                let totalWorkMillis = currentShift.endTime.toMillis() - currentShift.startTime.toMillis();
                let currentBreakStart: Timestamp | null = null;
                
                for(const ev of currentShift.events) {
                    if (ev.type === 'pausa') {
                        currentBreakStart = ev.timestamp;
                    } else if (ev.type === 'fine_pausa' && currentBreakStart) {
                        totalWorkMillis -= (ev.timestamp.toMillis() - currentBreakStart.toMillis());
                        currentBreakStart = null;
                    }
                }
                
                const hours = Math.floor(totalWorkMillis / (1000 * 60 * 60));
                const minutes = Math.floor((totalWorkMillis % (1000 * 60 * 60)) / (1000 * 60));
                currentShift.workDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                
                groupedShifts.push(currentShift as Shift);
                currentShift = {};
            }
        }
    }
    
    if (currentShift.startTime) {
        groupedShifts.push({
            startTime: currentShift.startTime,
            endTime: null,
            events: currentShift.events || [],
            hasUnread: currentShift.hasUnread || false,
        });
    }

    setHasUnreadShifts(groupedShifts.some(s => s.hasUnread));
    return groupedShifts.reverse();
  }, [clockings]);


  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (clockings && clockings.length > 0) {
      const lastValidEvent = [...clockings].filter(e => e.status !== 'rifiutata').pop();
      if (!lastValidEvent) {
          setIsClockedIn(false);
          setIsOnBreak(false);
          return;
      }
      if (lastValidEvent.type === 'entrata' || lastValidEvent.type === 'fine_pausa') {
        setIsClockedIn(true);
        setIsOnBreak(false);
      } else if (lastValidEvent.type === 'pausa') {
        setIsClockedIn(true);
        setIsOnBreak(true);
      } else if (lastValidEvent.type === 'uscita') {
        setIsClockedIn(false);
        setIsOnBreak(false);
      }
    } else {
       setIsClockedIn(false);
       setIsOnBreak(false);
    }
  }, [clockings]);
  
  const getLocation = (): Promise<{ latitude: number, longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("La geolocalizzazione non è supportata da questo browser."));
        return;
      }
      
      setIsProcessing(true);
      setLocationError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsProcessing(false);
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          resolve(coords);
        },
        (error) => {
          setIsProcessing(false);
          let message = "Impossibile ottenere la posizione.";
          switch(error.code) {
              case error.PERMISSION_DENIED:
                  message = "Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni del browser.";
                  break;
              case error.POSITION_UNAVAILABLE:
                  message = "Informazioni sulla posizione non disponibili.";
                  break;
              case error.TIMEOUT:
                  message = "La richiesta di geolocalizzazione è scaduta.";
                  break;
          }
          setLocationError(message);
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleClocking = async (type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita') => {
    if (!firestore || !operator || isProcessing) return;
    
    setClockingTypeToConfirm(type);

    if (type === 'entrata') {
        const today = new Date();
        const dayName = dayIndexToName[getDay(today)];
        const contractualHours = operator.workSchedule?.[dayName] || 0;
        
        if (contractualHours <= 0) {
            setIsNonWorkDayConfirmOpen(true);
            return;
        }
    }

    await proceedWithClocking(type);
  };
  
  const proceedWithClocking = async (type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita' | null) => {
      if (!firestore || !operator || !type) return;

      setIsNonWorkDayConfirmOpen(false);

      try {
        const currentLoc = await getLocation();
        
        const timbraturaRef = collection(firestore, `app-users/${operator.id}/timbrature`);
        const newTimbratura = {
            userId: operator.id,
            type,
            timestamp: serverTimestamp(),
            status: 'sospesa' as const,
            latitude: currentLoc.latitude,
            longitude: currentLoc.longitude,
            viewedByOperator: true,
        };
        
        addDoc(timbraturaRef, newTimbratura)
            .then(() => {
                toast({
                    title: "Successo!",
                    description: `Timbratura di ${type.replace('_', ' ')} registrata correttamente. In attesa di approvazione.`,
                });
            })
            .catch(err => {
                if (err.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'create',
                        path: timbraturaRef.path,
                        requestResourceData: newTimbratura
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'Errore di Timbratura',
                        description: "Non è stato possibile registrare la timbratura.",
                    });
                }
            });

    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Errore di Geolocalizzazione',
            description: error.message || "Non è stato possibile ottenere la posizione.",
        });
    } finally {
        setIsProcessing(false);
        setClockingTypeToConfirm(null);
    }
  }
  
  const formatTime = (date: Date | Timestamp | null) => {
    if (!date) return "--:--";
    const d = date instanceof Timestamp ? date.toDate() : date;
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  
  const handleBreakToggle = (isToggled: boolean) => {
      handleClocking(isToggled ? 'pausa' : 'fine_pausa');
  }

  const handleUnlockRequest = async () => {
    if (!firestore || !operator) return;

    setIsSubmittingUnlock(true);
    const today = new Date();
    const unlockRequestData = {
        userId: operator.id,
        type: 'sblocco_timbratura' as const,
        status: 'in_attesa' as const,
        startDate: Timestamp.fromDate(startOfDay(today)),
        endDate: Timestamp.fromDate(endOfDay(today)),
        createdAt: serverTimestamp(),
        viewedByOperator: true,
    };
    
    const requestsCollection = collection(firestore, `app-users/${operator.id}/requests`);
    
    try {
        await addDoc(requestsCollection, unlockRequestData);
        toast({
            title: 'Richiesta Inviata',
            description: 'La tua richiesta di sblocco è stata inviata all\'amministratore.',
        });
        setUnlockRequestSent(true);
    } catch (error: any) {
         if (error.code === 'permission-denied') {
            const contextualError = new FirestorePermissionError({
                operation: 'create',
                path: requestsCollection.path,
                requestResourceData: unlockRequestData
            });
            errorEmitter.emit('permission-error', contextualError);
        } else {
            toast({
                title: 'Errore',
                description: 'Impossibile inviare la richiesta di sblocco.',
                variant: 'destructive',
            });
        }
    } finally {
        setIsSubmittingUnlock(false);
    }
  };

  const markShiftsAsRead = async () => {
    if (!firestore || !operator?.id || !hasUnreadShifts) return;

    const unreadEvents = shifts.flatMap(s => s.events).filter(e => e.viewedByOperator === false);
    if (unreadEvents.length === 0) return;

    const batch = writeBatch(firestore);
    unreadEvents.forEach(event => {
      const eventRef = doc(firestore, `app-users/${operator.id}/timbrature`, event.id);
      batch.update(eventRef, { viewedByOperator: true });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("Error marking shifts as read:", error);
    }
  };

  useEffect(() => {
    if (isShiftDetailsOpen) {
      markShiftsAsRead();
    }
  }, [isShiftDetailsOpen]);
  
  const renderLeaveCard = () => {
    const Icon = leaveStatus.type === 'ferie' ? BedDouble : Stethoscope;
    return (
        <Card className="border-yellow-500 bg-yellow-500/10">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                    <Icon className="h-6 w-6 text-yellow-600" />
                    <CardTitle className="text-2xl text-yellow-700 capitalize">In {leaveStatus.type}</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-yellow-600 text-center">
                    Oggi sei in {leaveStatus.type}. Il sistema di timbratura è bloccato.
                </p>
            </CardContent>
             <CardFooter>
                 <Button 
                    className="w-full" 
                    size="lg"
                    disabled={unlockRequestSent || isSubmittingUnlock} 
                    onClick={handleUnlockRequest}
                >
                    {isSubmittingUnlock ? <Loader2 className="animate-spin" /> : <Send className="mr-2 h-5 w-5"/>}
                    {unlockRequestSent ? 'Richiesta Inviata' : 'Richiedi Sblocco Timbratura'}
                </Button>
            </CardFooter>
        </Card>
    );
  }

  if (isUserLoading || !operator) {
      return <div className="flex items-center justify-center h-full">Caricamento utente...</div>;
  }
  
  const getAlertDialogDescription = () => {
    return "Questo non è un giorno lavorativo assegnato. Vuoi davvero timbrare?"
  }


  return (
    <>
    <div className="space-y-6">
       <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo</h2>
      </div>

       { leaveStatus.onLeave && !isClockedIn ? renderLeaveCard() : (
       <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Gestione Turno</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-4">
          <div className="text-7xl lg:text-8xl font-bold font-mono tracking-tight text-foreground">
            {time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {locationError && <p className="text-sm text-destructive text-center">{locationError}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
             {isClockedIn ? (
                <>
                    <Button 
                        className="w-full" 
                        size="lg" 
                        variant="destructive"
                        disabled={isProcessing || isOnBreak} 
                        onClick={() => handleClocking('uscita')}
                    >
                         {isProcessing && clockingTypeToConfirm === 'uscita' ? <Loader2 className="animate-spin" /> : <Square className="mr-2 h-5 w-5"/>}
                         Termina Turno
                    </Button>
                    <div className="flex items-center space-x-2 justify-center pt-2">
                        <PauseCircle className="h-5 w-5 text-muted-foreground"/>
                        <Label htmlFor="break-toggle" className={isOnBreak ? 'text-primary font-bold' : 'text-muted-foreground'}>Pausa</Label>
                        <Switch 
                            id="break-toggle" 
                            checked={isOnBreak}
                            onCheckedChange={handleBreakToggle}
                            disabled={isProcessing}
                        />
                    </div>
                </>
            ) : (
                <Button 
                    className="w-full" 
                    size="lg"
                    disabled={isProcessing} 
                    onClick={() => handleClocking('entrata')}
                    style={{backgroundColor: '#22c55e', color: 'white'}}
                >
                    {isProcessing && clockingTypeToConfirm === 'entrata' ? <Loader2 className="animate-spin" /> : <Play className="mr-2 h-5 w-5"/>}
                    Inizia Turno
                </Button>
            )}
        </CardFooter>
      </Card>
      )}
      
      <Card>
        <CardHeader>
           <div className="flex items-center gap-3">
            <History className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Riepilogo Turni di Oggi</CardTitle>
             {hasUnreadShifts && <Circle fill="red" className="h-3 w-3 text-red-500" />}
          </div>
        </CardHeader>
        <CardContent>
           {isLoadingClockings ? (
             <div className="flex justify-center items-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
           ) : shifts && shifts.length > 0 ? (
             <Dialog open={isShiftDetailsOpen} onOpenChange={setIsShiftDetailsOpen}>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Inizio</TableHead>
                                <TableHead>Fine</TableHead>
                                <TableHead>Durata Lavoro</TableHead>
                                <TableHead className="text-right">Dettagli</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shifts.map((shift, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{formatTime(shift.startTime)}</TableCell>
                                    <TableCell>{shift.endTime ? formatTime(shift.endTime) : <Badge variant="secondary">In corso</Badge>}</TableCell>
                                    <TableCell>{shift.workDuration || '--:--'}</TableCell>
                                    <TableCell className="text-right relative">
                                        {shift.hasUnread && <div className="absolute right-9 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-red-500"></div>}
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <Eye className="h-4 w-4"/>
                                            </Button>
                                        </DialogTrigger>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                 <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Dettaglio Timbrature</DialogTitle>
                        <DialogDescription>
                            Eventi per i turni di oggi.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="border rounded-md max-h-96 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Orario</TableHead>
                                    <TableHead>Evento</TableHead>
                                    <TableHead>Stato</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {shifts.flatMap(s => s.events).map(e => (
                                        <TableRow key={e.id}>
                                        <TableCell className="font-medium">{formatTime(e.timestamp)}</TableCell>
                                        <TableCell className="capitalize">{e.type.replace('_', ' ')}</TableCell>
                                        <TableCell>
                                            <Badge variant={e.status === 'confermata' ? 'secondary' : e.status === 'rifiutata' ? 'destructive' : 'default'}>
                                                {e.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>
           ) : (
             <p className="text-muted-foreground text-center">Nessun turno registrato per oggi.</p>
           )}
        </CardContent>
      </Card>
    </div>
    <AlertDialog open={isNonWorkDayConfirmOpen} onOpenChange={setIsNonWorkDayConfirmOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <div className='flex items-center gap-2'>
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                    <AlertDialogTitle>Timbratura in Giorno Non Lavorativo</AlertDialogTitle>
                </div>
                <AlertDialogDescription>
                   {getAlertDialogDescription()}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => { setIsProcessing(false); setClockingTypeToConfirm(null); }}>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => proceedWithClocking(clockingTypeToConfirm)}>Conferma</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
