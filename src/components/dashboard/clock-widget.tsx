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
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [isOnPause, setIsOnPause] = useState(false);
  const { toast } = useToast();

  // Load active shift on component mount
  useEffect(() => {
    const shifts = getShiftsFromStorage();
    const currentActiveShift = shifts.find(s => s.userId === userId && s.startTime && !s.endTime) || null;
    setActiveShift(currentActiveShift);
    if(currentActiveShift){
       const activePause = currentActiveShift.pauses.find(p => p.startTime && !p.endTime);
       setIsOnPause(!!activePause);
    }
  }, [userId]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (activeShift?.startTime && !isOnPause) {
      const shiftStartTime = new Date(activeShift.startTime);
      const totalPauseDuration = activeShift.pauses
        .filter(p => p.endTime)
        .reduce((total, p) => total + (new Date(p.endTime!).getTime() - new Date(p.startTime).getTime()), 0);
        
      intervalId = setInterval(() => {
        const now = new Date();
        // Adjust for current active pause if any
        const currentPause = activeShift.pauses.find(p => p.startTime && !p.endTime);
        const currentPauseDuration = currentPause ? now.getTime() - new Date(currentPause.startTime).getTime() : 0;
        
        const diff = now.getTime() - shiftStartTime.getTime() - totalPauseDuration - currentPauseDuration;

        const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, "0");
        const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0");
        const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, "0");

        setElapsedTime(`${hours}:${minutes}:${seconds}`);
      }, 1000);
    } else {
        // If not clocked in, reset time. If on pause, time is frozen by not running the interval.
        if(!activeShift) setElapsedTime("00:00:00");
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [activeShift, isOnPause]);

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
    toast({
        title: "Inizio Turno",
        description: `Hai timbrato l'entrata alle ${now.toLocaleTimeString()}.`,
    });
  }

  const handleClockOut = () => {
      const now = new Date();
      const shifts = getShiftsFromStorage();
      if (activeShift) {
        if(isOnPause) { // End pause before clocking out
            handlePauseToggle();
        }
        const updatedShifts = shifts.map(s => 
            s.id === activeShift.id ? { ...s, endTime: now.toISOString() } : s
        );
        saveShiftsToStorage(updatedShifts);
        setActiveShift(null);
        setIsOnPause(false);
        toast({
            title: "Fine Turno",
            description: `Hai timbrato l'uscita alle ${now.toLocaleTimeString()}.`,
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
        toast({ title: "Inizio Pausa", description: "Hai messo in pausa il tuo turno." });
    }
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
          {isClockedIn ? (isOnPause ? "Sei attualmente in pausa." : "Sei attualmente in turno.") : "Tocca per iniziare il tuo turno."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-4">
        <div className="text-5xl font-bold font-mono tracking-tighter text-center p-4 rounded-lg bg-muted w-full">
          {elapsedTime}
        </div>
        {!isClockedIn && (
            <Button onClick={handleClockIn} className="w-full font-bold" size="lg">
                <LogIn className="mr-2 h-4 w-4" /> Timbra Entrata
            </Button>
        )}
        {isClockedIn && (
          <div className="grid grid-cols-2 gap-4 w-full">
              <Button onClick={handlePauseToggle} className="font-bold" size="lg" variant={isOnPause ? "default" : "outline"}>
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
            <Button onClick={handleClockOut} className="font-bold" size="lg" variant="destructive">
                <LogOut className="mr-2 h-4 w-4" /> Timbra Uscita
            </Button>
          </div>
        )}
        {isClockedIn && activeShift?.startTime && (
          <p className="text-sm text-muted-foreground">
            Turno iniziato alle {new Date(activeShift.startTime).toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
