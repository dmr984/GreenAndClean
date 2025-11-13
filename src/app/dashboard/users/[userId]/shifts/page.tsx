'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, PauseCircle, Timer, AlarmClockOff, Briefcase, MapPin, Trash2, Pencil, CheckCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, deleteDoc, updateDoc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';


type Geolocation = {
  latitude: number;
  longitude: number;
};

type Pause = { 
  startTime: string; 
  endTime: string | null;
  startLocation?: Geolocation;
  endLocation?: Geolocation;
};

type Shift = { 
  id: string; 
  userId: string;
  startTime: string | null; 
  endTime: string | null; 
  startLocation?: Geolocation;
  endLocation?: Geolocation;
  pauses: Pause[];
  status: 'In attesa' | 'Approvato';
};

type User = {
    id: string;
    username: string;
    expectedHours?: number;
};

const calculateDuration = (start: string | null, end: string | null, pauses: Pause[]) => {
    if (!start || !end) return { total: 'N/A', pause: 'N/A', worked: 'N/A', workedMinutes: 0 };

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    
    const pauseMillis = pauses
        .filter(p => p.endTime)
        .reduce((acc, p) => acc + (new Date(p.endTime!).getTime() - new Date(p.startTime).getTime()), 0);

    const workedMillis = endTime - startTime - pauseMillis;

    const format = (ms: number) => {
        if (ms < 0) ms = 0;
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };
    
    return {
        total: format(endTime - startTime),
        pause: format(pauseMillis),
        worked: format(workedMillis),
        workedMinutes: Math.floor(workedMillis / 60000),
    };
};

const formatMinutesToHours = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export default function UserShiftsPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.userId as string;
    const { toast } = useToast();
    const firestore = useFirestore();

    const [user, setUser] = useState<User | null>(null);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editDraft, setEditDraft] = useState<{startTime: string, endTime: string}>({startTime: '', endTime: ''});
    
     useEffect(() => {
        if (!userId || !firestore) return;
        setLoading(true);

        getDoc(doc(firestore, 'app-users', userId)).then(userDoc => {
            if(userDoc.exists()){
                setUser({id: userDoc.id, ...userDoc.data()} as User);
            } else {
                setUser(null);
            }
        });

        const q = query(collection(firestore, 'shifts'), where('userId', '==', userId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const userShifts = snapshot.docs
                .map(d => ({id: d.id, ...d.data()} as Shift))
                .filter(s => s.endTime)
                .sort((a,b) => new Date(b.startTime!).getTime() - new Date(a.startTime!).getTime());
            setShifts(userShifts);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, firestore]);

    const openDeleteConfirmation = (shift: Shift) => {
        setSelectedShift(shift);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteShift = async () => {
        if (!selectedShift || !firestore) return;
        try {
            await deleteDoc(doc(firestore, 'shifts', selectedShift.id));
            toast({ title: "Timbratura eliminata", variant: "destructive"});
        } catch(e) {
            toast({ title: "Errore", description: "Impossibile eliminare la timbratura.", variant: "destructive"});
        } finally {
            setIsDeleteDialogOpen(false);
            setSelectedShift(null);
        }
    };

    const openEditDialog = (shift: Shift) => {
        setSelectedShift(shift);
        if (shift.startTime && shift.endTime) {
            const start = new Date(shift.startTime);
            const end = new Date(shift.endTime);
            setEditDraft({
                startTime: `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`,
                endTime: `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`,
            });
        }
        setIsEditDialogOpen(true);
    }
    
    const handleEditShift = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedShift || !editDraft.startTime || !editDraft.endTime || !firestore) return;
        
        const newStartDate = new Date(selectedShift.startTime!);
        const [startHours, startMinutes] = editDraft.startTime.split(':').map(Number);
        newStartDate.setHours(startHours, startMinutes);

        const newEndDate = new Date(selectedShift.endTime!);
        const [endHours, endMinutes] = editDraft.endTime.split(':').map(Number);
        newEndDate.setHours(endHours, endMinutes);

        try {
            await updateDoc(doc(firestore, 'shifts', selectedShift.id), {
                startTime: newStartDate.toISOString(),
                endTime: newEndDate.toISOString()
            });
            toast({ title: "Timbratura aggiornata" });
        } catch(e) {
            toast({ title: "Errore", description: "Impossibile aggiornare la timbratura.", variant: "destructive"});
        } finally {
            setIsEditDialogOpen(false);
            setSelectedShift(null);
        }
    }

    if (loading) {
        return (
            <div className="p-4 md:p-6 space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!user) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <h2 className="text-2xl font-bold mb-4">Utente non trovato</h2>
            <Button onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
            </Button>
          </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <h2 className="text-3xl font-bold tracking-tight">Storico Timbrature di {user.username}</h2>
            
            <Card>
                <CardHeader>
                    <CardTitle>Riepilogo dei turni di lavoro</CardTitle>
                    <CardDescription>Visualizza e modifica tutti i turni completati, con dettaglio ore e straordinari.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[calc(100vh-20rem)] w-full pr-4">
                    {shifts.length > 0 ? (
                        <div className="space-y-4">
                        {shifts.map(shift => {
                            const duration = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
                            const expectedMinutes = (user?.expectedHours || 0) * 60;
                            const overtimeMinutes = Math.max(0, duration.workedMinutes - expectedMinutes);
                            const overtimeHours = formatMinutesToHours(overtimeMinutes);
                            
                            return (
                                <Card key={shift.id} className="overflow-hidden">
                                    <CardHeader className="flex flex-row justify-between items-start bg-muted/30 p-4">
                                        <div>
                                            <CardTitle className="text-lg">{new Date(shift.startTime!).toLocaleDateString('it-IT', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}</CardTitle>
                                             {shift.status === 'Approvato' ? (
                                                <Badge variant="default" className="mt-1"><CheckCircle className="mr-1 h-3 w-3" />Approvato</Badge>
                                             ) : (
                                                <Badge variant="secondary" className="mt-1">In attesa</Badge>
                                             )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(shift)}>
                                                <Pencil className="h-4 w-4" />
                                                <span className="sr-only">Modifica timbratura</span>
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => openDeleteConfirmation(shift)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                <span className="sr-only">Elimina timbratura</span>
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        <div className="w-full overflow-x-auto">
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm min-w-[400px]">
                                            <div className="font-medium space-y-2">
                                                <div className="flex items-center gap-2"><Clock className="text-primary h-5 w-5"/>Ingresso:
                                                    <span className="font-mono flex items-center gap-2">
                                                        {new Date(shift.startTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}
                                                        {shift.startLocation && (
                                                        <Link href={`https://www.google.com/maps/search/?api=1&query=${shift.startLocation.latitude},${shift.startLocation.longitude}`} target="_blank" rel="noopener noreferrer">
                                                            <MapPin className="h-4 w-4 text-blue-500 hover:text-blue-700" />
                                                        </Link>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2"><AlarmClockOff className="text-primary h-5 w-5"/>Uscita:
                                                    <span className="font-mono flex items-center gap-2">
                                                        {new Date(shift.endTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}
                                                        {shift.endLocation && (
                                                        <Link href={`https://www.google.com/maps/search/?api=1&query=${shift.endLocation.latitude},${shift.endLocation.longitude}`} target="_blank" rel="noopener noreferrer">
                                                            <MapPin className="h-4 w-4 text-blue-500 hover:text-blue-700" />
                                                        </Link>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 text-muted-foreground"><PauseCircle className="h-5 w-5"/>Pause: <span className="font-mono font-semibold text-foreground">{duration.pause}</span></div>
                                                <div className="flex items-center gap-2 font-medium"><Briefcase className="h-5 w-5"/>Ore Lavorate: <span className="font-mono font-bold">{duration.worked}</span></div>
                                                <div className="flex items-center gap-2 font-medium"><Timer className="h-5 w-5"/>Straordinario: <span className={`font-mono font-bold ${overtimeMinutes > 0 ? 'text-primary' : ''}`}>{overtimeMinutes > 0 ? overtimeHours : '-'}</span></div>
                                            </div>
                                          </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-16">
                            <p>Nessuna timbratura completata da mostrare.</p>
                        </div>
                    )}
                    </ScrollArea>
                </CardContent>
            </Card>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione non può essere annullata. La timbratura verrà eliminata in modo permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSelectedShift(null)}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteShift}>Conferma Eliminazione</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifica Orari Timbratura</DialogTitle>
                        <DialogDescription>
                            Aggiorna gli orari di ingresso e uscita per questo turno. Le pause non sono modificabili.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedShift && (
                    <form id="edit-shift-form" onSubmit={handleEditShift}>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 items-center gap-4">
                                <Label htmlFor="start-time">Orario Ingresso</Label>
                                <Input 
                                    id="start-time" 
                                    type="time" 
                                    value={editDraft.startTime}
                                    onChange={(e) => setEditDraft(d => ({...d, startTime: e.target.value}))}
                                />
                            </div>
                            <div className="grid grid-cols-2 items-center gap-4">
                                <Label htmlFor="end-time">Orario Uscita</Label>
                                <Input 
                                    id="end-time" 
                                    type="time" 
                                    value={editDraft.endTime}
                                    onChange={(e) => setEditDraft(d => ({...d, endTime: e.target.value}))}
                                />
                            </div>
                        </div>
                         <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Annulla</Button>
                            <Button type="submit">Salva Modifiche</Button>
                        </DialogFooter>
                    </form>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    );
}
