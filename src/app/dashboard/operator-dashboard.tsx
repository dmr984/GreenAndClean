'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Play, Pause, Square, History, MapPin, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useCollection, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type ClockingEvent = {
    id: string;
    userId: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    latitude: number;
    longitude: number;
    status: 'sospesa' | 'confermata';
};

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

export function OperatorDashboard() {
  const [time, setTime] = useState(new Date());
  const [user, setUser] = useState<UserData | null>(null);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const { toast } = useToast();
  const firestore = useFirestore();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = Timestamp.fromDate(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowTimestamp = Timestamp.fromDate(tomorrow);

  useEffect(() => {
     if (typeof window !== 'undefined') {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error("Failed to parse user from localStorage", e);
            }
        }
        setIsLoadingUser(false);
     }
  }, []);
  
  const clockingsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.id || isLoadingUser) return null;
    return query(
      collection(firestore, `app-users/${user.id}/timbrature`),
      where('timestamp', '>=', todayTimestamp),
      where('timestamp', '<', tomorrowTimestamp),
      orderBy('timestamp', 'desc')
    );
  }, [firestore, user?.id, todayTimestamp, tomorrowTimestamp, isLoadingUser]);

  const { data: clockings, isLoading: isLoadingClockings } = useCollection<ClockingEvent>(clockingsQuery);

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (clockings && clockings.length > 0) {
      const lastEvent = clockings[0];
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
          setLocation(coords);
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
    if (!firestore || !user) return;

    try {
      const currentLoc = await getLocation();
      
      const timbraturaRef = collection(firestore, `app-users/${user.id}/timbrature`);
      const newTimbratura = {
        userId: user.id,
        type,
        timestamp: serverTimestamp(),
        status: 'sospesa',
        latitude: currentLoc.latitude,
        longitude: currentLoc.longitude,
      };
      
      addDoc(timbraturaRef, newTimbratura)
        .then(() => {
             toast({
                title: "Successo!",
                description: `Timbratura di ${type} registrata correttamente.`,
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
  };
  
  const formatTime = (date: Date | Timestamp | null) => {
    if (!date) return "--:--";
    const d = date instanceof Timestamp ? date.toDate() : date;
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  
  if (isLoadingUser) {
      return <div className="flex items-center justify-center h-full">Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
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
        <CardFooter className="flex flex-col sm:flex-row gap-2">
            <Button className="w-full" size="lg" disabled={isClockedIn || isProcessing} onClick={() => handleClocking('entrata')}>
                <Play className="mr-2 h-5 w-5"/> {isProcessing && !isClockedIn ? <Loader2 className="animate-spin" /> : 'Entrata'}
            </Button>
            <Button className="w-full" size="lg" variant="outline" disabled={!isClockedIn || isOnBreak || isProcessing} onClick={() => handleClocking('pausa')}>
                <Pause className="mr-2 h-5 w-5"/> {isProcessing && isClockedIn && !isOnBreak ? <Loader2 className="animate-spin" /> : 'Pausa'}
            </Button>
            <Button className="w-full" size="lg" variant="outline" disabled={!isClockedIn || !isOnBreak || isProcessing} onClick={() => handleClocking('fine_pausa')}>
                <Play className="mr-2 h-5 w-5"/> {isProcessing && isOnBreak ? <Loader2 className="animate-spin" /> : 'Fine Pausa'}
            </Button>
            <Button className="w-full" size="lg" variant="destructive" disabled={!isClockedIn || isOnBreak || isProcessing} onClick={() => handleClocking('uscita')}>
                <Square className="mr-2 h-5 w-5"/> {isProcessing && isClockedIn && !isOnBreak ? <Loader2 className="animate-spin" /> : 'Uscita'}
            </Button>
        </CardFooter>
      </Card>
      
      <Card>
        <CardHeader>
           <div className="flex items-center gap-3">
            <History className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Storico Timbrature di Oggi</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
           {isLoadingClockings || isLoadingUser ? (
             <div className="flex justify-center items-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
           ) : clockings && clockings.length > 0 ? (
             <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Orario</TableHead>
                            <TableHead>Evento</TableHead>
                            <TableHead>Stato</TableHead>
                            <TableHead className="text-right">Posizione</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {clockings.map(c => (
                            <TableRow key={c.id}>
                                <TableCell className="font-medium">{formatTime(c.timestamp)}</TableCell>
                                <TableCell className="capitalize">{c.type.replace('_', ' ')}</TableCell>
                                <TableCell>
                                    <Badge variant={c.status === 'confermata' ? 'default' : 'secondary'}>{c.status}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <a href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-end gap-2 text-primary hover:underline">
                                        <MapPin className="h-4 w-4"/> Vedi Mappa
                                    </a>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
             </div>
           ) : (
             <p className="text-muted-foreground text-center">Nessuna timbratura registrata per oggi.</p>
           )}
        </CardContent>
      </Card>
    </div>
  );
}
