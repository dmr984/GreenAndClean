'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Play, Square, History, Loader2, Eye, PauseCircle, BedDouble, Stethoscope, AlertCircle, Circle, Send, Briefcase, PlusCircle, Info, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useCollection, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, Timestamp, getDocs, doc, onSnapshot, writeBatch, updateDoc } from 'firebase/firestore';
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
import { isSameDay, startOfDay, endOfDay, getDay, isWithinInterval, subDays, set } from 'date-fns';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle } from '@/components/ui/responsive-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

type ClockingEvent = {
    id: string;
    userId: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    latitude?: number;
    longitude?: number;
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

type DailySchedule = {
    totalHours?: number;
    startTime?: string; // "HH:mm"
    endTime?: string; // "HH:mm"
    breakMinutes?: number;
};

type WorkSchedule = {
    [key in DayOfWeek]?: DailySchedule;
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
  firstName: string;
  lastName: string;
  role: 'admin' | 'operator';
};

interface OperatorDashboardProps {
  user: UserData | null;
}

type LeaveStatus = {
    onLeave: boolean;
    type: 'ferie' | 'malattia' | null;
}

type StraordinarioEvent = {
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    latitude?: number;
    longitude?: number;
}

type StraordinarioShift = {
    id?: string;
    events: StraordinarioEvent[];
    status: 'in_corso' | 'in_attesa_di_approvazione' | 'approvato' | 'rifiutato';
    date: Timestamp;
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
  
  const [isWorkDay, setIsWorkDay] = useState<boolean | null>(null);
  const [leaveStatus, setLeaveStatus] = useState<LeaveStatus>({ onLeave: false, type: null });

  const [hasUnreadShifts, setHasUnreadShifts] = useState(false);
  const [isShiftDetailsOpen, setIsShiftDetailsOpen] = useState(false);
  
  const [unlockRequestSent, setUnlockRequestSent] = useState(false);
  const [isSubmittingUnlock, setIsSubmittingUnlock] = useState(false);

  const [currentOvertimeShift, setCurrentOvertimeShift] = useState<StraordinarioShift | null>(null);

  const [canClockIn, setCanClockIn] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const { toast } = useToast();
  const firestore = useFirestore();
  
    useEffect(() => {
        if (!firestore || !authUser?.id) {
            setOperator(null);
            setIsWorkDay(null);
            return;
        }

        const operatorDocRef = doc(firestore, 'app-users', authUser.id);
        const unsubscribe = onSnapshot(operatorDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const operatorData = { id: docSnap.id, ...docSnap.data() } as Operator;
                setOperator(operatorData);
                
                const today = new Date();
                const dayName = dayIndexToName[getDay(today)];
                const contractualHours = operatorData.workSchedule?.[dayName]?.totalHours || 0;
                setIsWorkDay(contractualHours > 0);

            } else {
                setOperator(null);
                setIsWorkDay(false); 
            }
        });

        return () => unsubscribe();
    }, [firestore, authUser]);

     useEffect(() => {
        if (!firestore || !authUser?.id) return;

        const checkAndVoidOpenShifts = async () => {
            const yesterday = subDays(new Date(), 1);
            const startOfYesterday = startOfDay(yesterday);
            const endOfYesterday = endOfDay(yesterday);

            const q = query(
                collection(firestore, `app-users/${authUser.id}/timbrature`),
                where('timestamp', '>=', startOfYesterday),
                where('timestamp', '<=', endOfYesterday),
                orderBy('timestamp', 'desc')
            );
            
            const yesterdaySnapshot = await getDocs(q);
            if (yesterdaySnapshot.empty) return;

            const lastEvent = yesterdaySnapshot.docs[0].data() as ClockingEvent;
            
            if (lastEvent.type !== 'uscita') {
                // If the last event of yesterday was not a clock-out, void the shift.
                const voidClockOut: Omit<ClockingEvent, 'id'> = {
                    userId: authUser.id,
                    type: 'uscita',
                    timestamp: Timestamp.fromDate(endOfYesterday), // Set it to 23:59:59 of yesterday
                    latitude: 0,
                    longitude: 0,
                    status: 'rifiutata',
                    viewedByOperator: false,
                };
                
                try {
                    await addDoc(collection(firestore, `app-users/${authUser.id}/timbrature`), voidClockOut);
                    toast({
                        variant: 'destructive',
                        title: 'Turno Annullato Automaticamente',
                        description: 'Non hai timbrato l\'uscita ieri. Il turno è stato annullato.',
                        duration: 10000,
                    });
                } catch (error) {
                    console.error("Failed to void open shift:", error);
                }
            }
        };

        checkAndVoidOpenShifts();

    }, [firestore, authUser, toast]);

    useEffect(() => {
        if (!firestore || !authUser?.id) return;
        
        const overtimeQuery = query(
            collection(firestore, `app-users/${authUser.id}/straordinari`),
            where('date', '==', Timestamp.fromDate(startOfDay(new Date()))),
            where('status', '==', 'in_corso')
        );

        const unsubscribe = onSnapshot(overtimeQuery, (snapshot) => {
            if (!snapshot.empty) {
                const shiftDoc = snapshot.docs[0];
                setCurrentOvertimeShift({ id: shiftDoc.id, ...shiftDoc.data() } as StraordinarioShift);
            } else {
                setCurrentOvertimeShift(null);
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
  
    useEffect(() => {
        if (!firestore || !operator?.id) return;

        const requestsQuery = query(
            collection(firestore, `app-users/${operator.id}/requests`),
            where('status', 'in', ['approvato', 'in_attesa'])
        );
        
        const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
            const today = new Date();
            let onLeaveToday = false;
            let leaveType: LeaveStatus['type'] = null;
            let unlockRequestExists = false;

            snapshot.forEach(doc => {
                const request = doc.data();
                const startDate = request.startDate.toDate();
                const endDate = request.endDate.toDate();

                if (isWithinInterval(today, { start: startOfDay(startDate), end: endOfDay(endDate) })) {
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
        });

        return () => unsubscribe(); 
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

  useEffect(() => {
    if (isClockedIn || !operator || !isWorkDay) {
        setCanClockIn(true); // Always allow clocking out, or clocking in for overtime
        return;
    }
    const today = new Date();
    const dayName = dayIndexToName[getDay(today)];
    const shiftStartTimeStr = operator.workSchedule?.[dayName]?.startTime;

    if (!shiftStartTimeStr) {
        setCanClockIn(true); // If no start time is defined, can always clock in
        return;
    }

    const [hours, minutes] = shiftStartTimeStr.split(':').map(Number);
    const shiftStartTime = set(today, { hours, minutes, seconds: 0, milliseconds: 0 });
    const activationTime = new Date(shiftStartTime.getTime() - 90 * 60 * 1000); // 90 minutes before

    setCanClockIn(today >= activationTime);

    const interval = setInterval(() => {
        setCanClockIn(new Date() >= activationTime);
    }, 1000 * 30); // Check every 30 seconds

    return () => clearInterval(interval);
}, [operator, isWorkDay, isClockedIn]);

  
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

  const handleClocking = async (type: 'entrata' | 'uscita') => {
    if (!firestore || !operator || isProcessing) return;
    
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
    }
  }
  
  const formatTime = (date: Date | Timestamp | null) => {
    if (!date) return "--:--";
    const d = date instanceof Timestamp ? date.toDate() : date;
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
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
            description: "La tua richiesta di sblocco è stata inviata all'amministratore.",
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
  }, [isShiftDetailsOpen, firestore, operator, shifts, hasUnreadShifts]);
  
  const handleOvertimeClocking = async (type: 'entrata' | 'uscita') => {
        if (!firestore || !operator) return;
        
        try {
            const currentLoc = await getLocation();
            const newEvent: StraordinarioEvent = { 
                type, 
                timestamp: Timestamp.now(),
                latitude: currentLoc.latitude,
                longitude: currentLoc.longitude
            };

            let updatedShift: StraordinarioShift;

            if (currentOvertimeShift) {
                updatedShift = { ...currentOvertimeShift, events: [...currentOvertimeShift.events, newEvent] };
            } else {
                updatedShift = {
                    events: [newEvent],
                    status: 'in_corso',
                    date: Timestamp.fromDate(startOfDay(new Date())),
                };
            }

            if (type === 'uscita') {
                updatedShift.status = 'in_attesa_di_approvazione';
            }

            const collectionRef = collection(firestore, `app-users/${operator.id}/straordinari`);
            
            if (updatedShift.id) {
                const docRef = doc(collectionRef, updatedShift.id);
                await updateDoc(docRef, { events: updatedShift.events, status: updatedShift.status });
            } else {
                const docRef = await addDoc(collectionRef, updatedShift);
                updatedShift.id = docRef.id;
            }
            
            setCurrentOvertimeShift(updatedShift);
            
            if (updatedShift.status === 'in_attesa_di_approvazione') {
                toast({ title: "Turno Straordinario Inviato", description: "Il tuo turno è stato inviato per l'approvazione."});
                setCurrentOvertimeShift(null);
            }

        } catch (error: any) {
             toast({
                variant: 'destructive',
                title: 'Errore di Geolocalizzazione o Salvataggio',
                description: error.message || "Non è stato possibile registrare il turno straordinario.",
            });
        }
    };

  const renderLeaveCard = () => {
    const Icon = leaveStatus.type === 'ferie' ? BedDouble : Stethoscope;
    const leaveTypeText = leaveStatus.type === 'ferie' ? 'Ferie' : 'Malattia';

    return (
        <Card className="border-yellow-500 bg-yellow-500/10 text-center">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-center gap-3">
                    <Icon className="h-7 w-7 text-yellow-600" />
                    <CardTitle className="text-2xl text-yellow-700">Oggi sei in {leaveTypeText}</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-yellow-600">
                    Il sistema di timbratura è bloccato.
                </p>
                <p className="text-sm text-yellow-700/80 mt-4">
                  Se vuoi timbrare, annullerai il giorno di {leaveTypeText.toLowerCase()}. Fai la richiesta all'amministratore.
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

  const renderNonWorkDayCard = () => {
    return (
        <Card className="border-blue-500 bg-blue-500/10 text-center">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-center gap-3">
                    <Briefcase className="h-7 w-7 text-blue-600" />
                    <CardTitle className="text-2xl text-blue-700">Oggi non è un giorno lavorativo</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-blue-600">
                    Puoi registrare un turno di lavoro straordinario.
                </p>
            </CardContent>
             <CardFooter>
                <Button className="w-full" size="lg" onClick={() => handleOvertimeClocking('entrata')}>
                    <PlusCircle className="mr-2 h-5 w-5" /> Avvia Turno Straordinario
                </Button>
            </CardFooter>
        </Card>
    );
  }

    const renderOvertimeClockingInterface = () => {
        if (!currentOvertimeShift) return null;
        
        return (
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                        <Clock className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Gestione Turno Straordinario</CardTitle>
                         <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setIsHelpOpen(true)}>
                            <Info className="h-5 w-5" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-4">
                    <div className="text-7xl lg:text-8xl font-bold font-mono tracking-tight text-foreground">
                        {time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                    <Button className="w-full" size="lg" variant="destructive" onClick={() => handleOvertimeClocking('uscita')}>
                        <Square className="mr-2 h-5 w-5" /> Termina Turno Straordinario
                    </Button>
                </CardFooter>
            </Card>
        );
    };

  if (isUserLoading || operator === null || isWorkDay === null) {
      return <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Caricamento...</p>
          </div>
        </div>;
  }

  const renderClockingInterface = () => {
      if (currentOvertimeShift) {
          return renderOvertimeClockingInterface();
      }
      if (!isClockedIn && leaveStatus.onLeave) {
          return renderLeaveCard();
      }
      if (!isClockedIn && !isWorkDay) {
          return renderNonWorkDayCard();
      }
      return (
         <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl">Gestione Turno</CardTitle>
                <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setIsHelpOpen(true)}>
                    <Info className="h-5 w-5" />
                </Button>
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
                     <Button 
                        className="w-full" 
                        size="lg" 
                        variant="destructive"
                        disabled={isProcessing} 
                        onClick={() => handleClocking('uscita')}
                    >
                         {isProcessing ? <Loader2 className="animate-spin" /> : <Square className="mr-2 h-5 w-5"/>}
                         Termina Turno
                    </Button>
                ) : (
                    <Button 
                        className="w-full" 
                        size="lg"
                        disabled={isProcessing || !canClockIn} 
                        onClick={() => handleClocking('entrata')}
                        style={{backgroundColor: '#22c55e', color: 'white'}}
                    >
                        {isProcessing ? <Loader2 className="animate-spin" /> : <Play className="mr-2 h-5 w-5"/>}
                        Inizia Turno
                    </Button>
                )}
            </CardFooter>
          </Card>
      );
  }

  return (
    <>
    <div className="space-y-6">
       <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo</h2>
      </div>

       {renderClockingInterface()}
      
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

    <ResponsiveDialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
                <ResponsiveDialogTitle>Guida alla Gestione del Turno</ResponsiveDialogTitle>
                <ResponsiveDialogDescription>
                    Come utilizzare il sistema di timbratura in modo corretto.
                </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="py-4 pr-4 space-y-4 text-sm overflow-y-auto max-h-[60vh]">
                <div>
                    <h4 className="font-semibold mb-1">Inizio e Fine Turno</h4>
                    <p className="text-muted-foreground">
                        Usa i pulsanti per registrare la tua entrata e uscita. Questa azione registra anche la tua posizione per confermare la sede di lavoro.
                        <br/><br/>
                        <span className="font-bold">IMPORTANTE:</span> L'uso di questa funzione implica il consenso alla raccolta dei dati di geolocalizzazione (GPS) al solo scopo di verificare la posizione al momento della timbratura.
                    </p>
                </div>
                 <div>
                    <h4 className="font-semibold mb-1">Gestione delle Pause</h4>
                    <p className="text-muted-foreground">
                        Non devi timbrare l'inizio o la fine della pausa. La durata della pausa viene gestita dall'amministratore in fase di approvazione del turno, anche in base al tipo di contratto. Qualsiasi variazione sarà concordata con l'amministrazione e potrà essere soggetta a correzioni.
                    </p>
                </div>
                 <div>
                    <h4 className="font-semibold mb-1">Come vengono calcolate le ore</h4>
                    <p className="text-muted-foreground">
                        Il sistema arrotonda gli orari per calcolare le ore totali: le ore ordinarie scattano ogni mezz'ora, mentre le ore straordinarie vengono conteggiate ogni ora intera.
                    </p>
                </div>
                <div>
                    <h4 className="font-semibold mb-1">Turno Straordinario</h4>
                    <p className="text-muted-foreground">
                        Se oggi non è un tuo giorno lavorativo, vedrai il pulsante per avviare un turno straordinario, che ti permette di registrare ore di lavoro extra.
                    </p>
                </div>
                <div>
                    <h4 className="font-semibold mb-1">Stato delle Timbrature</h4>
                     <p className="text-muted-foreground">
                        Ogni timbratura viene inviata per l'approvazione. Nel riepilogo giornaliero, puoi vedere lo stato: <Badge variant="default" className="bg-yellow-500 text-white">sospesa</Badge>, <Badge variant="secondary">confermata</Badge>, o <Badge variant="destructive">rifiutata</Badge>.
                    </p>
                </div>
                 <div>
                    <h4 className="font-semibold mb-1">Timbratura Bloccata</h4>
                    <p className="text-muted-foreground">
                        Se sei in ferie o malattia, il sistema di timbratura sarà bloccato. Puoi inviare una <span className="font-bold">Richiesta di Sblocco</span> all'amministratore se hai bisogno di timbrare.
                    </p>
                </div>
            </div>
        </ResponsiveDialogContent>
    </ResponsiveDialog>
    </>
  );
}
