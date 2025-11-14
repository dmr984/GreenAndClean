"use client";

import * as React from "react";
import { XCircle, Briefcase, Clock, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Shift = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  pauses: { startTime: string; endTime: string | null }[];
  status: 'In attesa' | 'Approvato';
};

export default function CancelClockingPage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [activeShifts, setActiveShifts] = React.useState<Shift[]>([]);
    const [isCanceling, setIsCanceling] = React.useState<Shift | null>(null);

    React.useEffect(() => {
        if (!firestore) return;
        const shiftsCollection = collection(firestore, 'shifts');
        // Query for shifts that are "In attesa" and have NOT ended
        const q = query(shiftsCollection, where('status', '==', 'In attesa'), where('endTime', '==', null));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const shiftsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift))
                .sort((a,b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());
            setActiveShifts(shiftsData);
        }, (err) => {
            const contextualError = new FirestorePermissionError({
                path: 'shifts',
                operation: 'list'
            });
            errorEmitter.emit('permission-error', contextualError);
        });

        return () => unsubscribe();
    }, [firestore, toast]);

    const handleCancelShift = async () => {
        if (!firestore || !isCanceling) return;
        
        const shiftRef = doc(firestore, 'shifts', isCanceling.id);
        try {
            await deleteDoc(shiftRef);
            toast({
                title: "Timbratura Annullata",
                description: `La timbratura di ${isCanceling.userName} è stata annullata.`,
                variant: "destructive"
            });
        } catch (error) {
             const contextualError = new FirestorePermissionError({
                path: shiftRef.path,
                operation: 'delete'
             });
             errorEmitter.emit('permission-error', contextualError);
        } finally {
            setIsCanceling(null);
        }
    };
    
    const getShiftStatusText = (shift: Shift) => {
        const isOnPause = shift.pauses.some(p => !p.endTime);
        return isOnPause ? "In Pausa" : "Turno Attivo";
    }

    return (
        <>
        <Card>
            <CardHeader>
                <CardTitle>Annulla Timbrature in Corso</CardTitle>
                <CardDescription>
                    Visualizza tutti i turni attualmente attivi e annullali in caso di errore da parte di un operatore. L'annullamento è definitivo.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {activeShifts.length === 0 ? (
                     <div className="text-center text-muted-foreground py-16">
                        <Briefcase className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-4">Nessuna timbratura attiva al momento.</p>
                    </div>
                ) : (
                    activeShifts.map(shift => (
                        <Card key={shift.id}>
                            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3">
                                <div>
                                    <CardTitle className="text-xl">{shift.userName}</CardTitle>
                                    <CardDescription>
                                        {shift.startTime ? new Date(shift.startTime).toLocaleDateString('it-IT', {weekday: 'long', day: 'numeric', month: 'long'}) : 'Data non disponibile'}
                                    </CardDescription>
                                </div>
                                <Button size="sm" variant="destructive" onClick={() => setIsCanceling(shift)}>
                                    <XCircle className="mr-2 h-4 w-4"/>
                                    Annulla Timbratura
                                </Button>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                 <div className="flex items-center gap-2 font-semibold">
                                    {shift.pauses.some(p => !p.endTime) ? <PlayCircle className="text-yellow-500 h-5 w-5"/> : <Clock className="text-green-500 h-5 w-5"/>}
                                    Stato: {getShiftStatusText(shift)}
                                 </div>
                                 <div className="flex items-center gap-2 text-muted-foreground">
                                    <Clock className="h-5 w-5"/>
                                    Inizio: <span className="font-mono font-semibold text-foreground">{shift.startTime ? new Date(shift.startTime).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'}) : '--:--'}</span>
                                 </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </CardContent>
        </Card>
        <AlertDialog open={!!isCanceling} onOpenChange={(open) => !open && setIsCanceling(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione non può essere annullata. La timbratura attiva per <span className="font-bold">{isCanceling?.userName}</span> verrà eliminata definitivamente. L'operatore dovrà iniziare un nuovo turno.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelShift}>Conferma Annullamento</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
