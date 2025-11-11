"use client";

import { useState, useEffect } from "react";
import { Clock, LogIn, LogOut, Coffee, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export type Pause = {
  startTime: string;
  endTime: string | null;
}

export type Shift = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  pauses: Pause[];
};

// Helper to get shifts from localStorage
const getShiftsFromStorage = (): Shift[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('shifts');
  try {
    const shifts = stored ? JSON.parse(stored) : [];
    // Ensure all shifts have a `pauses` property
    return shifts.map((s: any) => ({ ...s, pauses: s.pauses || [] }));
  } catch (e) {
    return [];
  }
};

// Helper to save shifts to localStorage
const saveShiftsToStorage = (shifts: Shift[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('shifts', JSON.stringify(shifts));
  window.dispatchEvent(new Event('storage'));
};

interface ClockWidgetProps {
  onShiftComplete?: () => void;
  userId: string;
  userName: string;
}

export function ClockWidget({ onShiftComplete, userId, userName }: ClockWidgetProps) {
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [isOnPause, setIsOnPause] = useState(false);
  const { toast } = useToast();
  const [lastActionTime, setLastActionTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");


  // Effect for the live clock
  useEffect(() => {
    const timer = setInterval(() => {
        setCurrentTime(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    }, 1000); // Update every second

    return () => clearInterval(timer); // Cleanup
  }, []);

  // Load active shift on component mount
  useEffect(() => {
    const shifts = getShiftsFromStorage();
    const currentActiveShift = shifts.find(s => s.userId === userId && s.startTime && !s.endTime) || null;
    setActiveShift(currentActiveShift);
    if(currentActiveShift){
       const activePause = currentActiveShift.pauses.find(p => p.startTime && !p.endTime);
       setIsOnPause(!!activePause);
       if (activePause) {
           setLastActionTime(new Date(activePause.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' }));
       } else if (currentActiveShift.startTime) {
           setLastActionTime(new Date(currentActiveShift.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' }));
       }
    } else {
        setLastActionTime(null);
    }
  }, [userId]);


  const handleClockIn = () => {
    const now = new Date();
    const shifts = getShiftsFromStorage();
    const newShift: Shift = {
        id: `SHIFT${Date.now()}`,
        userId: userId,
        userName: userName,
        date: now.toISOString().split('T')[0],
        startTime: now.toISOString(),
        endTime: null,
        pauses: [],
    };
    saveShiftsToStorage([...shifts, newShift]);
    setActiveShift(newShift);
    setLastActionTime(now.toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' }));
    toast({
        title: "Inizio Turno",
        description: `Hai timbrato l'entrata alle ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' })}.`,
    });
  }

  const handleClockOut = () => {
      const now = new Date();
      const shifts = getShiftsFromStorage();
      if (activeShift) {
        let shiftToUpdate = { ...activeShift };
        
        // If on pause, end pause first
        if (isOnPause) {
            const updatedPauses = shiftToUpdate.pauses.map(p => p.endTime === null ? { ...p, endTime: now.toISOString() } : p);
            shiftToUpdate.pauses = updatedPauses;
        }

        const updatedShifts = shifts.map(s => 
            s.id === activeShift.id ? { ...shiftToUpdate, endTime: now.toISOString() } : s
        );
        saveShiftsToStorage(updatedShifts);
        setActiveShift(null);
        setIsOnPause(false);
        setLastActionTime(null);
        toast({
            title: "Fine Turno",
            description: `Hai timbrato l'uscita alle ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' })}.`,
        });
        if (onShiftComplete) onShiftComplete();
      }
  }

  const handlePauseToggle = () => {
    if (!activeShift) return;

    const now = new Date();
    const shifts = getShiftsFromStorage();
    let updatedShift: Shift | null = null;
    
    if (isOnPause) { // End pause
        const updatedShifts = shifts.map(s => {
            if (s.id === activeShift.id) {
                const updatedPauses = s.pauses.map(p => p.endTime === null ? { ...p, endTime: now.toISOString() } : p);
                updatedShift = { ...s, pauses: updatedPauses };
                return updatedShift;
            }
            return s;
        });
        saveShiftsToStorage(updatedShifts);
        setIsOnPause(false);
        if(updatedShift) setActiveShift(updatedShift);
        setLastActionTime(new Date(updatedShift!.startTime!).toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' }));
        toast({ title: "Fine Pausa", description: "Hai ripreso a lavorare." });

    } else { // Start pause
        const newPause: Pause = { startTime: now.toISOString(), endTime: null };
        const updatedShifts = shifts.map(s => {
            if (s.id === activeShift.id) {
                updatedShift = { ...s, pauses: [...s.pauses, newPause] };
                return updatedShift;
            }
            return s;
        });
        saveShiftsToStorage(updatedShifts);
        setIsOnPause(true);
        if(updatedShift) setActiveShift(updatedShift);
        setLastActionTime(now.toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' }));
        toast({ title: "Inizio Pausa", description: "Hai messo in pausa il tuo turno." });
    }
  }

  const getStatusDescription = () => {
      if (!activeShift) {
          return "Tocca per iniziare il tuo turno.";
      }
      if (isOnPause) {
          return `In pausa dalle ${lastActionTime}`;
      }
      return `Turno iniziato alle ${lastActionTime}`;
  }

  const isClockedIn = !!activeShift;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Gestione Turno</CardTitle>
        </div>
        <CardDescription>
          {getStatusDescription()}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-6">
        <div className="text-6xl font-bold font-mono tracking-tight text-foreground">
          {currentTime || "--:--"}
        </div>
        {!isClockedIn ? (
            <Button onClick={handleClockIn} className="w-full font-bold" size="lg">
                <LogIn className="mr-2 h-4 w-4" /> Timbra Entrata
            </Button>
        ) : (
          <div className="grid grid-cols-2 gap-4 w-full">
              <Button onClick={handlePauseToggle} className="font-bold" size="lg" variant={isOnPause ? "default" : "outline"} disabled={!isClockedIn}>
                  {isOnPause ? (
                    <>
                        <Play className="mr-2 h-4 w-4" /> Termina Pausa
                    </>
                  ) : (
                    <>
                        <Coffee className="mr-2 h-4 w-4" /> Inizia Pausa
                    </>
                  )}
              </Button>
            <Button onClick={handleClockOut} className="font-bold" size="lg" variant="destructive" disabled={!isClockedIn}>
                <LogOut className="mr-2 h-4 w-4" /> Timbra Uscita
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
