"use client";

import { useState, useEffect } from "react";
import { Clock, LogIn, LogOut, Coffee, Play, MapPin, LoaderCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, setDoc } from "firebase/firestore";

type Geolocation = {
  latitude: number;
  longitude: number;
};

export type Pause = {
  startTime: string;
  endTime: string | null;
  startLocation?: Geolocation;
  endLocation?: Geolocation;
}

export type Shift = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  startLocation?: Geolocation;
  endLocation?: Geolocation;
  pauses: Pause[];
  status: 'In attesa' | 'Approvato';
};

type ExtraShiftRequest = {
    id: string;
    userId: string;
    userName: string;
    date: string;
    status: 'pending' | 'approved';
}

interface ClockWidgetProps {
  userId: string;
  userName: string;
}

export function ClockWidget({ userId, userName }: ClockWidgetProps) {
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [isOnPause, setIsOnPause] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const [lastActionTime, setLastActionTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [needsExtraShiftApproval, setNeedsExtraShiftApproval] = useState(false);
  const [extraShiftRequestStatus, setExtraShiftRequestStatus] = useState<'not_requested' | 'pending' | 'approved'>('not_requested');


  // Effect for the live clock
  useEffect(() => {
    const timer = setInterval(() => {
        setCurrentTime(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    }, 1000); // Update every second

    return () => clearInterval(timer); // Cleanup
  }, []);

  // Load active shift and check status on component mount and storage change
  useEffect(() => {
    if (!firestore || !userId) return;

    const todayString = new Date().toISOString().split('T')[0];

    // Listen to all shifts for the user
    const shiftsQuery = query(collection(firestore, 'shifts'), where('userId', '==', userId));
    const shiftsUnsub = onSnapshot(shiftsQuery, (snapshot) => {
        const shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift));
        const currentActiveShift = shifts.find(s => s.startTime && !s.endTime) || null;
        setActiveShift(currentActiveShift);

        if (currentActiveShift) {
            const activePause = currentActiveShift.pauses.find(p => p.startTime && !p.endTime);
            setIsOnPause(!!activePause);
            if (activePause) {
                setLastActionTime(new Date(activePause.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' }));
            } else if (currentActiveShift.startTime) {
                setLastActionTime(new Date(currentActiveShift.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' }));
            }
        } else {
            const hasCompletedShiftToday = shifts.some(s => s.date === todayString && s.endTime);
            setNeedsExtraShiftApproval(hasCompletedShiftToday);
            setLastActionTime(null);
        }
    });

    // Listen to extra shift requests for today
    const extraShiftQuery = query(collection(firestore, 'extra-shift-requests'), where('userId', '==', userId), where('date', '==', todayString));
    const extraShiftUnsub = onSnapshot(extraShiftQuery, (snapshot) => {
        if (!snapshot.empty) {
            const todaysRequest = snapshot.docs[0].data() as ExtraShiftRequest;
            setExtraShiftRequestStatus(todaysRequest.status);
        } else {
            setExtraShiftRequestStatus('not_requested');
        }
    });

    return () => {
        shiftsUnsub();
        extraShiftUnsub();
    }
  }, [firestore, userId]);

  const getCurrentPosition = (): Promise<Geolocation> => {
    setIsGettingLocation(true);
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        setIsGettingLocation(false);
        return reject(new Error("La geolocalizzazione non è supportata dal tuo browser."));
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsGettingLocation(false);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          setIsGettingLocation(false);
          let message = "Impossibile ottenere la posizione.";
          switch(error.code) {
            case error.PERMISSION_DENIED:
              message = "Hai negato il permesso per la geolocalizzazione.";
              break;
            case error.POSITION_UNAVAILABLE:
              message = "Informazioni sulla posizione non disponibili.";
              break;
            case error.TIMEOUT:
              message = "La richiesta di geolocalizzazione è scaduta.";
              break;
          }
          return reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleClockIn = async () => {
    if (needsExtraShiftApproval && extraShiftRequestStatus !== 'approved') {
        toast({ title: "Approvazione richiesta", description: "Hai già un turno completato oggi. Devi richiedere l'approvazione per una nuova timbratura.", variant: "destructive" });
        return;
    }
    
    if (!firestore) return;

    try {
        const location = await getCurrentPosition();
        const now = new Date();
        const newShift = {
            userId: userId,
            userName: userName,
            date: now.toISOString().split('T')[0],
            startTime: now.toISOString(),
            endTime: null,
            startLocation: location,
            pauses: [],
            status: 'In attesa' as const,
        };
        await addDoc(collection(firestore, 'shifts'), newShift);
        setNeedsExtraShiftApproval(false); // Reset check after successful clock-in
        toast({
            title: "Inizio Turno",
            description: `Hai timbrato l'entrata alle ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' })}.`,
        });
    } catch (error: any) {
        toast({
            title: "Errore di Posizione",
            description: error.message,
            variant: "destructive"
        })
    }
  }

  const handleRequestExtraShift = async () => {
    if (!firestore) return;
    const todayString = new Date().toISOString().split('T')[0];
    
    const newRequest = {
        userId,
        userName,
        date: todayString,
        status: 'pending' as const
    };

    try {
        const docRef = doc(firestore, 'extra-shift-requests', `ESR-${userId}-${todayString}`);
        await setDoc(docRef, newRequest);
        toast({ title: "Richiesta Inviata", description: "La tua richiesta per una timbratura extra è stata inviata all'amministratore." });
    } catch (error) {
        toast({ title: "Errore", description: "Impossibile inviare la richiesta.", variant: "destructive" });
    }
  }

  const handleClockOut = async () => {
    if (!firestore || !activeShift) return;

    try {
        const location = await getCurrentPosition();
        const now = new Date();
        
        let shiftToUpdate = { ...activeShift };
        
        if (isOnPause) {
            const updatedPauses = shiftToUpdate.pauses.map(p => p.endTime === null ? { ...p, endTime: now.toISOString(), endLocation: location } : p);
            shiftToUpdate.pauses = updatedPauses;
        }

        const shiftRef = doc(firestore, 'shifts', activeShift.id);
        await updateDoc(shiftRef, {
            endTime: now.toISOString(),
            endLocation: location,
            pauses: shiftToUpdate.pauses
        });

        toast({
            title: "Fine Turno",
            description: `Hai timbrato l'uscita alle ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' })}.`,
        });
    } catch (error: any) {
        toast({
            title: "Errore",
            description: error.message || "Impossibile timbrare l'uscita.",
            variant: "destructive"
        })
    }
  }

  const handlePauseToggle = async () => {
    if (!activeShift || !firestore) return;
    try {
        const location = await getCurrentPosition();
        const now = new Date();
        const shiftRef = doc(firestore, 'shifts', activeShift.id);
        
        let updatedPauses: Pause[];

        if (isOnPause) { // End pause
            updatedPauses = activeShift.pauses.map(p => p.endTime === null ? { ...p, endTime: now.toISOString(), endLocation: location } : p);
            await updateDoc(shiftRef, { pauses: updatedPauses });
            toast({ title: "Fine Pausa", description: "Hai ripreso a lavorare." });

        } else { // Start pause
            const newPause: Pause = { startTime: now.toISOString(), endTime: null, startLocation: location };
            updatedPauses = [...activeShift.pauses, newPause];
            await updateDoc(shiftRef, { pauses: updatedPauses });
            toast({ title: "Inizio Pausa", description: "Hai messo in pausa il tuo turno." });
        }
    } catch(error: any) {
        toast({
            title: "Errore",
            description: error.message || "Impossibile gestire la pausa.",
            variant: "destructive"
        })
    }
  }

  const getStatusDescription = () => {
      if (!activeShift) {
        if (needsExtraShiftApproval) {
            switch(extraShiftRequestStatus) {
                case 'pending': return "Richiesta timbratura extra in attesa di approvazione.";
                case 'approved': return "Approvato! Ora puoi effettuare una nuova timbratura.";
                default: return "Hai già completato un turno oggi.";
            }
        }
          return "Tocca per iniziare il tuo turno.";
      }
      if (isOnPause) {
          return `In pausa dalle ${lastActionTime}`;
      }
      return `Turno iniziato alle ${lastActionTime}`;
  }
  
  const isButtonDisabled = isGettingLocation || !userId;
  const isClockedIn = !!activeShift;

  const renderClockInButton = () => {
    if (needsExtraShiftApproval) {
        switch(extraShiftRequestStatus) {
            case 'pending':
                return <Button className="w-full font-bold" size="lg" disabled> <LoaderCircle className="animate-spin mr-2"/> In Attesa di Approvazione</Button>;
            case 'approved':
                return <Button onClick={handleClockIn} className="w-full font-bold" size="lg" disabled={isButtonDisabled}>
                {isGettingLocation ? <LoaderCircle className="animate-spin mr-2"/> : <LogIn className="mr-2 h-4 w-4" />}
                Timbra Entrata (Extra)
            </Button>;
            case 'not_requested':
                return <Button onClick={handleRequestExtraShift} className="w-full font-bold" variant="secondary" size="lg" disabled={isButtonDisabled}>
                {isGettingLocation ? <LoaderCircle className="animate-spin mr-2"/> : <AlertCircle className="mr-2 h-4 w-4" />}
                Richiedi Timbratura Extra
            </Button>;
        }
    }

    return (
         <Button onClick={handleClockIn} className="w-full font-bold" size="lg" disabled={isButtonDisabled}>
            {isGettingLocation ? <LoaderCircle className="animate-spin mr-2"/> : <LogIn className="mr-2 h-4 w-4" />}
            Timbra Entrata
        </Button>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Gestione Turno</CardTitle>
        </div>
        <CardDescription>
          {isGettingLocation ? "Acquisizione posizione in corso..." : getStatusDescription()}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-6">
        <div className="text-6xl font-bold font-mono tracking-tight text-foreground">
          {currentTime || "--:--"}
        </div>
        {!isClockedIn ? (
            renderClockInButton()
        ) : (
          <div className="grid grid-cols-2 gap-4 w-full">
              <Button onClick={handlePauseToggle} className="font-bold" size="lg" variant={isOnPause ? "default" : "outline"} disabled={isButtonDisabled}>
                  {isGettingLocation ? <LoaderCircle className="animate-spin mr-2"/> : 
                    isOnPause ? <Play className="mr-2 h-4 w-4" /> : <Coffee className="mr-2 h-4 w-4" />
                  }
                  {isOnPause ? 'Termina Pausa' : 'Inizia Pausa'}
              </Button>
            <Button onClick={handleClockOut} className="font-bold" size="lg" variant="destructive" disabled={isButtonDisabled}>
                {isGettingLocation ? <LoaderCircle className="animate-spin mr-2"/> : <LogOut className="mr-2 h-4 w-4" />}
                Timbra Uscita
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
