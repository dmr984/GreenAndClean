"use client";

import { useState, useEffect } from "react";
import { Clock, LogIn, LogOut, Coffee, Play, MapPin, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

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
  const [isGettingLocation, setIsGettingLocation] = useState(false);


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
    try {
        const location = await getCurrentPosition();
        const now = new Date();
        const shifts = getShiftsFromStorage();
        const newShift: Shift = {
            id: `SHIFT${Date.now()}`,
            userId: userId,
            userName: userName,
            date: now.toISOString().split('T')[0],
            startTime: now.toISOString(),
            endTime: null,
            startLocation: location,
            pauses: [],
        };
        saveShiftsToStorage([...shifts, newShift]);
        setActiveShift(newShift);
        setLastActionTime(now.toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' }));
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

  const handleClockOut = async () => {
    try {
        const location = await getCurrentPosition();
        const now = new Date();
        const shifts = getShiftsFromStorage();
        if (activeShift) {
            let shiftToUpdate = { ...activeShift };
            
            // If on pause, end pause first
            if (isOnPause) {
                const updatedPauses = shiftToUpdate.pauses.map(p => p.endTime === null ? { ...p, endTime: now.toISOString(), endLocation: location } : p);
                shiftToUpdate.pauses = updatedPauses;
            }

            const updatedShifts = shifts.map(s => 
                s.id === activeShift.id ? { ...shiftToUpdate, endTime: now.toISOString(), endLocation: location } : s
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
    } catch (error: any) {
        toast({
            title: "Errore di Posizione",
            description: error.message,
            variant: "destructive"
        })
    }
  }

  const handlePauseToggle = async () => {
    if (!activeShift) return;
    try {
        const location = await getCurrentPosition();
        const now = new Date();
        const shifts = getShiftsFromStorage();
        let updatedShift: Shift | null = null;
        
        if (isOnPause) { // End pause
            const updatedShifts = shifts.map(s => {
                if (s.id === activeShift.id) {
                    const updatedPauses = s.pauses.map(p => p.endTime === null ? { ...p, endTime: now.toISOString(), endLocation: location } : p);
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
            const newPause: Pause = { startTime: now.toISOString(), endTime: null, startLocation: location };
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
    } catch(error: any) {
        toast({
            title: "Errore di Posizione",
            description: error.message,
            variant: "destructive"
        })
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
  
  const isButtonDisabled = isGettingLocation || !userId;
  const isClockedIn = !!activeShift;

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
            <Button onClick={handleClockIn} className="w-full font-bold" size="lg" disabled={isButtonDisabled}>
                {isGettingLocation ? <LoaderCircle className="animate-spin mr-2"/> : <LogIn className="mr-2 h-4 w-4" />}
                Timbra Entrata
            </Button>
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
