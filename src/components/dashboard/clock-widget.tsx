"use client";

import { useState, useEffect } from "react";
import { Clock, LogIn, LogOut, Coffee, Play, LoaderCircle, AlertTriangle, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot, doc, getDocs, addDoc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";

type ShiftStatus = 'not-started' | 'active' | 'on-pause' | 'ended';
type Shift = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startTime: any;
  endTime: any | null;
  pauses: { startTime: any; endTime: any | null }[];
  status: 'In attesa' | 'Approvato';
};

export function ClockWidget({ userId, userName }: { userId: string, userName: string }) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const [currentTime, setCurrentTime] = useState("--:--");
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus>('not-started');
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [canStartNewShift, setCanStartNewShift] = useState(false);

  // Live clock effect
  useEffect(() => {
    const timer = setInterval(() => {
        setCurrentTime(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch current shift status effect
  useEffect(() => {
    if (!firestore || !userId) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const shiftsRef = collection(firestore, 'shifts');
    const q = query(shiftsRef, where('userId', '==', userId), where('date', '==', todayStr));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        setLoading(true);
        if (snapshot.empty) {
            setShiftStatus('not-started');
            setCurrentShift(null);
            setCanStartNewShift(true);
        } else {
            const shiftDoc = snapshot.docs[0];
            const shiftData = { id: shiftDoc.id, ...shiftDoc.data() } as Shift;
            setCurrentShift(shiftData);
            setCanStartNewShift(false);

            if (!shiftData.endTime) {
                const activePause = shiftData.pauses.find(p => !p.endTime);
                if (activePause) {
                    setShiftStatus('on-pause');
                } else {
                    setShiftStatus('active');
                }
            } else {
                setShiftStatus('ended');
                // Check if user has been approved for an extra shift
                const checkExtraShiftRequest = async () => {
                    const reqsRef = collection(firestore, 'extra-shift-requests');
                    const reqQuery = query(reqsRef, where('userId', '==', userId), where('date', '==', todayStr), where('status', '==', 'approved'));
                    const reqSnapshot = await getDocs(reqQuery);
                    if (!reqSnapshot.empty) {
                        setCanStartNewShift(true);
                    }
                }
                checkExtraShiftRequest();
            }
        }
        setLoading(false);
    }, (error) => {
        console.error("Error fetching shift:", error);
        toast({ title: "Errore", description: "Impossibile recuperare lo stato del turno.", variant: "destructive" });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, userId, toast]);

  const handleStartShift = async () => {
      if (!firestore) return;
      const todayStr = new Date().toISOString().split('T')[0];

      if (shiftStatus === 'ended' && !canStartNewShift) {
        toast({
            title: "Turno già terminato",
            description: "Hai già completato un turno oggi. Richiedi l'autorizzazione per una timbratura extra.",
            variant: "destructive"
        });
        return;
      }
      
      const newShift = {
          userId,
          userName,
          date: todayStr,
          startTime: serverTimestamp(),
          endTime: null,
          pauses: [],
          status: 'In attesa' as const
      };
      try {
          await addDoc(collection(firestore, 'shifts'), newShift);
          toast({ title: "Turno Iniziato", description: "Buon lavoro!" });
      } catch (error) {
          console.error(error);
          toast({ title: "Errore", description: "Impossibile iniziare il turno.", variant: "destructive" });
      }
  };

  const handleEndShift = async () => {
    if (!firestore || !currentShift) return;
    const shiftRef = doc(firestore, 'shifts', currentShift.id);

    // End any open pause first
    const activePauseIndex = currentShift.pauses.findIndex(p => !p.endTime);
    const updates: any = { endTime: serverTimestamp() };
    if (activePauseIndex !== -1) {
        updates[`pauses.${activePauseIndex}.endTime`] = serverTimestamp();
    }
    
    try {
        await updateDoc(shiftRef, updates);
        toast({ title: "Turno Terminato", description: "A presto!" });
    } catch (error) {
        console.error(error);
        toast({ title: "Errore", description: "Impossibile terminare il turno.", variant: "destructive" });
    }
  };

  const handlePause = async () => {
    if (!firestore || !currentShift) return;
    const shiftRef = doc(firestore, 'shifts', currentShift.id);
    const newPauses = [...currentShift.pauses, { startTime: serverTimestamp(), endTime: null }];

    try {
        await updateDoc(shiftRef, { pauses: newPauses });
        toast({ title: "Pausa Iniziata" });
    } catch (error) {
        console.error(error);
        toast({ title: "Errore", description: "Impossibile iniziare la pausa.", variant: "destructive" });
    }
  };

  const handleResume = async () => {
      if (!firestore || !currentShift) return;
      const shiftRef = doc(firestore, 'shifts', currentShift.id);
      
      const activePauseIndex = currentShift.pauses.findIndex(p => !p.endTime);
      if (activePauseIndex === -1) return;

      const updatedPauses = [...currentShift.pauses];
      updatedPauses[activePauseIndex].endTime = serverTimestamp();

      try {
          await updateDoc(shiftRef, { pauses: updatedPauses });
          toast({ title: "Pausa Terminata" });
      } catch (error) {
          console.error(error);
          toast({ title: "Errore", description: "Impossibile terminare la pausa.", variant: "destructive" });
      }
  };

  const handleRequestExtraShift = async () => {
      if (!firestore) return;
      const todayStr = new Date().toISOString().split('T')[0];

      // Check if a request already exists
      const reqsRef = collection(firestore, 'extra-shift-requests');
      const q = query(reqsRef, where('userId', '==', userId), where('date', '==', todayStr));
      const existingReq = await getDocs(q);

      if(!existingReq.empty) {
        toast({title: "Richiesta già inviata", description: "Hai già richiesto una timbratura extra per oggi."});
        return;
      }

      const newRequest = {
          userId,
          userName,
          date: todayStr,
          status: 'pending' as const
      };
      try {
          await addDoc(collection(firestore, 'extra-shift-requests'), newRequest);
          toast({ title: "Richiesta Inviata", description: "La tua richiesta per una timbratura extra è stata inviata." });
      } catch (error) {
          toast({ title: "Errore", description: "Impossibile inviare la richiesta.", variant: "destructive" });
      }
  };
  
  const renderButtons = () => {
    if (loading) {
        return <Button className="w-full font-bold" size="lg" disabled><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Caricamento...</Button>;
    }

    switch (shiftStatus) {
        case 'not-started':
            return <Button onClick={handleStartShift} className="w-full font-bold bg-green-600 hover:bg-green-700" size="lg" disabled={!canStartNewShift}>
                        <LogIn className="mr-2 h-5 w-5"/> Inizia Turno
                   </Button>;
        case 'active':
            return <div className="grid grid-cols-2 gap-2 w-full">
                       <Button onClick={handlePause} variant="outline" size="lg"><Coffee className="mr-2 h-5 w-5"/> Pausa</Button>
                       <Button onClick={handleEndShift} variant="destructive" size="lg"><LogOut className="mr-2 h-5 w-5"/> Termina</Button>
                   </div>;
        case 'on-pause':
            return <Button onClick={handleResume} className="w-full font-bold" size="lg">
                       <Play className="mr-2 h-5 w-5"/> Riprendi
                   </Button>;
        case 'ended':
            if (canStartNewShift) {
                 return <Button onClick={handleStartShift} className="w-full font-bold bg-green-600 hover:bg-green-700" size="lg">
                            <LogIn className="mr-2 h-5 w-5"/> Inizia Turno Extra
                       </Button>;
            }
            return <div className="w-full text-center">
                        <p className="text-sm text-muted-foreground mb-3">Hai già concluso il tuo turno per oggi.</p>
                        <Button onClick={handleRequestExtraShift} variant="secondary" size="sm">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Richiedi Timbratura Extra
                        </Button>
                   </div>;
        default:
            return <Button disabled>...</Button>;
    }
  };

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
          {currentTime}
        </div>
        {renderButtons()}
        {shiftStatus === 'ended' && !canStartNewShift &&
            <CardDescription className="flex items-center gap-2 text-center text-xs p-2 border rounded-lg bg-muted/50">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <span>Per un secondo turno nella stessa giornata, richiedi l'autorizzazione all'amministratore.</span>
            </CardDescription>
        }
      </CardContent>
    </Card>
  );
}
