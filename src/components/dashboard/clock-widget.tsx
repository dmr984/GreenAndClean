"use client";

import { useState, useEffect } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export type Shift = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
};

// Helper to get shifts from localStorage
const getShiftsFromStorage = (): Shift[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('shifts');
  return stored ? JSON.parse(stored) : [];
};

// Helper to save shifts to localStorage
const saveShiftsToStorage = (shifts: Shift[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('shifts', JSON.stringify(shifts));
  window.dispatchEvent(new Event('storage'));
};

interface ClockWidgetProps {
  onShiftComplete?: () => void;
}

export function ClockWidget({ onShiftComplete }: ClockWidgetProps) {
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const { toast } = useToast();

  // Load active shift on component mount
  useEffect(() => {
    const shifts = getShiftsFromStorage();
    const currentActiveShift = shifts.find(s => s.startTime && !s.endTime) || null;
    setActiveShift(currentActiveShift);
  }, []);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (activeShift?.startTime) {
      const shiftStartTime = new Date(activeShift.startTime);
      intervalId = setInterval(() => {
        const now = new Date();
        const diff = now.getTime() - shiftStartTime.getTime();

        const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, "0");
        const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0");
        const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, "0");

        setElapsedTime(`${hours}:${minutes}:${seconds}`);
      }, 1000);
    } else {
        setElapsedTime("00:00:00");
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [activeShift]);

  const handleClockInOut = () => {
    const now = new Date();
    const shifts = getShiftsFromStorage();

    if (activeShift) { // Clocking out
      const updatedShifts = shifts.map(s => 
        s.id === activeShift.id ? { ...s, endTime: now.toISOString() } : s
      );
      saveShiftsToStorage(updatedShifts);
      setActiveShift(null);
      toast({
        title: "Fine Turno",
        description: `Hai timbrato l'uscita alle ${now.toLocaleTimeString()}.`,
      });
      if (onShiftComplete) onShiftComplete();

    } else { // Clocking in
      const newShift: Shift = {
        id: `SHIFT${Date.now()}`,
        date: now.toISOString().split('T')[0],
        startTime: now.toISOString(),
        endTime: null,
      };
      saveShiftsToStorage([...shifts, newShift]);
      setActiveShift(newShift);
      toast({
        title: "Inizio Turno",
        description: `Hai timbrato l'entrata alle ${now.toLocaleTimeString()}.`,
      });
    }
  };

  const isClockedIn = !!activeShift;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Gestione Turno</CardTitle>
        </div>
        <CardDescription>
          {isClockedIn ? "Sei attualmente in turno." : "Tocca per iniziare il tuo turno."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-4">
        <div className="text-5xl font-bold font-mono tracking-tighter text-center p-4 rounded-lg bg-muted w-full">
          {elapsedTime}
        </div>
        <Button onClick={handleClockInOut} className="w-full font-bold" size="lg">
          {isClockedIn ? (
            <>
              <LogOut className="mr-2 h-4 w-4" /> Timbra Uscita
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" /> Timbra Entrata
            </>
          )}
        </Button>
        {isClockedIn && activeShift?.startTime && (
          <p className="text-sm text-muted-foreground">
            Turno iniziato alle {new Date(activeShift.startTime).toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
