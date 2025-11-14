"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Play, Pause, Square, AlertCircle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, getDocs, serverTimestamp } from "firebase/firestore";

type Shift = {
    id: string;
    userId: string;
    startTime: string | null;
    endTime: string | null;
    pauses: { startTime: string; endTime: string | null }[];
    status: 'In attesa' | 'Approvato';
    startLocation: { latitude: number, longitude: number } | null;
    endLocation: { latitude: number, longitude: number } | null;
};

type ExtraShiftRequest = {
    id: string;
    userId: string;
    date: string;
    status: 'pending' | 'approved';
};

const getTodayDateString = () => new Date().toISOString().split('T')[0];

export function ClockWidget({ userId, userName }: { userId: string, userName: string }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [currentTime, setCurrentTime] = useState("--:--");
  const [shift, setShift] = useState<Shift | null>(null);
  const [shiftDuration, setShiftDuration] = useState("00:00:00");
  const [canStartNewShift, setCanStartNewShift] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequestingExtra, setIsRequestingExtra] = useState(false);

  const shiftsQuery = useMemoFirebase(() => {
      if (!firestore || !userId) return null;
      const today = getTodayDateString();
      return query(
          collection(firestore, 'shifts'),
          where('userId', '==', userId),
          where('date', '==', today)
      );
  }, [firestore, userId]);
  
  const extraShiftQuery = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    const today = getTodayDateString();
    return query(
        collection(firestore, 'extra-shift-requests'),
        where('userId', '==', userId),
        where('date', '==', today)
    );
  }, [firestore, userId]);


  useEffect(() => {
      if (!shiftsQuery || !extraShiftQuery) return;

      const handleShiftSnap = (snapshot: any) => {
          const todayShifts = snapshot.docs.map((d:any) => ({ id: d.id, ...d.data() }));
          const activeShift = todayShifts.find(s => !s.endTime) || null;
          setShift(activeShift);
          
          const hasCompletedShift = todayShifts.some((s:any) => s.endTime);

          const unsubExtra = onSnapshot(extraShiftQuery, (extraSnap) => {
             const approvedRequests = extraSnap.docs.map(d => d.data()).filter(r => r.status === 'approved');
             setCanStartNewShift(!activeShift && (!hasCompletedShift || approvedRequests.length > 0));
             setIsLoading(false);
          });
          return () => unsubExtra();
      };
      
      const unsubShifts = onSnapshot(shiftsQuery, handleShiftSnap, (err) => {
          console.error("Error fetching shifts:", err);
          setIsLoading(false);
      });

      return () => unsubShifts();
  }, [shiftsQuery, extraShiftQuery]);


  // Live clock and duration effect
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
      
      if (shift?.startTime && !shift.endTime) {
          const start = new Date(shift.startTime).getTime();
          const current = now.getTime();
          const pauseMillis = (shift.pauses || [])
              .filter(p => p.endTime)
              .reduce((acc, p) => acc + (new Date(p.endTime!).getTime() - new Date(p.startTime).getTime()), 0);
          
          const activePause = (shift.pauses || []).find(p => !p.endTime);
          const activePauseMillis = activePause ? (current - new Date(activePause.startTime).getTime()) : 0;

          const totalDuration = current - start - pauseMillis - activePauseMillis;
          const hours = Math.floor(totalDuration / 3600000);
          const minutes = Math.floor((totalDuration % 3600000) / 60000);
          const seconds = Math.floor((totalDuration % 60000) / 1000);
          setShiftDuration(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      } else {
          setShiftDuration("00:00:00");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [shift]);
  
  const getCurrentPosition = (): Promise<{ latitude: number, longitude: number }> => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            return reject(new Error("Geolocalizzazione non supportata."));
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            }),
            (error) => reject(error)
        );
    });
  };

  const handleStartShift = async () => {
    if (!firestore || !userId || !userName) return;
    setIsLoading(true);

    let location = null;
    try {
        location = await getCurrentPosition();
    } catch (error: any) {
        toast({ title: "Errore di Posizione", description: `Impossibile ottenere la posizione: ${error.message}. La timbratura continuerà senza.`, variant: "destructive" });
    }

    const newShift = {
        userId,
        userName,
        date: getTodayDateString(),
        startTime: new Date().toISOString(),
        endTime: null,
        pauses: [],
        status: 'In attesa' as const,
        startLocation: location,
        endLocation: null,
    };
    try {
        await addDoc(collection(firestore, "shifts"), newShift);
        toast({ title: "Turno Iniziato!", description: `Buon lavoro, ${userName}!` });
    } catch (error) {
        toast({ title: "Errore", description: "Impossibile iniziare il turno.", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  const handleEndShift = async () => {
    if (!firestore || !shift) return;
    setIsLoading(true);

    let location = null;
    try {
        location = await getCurrentPosition();
    } catch (error: any) {
        toast({ title: "Errore di Posizione", description: `Impossibile ottenere la posizione: ${error.message}. La timbratura continuerà senza.`, variant: "destructive" });
    }

    const shiftRef = doc(firestore, 'shifts', shift.id);

    // End any active pause before ending the shift
    const activePauseIndex = shift.pauses.findIndex(p => !p.endTime);
    const updatedPauses = [...shift.pauses];
    if (activePauseIndex !== -1) {
        updatedPauses[activePauseIndex].endTime = new Date().toISOString();
    }

    try {
        await updateDoc(shiftRef, {
            endTime: new Date().toISOString(),
            pauses: updatedPauses,
            endLocation: location,
        });
        toast({ title: "Turno Concluso!", description: "Grazie per il tuo lavoro." });
    } catch (error) {
        toast({ title: "Errore", description: "Impossibile terminare il turno.", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  const handleTogglePause = async () => {
    if (!firestore || !shift) return;
    setIsLoading(true);
    const shiftRef = doc(firestore, 'shifts', shift.id);
    const activePauseIndex = shift.pauses.findIndex(p => !p.endTime);
    const updatedPauses = [...shift.pauses];

    if (activePauseIndex > -1) { // Is on pause, so resume
        updatedPauses[activePauseIndex].endTime = new Date().toISOString();
        toast({ title: "Pausa Terminata", description: "Bentornato al lavoro." });
    } else { // Not on pause, so start pause
        updatedPauses.push({ startTime: new Date().toISOString(), endTime: null });
        toast({ title: "In Pausa", description: "Goditi la tua pausa." });
    }

    try {
        await updateDoc(shiftRef, { pauses: updatedPauses });
    } catch (error) {
        toast({ title: "Errore", description: "Impossibile aggiornare lo stato della pausa.", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleRequestExtraShift = async () => {
      if (!firestore || !userId) return;
      setIsRequestingExtra(true);
      
      const today = getTodayDateString();
      const extraShiftCollection = collection(firestore, 'extra-shift-requests');
      const q = query(extraShiftCollection, where('userId', '==', userId), where('date', '==', today));
      
      try {
          const existingRequest = await getDocs(q);
          if (!existingRequest.empty) {
              toast({ title: "Richiesta già inviata", description: "Hai già richiesto una timbratura extra per oggi.", variant: "default" });
              return;
          }
          await addDoc(extraShiftCollection, {
              userId,
              userName,
              date: today,
              status: 'pending'
          });
          toast({ title: "Richiesta Inviata", description: "La tua richiesta per una timbratura extra è stata inviata."});
      } catch (error) {
          toast({ title: "Errore", description: "Impossibile inviare la richiesta.", variant: "destructive" });
      } finally {
          setIsRequestingExtra(false);
      }
  };
  
  const isOnPause = shift?.pauses.some(p => !p.endTime) ?? false;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Gestione Turno</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-6">
        <div className="text-6xl font-bold font-mono tracking-tight text-foreground">
          {shift ? shiftDuration : currentTime}
        </div>
        <div className="flex w-full gap-2">
            {isLoading ? (
                <Button className="w-full" disabled>Caricamento...</Button>
            ) : shift ? (
                <>
                    <Button className="w-full" variant={isOnPause ? "default" : "outline"} onClick={handleTogglePause} disabled={!shift}>
                        {isOnPause ? <Play className="mr-2" /> : <Pause className="mr-2" />}
                        {isOnPause ? "Riprendi" : "Pausa"}
                    </Button>
                    <Button className="w-full" variant="destructive" onClick={handleEndShift} disabled={!shift}>
                        <Square className="mr-2" /> Termina
                    </Button>
                </>
            ) : canStartNewShift ? (
                <Button className="w-full" size="lg" onClick={handleStartShift}>
                    <Play className="mr-2" /> Inizia Turno
                </Button>
            ) : (
                <Button className="w-full" onClick={handleRequestExtraShift} disabled={isRequestingExtra}>
                    <PlusCircle className="mr-2 h-4 w-4" /> 
                    {isRequestingExtra ? "Invio in corso..." : "Richiedi Timbratura Extra"}
                </Button>
            )}
        </div>
         {shift && (
             <div className="text-xs text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4"/>
                <span>
                    Inizio: {shift.startLocation ? `${shift.startLocation.latitude.toFixed(2)}, ${shift.startLocation.longitude.toFixed(2)}` : 'N/A'}
                </span>
             </div>
         )}
      </CardContent>
    </Card>
  );
}
