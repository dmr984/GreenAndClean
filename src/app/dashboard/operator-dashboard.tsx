'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Play, Square, History, Loader2, Eye, PauseCircle, BedDouble, Stethoscope, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useCollection, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, Timestamp, getDocs, doc, onSnapshot } from 'firebase/firestore';
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
    status: 'sospesa' | 'confermata';
};

type Shift = {
    startTime: Timestamp;
    endTime: Timestamp | null;
    events: ClockingEvent[];
    workDuration?: string;
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
  
  // Check for leave
    useEffect(() => {
        if (!firestore || !operator?.id) return;

        const checkLeaveStatus = async () => {
            const today = new Date();
            const requestsQuery = query(
                collection(firestore, `app-users/${operator.id}/requests`)
            );
            
            const snapshot = await getDocs(requestsQuery);
            let onLeaveToday = false;
            let leaveType: LeaveStatus['type'] = null;

            snapshot.forEach(doc => {
                const request = doc.data();
                 if (request.status !== 'approvato') return;

                const startDate = request.startDate.toDate();
                const endDate = request.endDate.toDate();

                if (isSameDay(today, startDate) || isSameDay(today, endDate) || (today > startDate && today < endDate)) {
                    if(request.type === 'ferie' || request.type === 'malattia') {
                      onLeaveToday = true;
                      leaveType = request.type;
                    }
                }
            });
            setLeaveStatus({ onLeave: onLeaveToday, type: leaveType });
        };
        checkLeaveStatus();
    }, [firestore, operator]);


  const { data: clockings, isLoading: isLoadingClockings } = useCollection<ClockingEvent>(clockingsQuery);

  const shifts = useMemo((): Shift[] => {
    if (!clockings) return [];

    const groupedShifts: Shift[] = [];
    let currentShift: Partial<Shift> = {};

    for (const event of clockings) {
        if (event.type === 'entrata') {
            if (currentShift.startTime) {
                groupedShifts.push({
                    startTime: currentShift.startTime,
                    endTime: null,
                    events: currentShift.events || []
                });
            }
            currentShift = { startTime: event.timestamp, events: [event] };
        } else if (currentShift.startTime) {
            currentShift.events?.push(event);
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
            events: currentShift.events || []
        });
    }

    return groupedShifts.reverse();
  }, [clockings]);


  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (clockings && clockings.length > 0) {
      const lastEvent = clockings[clockings.length - 1];
      if (lastEvent.type === 'entrata' || lastEvent.type === 'fine_pausa') {
        setIsClockedIn(true);
        setIsOnBreak(false);
      } else if (lastEvent.type === 'pausa') {
        setIsClockedIn(true);
        setIsOnBreak(true);
      } else if (lastEvent.type === 'uscita') {
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
    if (!firestore || !operator || isProcessing || leaveStatus.onLeave) return;
    
    if (type === 'entrata') {
        const today = new Date();
        const dayName = dayIndexToName[getDay(today)];
        const contractualHours = operator.workSchedule?.[dayName] || 0;
        if (contractualHours <= 0) {
            // Check if user has already confirmed through the dialog
            // We use a state flag to avoid showing the dialog again if they confirm
            setIsNonWorkDayConfirmOpen(true);
            return;
        }
    }

    // This part of the code will now only run if it's a workday,
    // or if the user confirms the dialog for a non-workday
    await proceedWithClocking(type);
  };
  
  const proceedWithClocking = async (type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita') => {
      if (!firestore || !operator) return;

      setIsNonWorkDayConfirmOpen(false); // Close dialog if it was open

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
        };
        
        addDoc(timbraturaRef, newTimbratura)
            .then(() => {
                toast({
                    title: "Successo!",
                    description: `Timbratura di ${type.replace('_', ' ')} registrata correttamente.`,
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
    }
  }
  
  const formatTime = (date: Date | Timestamp | null) => {
    if (!date) return "--:--";
    const d = date instanceof Timestamp ? date.toDate() : date;
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  
  const handleBreakToggle = (isToggled: boolean) => {
      proceedWithClocking(isToggled ? 'pausa' : 'fine_pausa');
  }
  
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
                    Oggi sei in {leaveStatus.type}. Non è possibile timbrare.
                </p>
            </CardContent>
        </Card>
    );
  }

  if (isUserLoading || !operator) {
      return <div className="flex items-center justify-center h-full">Caricamento utente...</div>;
  }

  return (
    <>
    <div className="space-y-6">
       <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo</h2>
      </div>

       { leaveStatus.onLeave ? renderLeaveCard() : (
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
                        onClick={() => proceedWithClocking('uscita')}
                    >
                         {isProcessing ? <Loader2 className="animate-spin" /> : <Square className="mr-2 h-5 w-5"/>}
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
                    {isProcessing ? <Loader2 className="animate-spin" /> : <Play className="mr-2 h-5 w-5"/>}
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
          </div>
        </CardHeader>
        <CardContent>
           {isLoadingClockings ? (
             <div className="flex justify-center items-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
           ) : shifts && shifts.length > 0 ? (
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
                                <TableCell className="text-right">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <Eye className="h-4 w-4"/>
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Dettaglio Timbrature</DialogTitle>
                                                <DialogDescription>
                                                   Eventi per il turno iniziato alle {formatTime(shift.startTime)}.
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
                                                        {shift.events.map(e => (
                                                             <TableRow key={e.id}>
                                                                <TableCell className="font-medium">{formatTime(e.timestamp)}</TableCell>
                                                                <TableCell className="capitalize">{e.type.replace('_', ' ')}</TableCell>
                                                                <TableCell>
                                                                    <Badge variant={e.status === 'confermata' ? 'secondary' : 'default'}>
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
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
             </div>
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
                    <AlertDialogTitle>Giorno non lavorativo</AlertDialogTitle>
                </div>
                <AlertDialogDescription>
                    Questo non è un giorno lavorativo assegnato. Vuoi davvero timbrare?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setIsProcessing(false)}>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => proceedWithClocking('entrata')}>Conferma</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
