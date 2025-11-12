"use client";

import * as React from "react";
import { CheckCircle, Briefcase, Clock, PauseCircle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';


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


const calculateDuration = (start: string | null, end: string | null, pauses: Shift['pauses']) => {
    if (!start || !end) return { total: 'N/A', pause: 'N/A', worked: 'N/A' };

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
    };
};

export default function ShiftApprovalPage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [pendingShifts, setPendingShifts] = React.useState<Shift[]>([]);

    React.useEffect(() => {
        if (!firestore) return;
        const shiftsCollection = collection(firestore, 'shifts');
        const q = query(shiftsCollection, where('status', '==', 'In attesa'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const shiftsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift));
            // Filter for completed shifts on the client side
            const completedPendingShifts = shiftsData.filter(s => !!s.endTime);
            setPendingShifts(completedPendingShifts.sort((a,b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime()));
        });

        return () => unsubscribe();
    }, [firestore]);

    const handleApproveShift = async (shiftId: string) => {
        if (!firestore) return;
        
        const shiftRef = doc(firestore, 'shifts', shiftId);
        try {
            await updateDoc(shiftRef, { status: 'Approvato' });
            toast({
                title: "Turno Approvato",
                description: "Il turno di lavoro è stato approvato con successo.",
            });
        } catch (error) {
             toast({
                title: "Errore",
                description: "Impossibile approvare il turno.",
                variant: 'destructive'
            });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Approvazione Turni di Lavoro</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Turni in Attesa di Approvazione</CardTitle>
                    <CardDescription>
                        Controlla e approva i turni completati dagli operatori.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {pendingShifts.length === 0 ? (
                         <div className="text-center text-muted-foreground py-16">
                            <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-4">Nessun turno da approvare. Ottimo lavoro!</p>
                        </div>
                    ) : (
                        pendingShifts.map(shift => {
                             const duration = calculateDuration(shift.startTime, shift.endTime, shift.pauses);
                            return (
                                <Card key={shift.id}>
                                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3">
                                        <div>
                                            <CardTitle className="text-xl">{shift.userName}</CardTitle>
                                            <CardDescription>
                                                {new Date(shift.startTime!).toLocaleDateString('it-IT', {weekday: 'long', day: 'numeric', month: 'long'})}
                                            </CardDescription>
                                        </div>
                                        <Button size="sm" onClick={() => handleApproveShift(shift.id)}>
                                            <CheckCircle className="mr-2 h-4 w-4"/>
                                            Approva Turno
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="space-y-2 text-sm">
                                         <div className="flex items-center gap-2"><Clock className="text-primary h-5 w-5"/>Ingresso: <span className="font-mono">{new Date(shift.startTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}</span> - Uscita: <span className="font-mono">{new Date(shift.endTime!).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}</span></div>
                                         <div className="flex items-center gap-2 text-muted-foreground"><PauseCircle className="h-5 w-5"/>Pause: <span className="font-mono font-semibold text-foreground">{duration.pause}</span></div>
                                         <div className="flex items-center gap-2 font-medium"><Briefcase className="h-5 w-5"/>Ore Lavorate: <span className="font-mono font-bold">{duration.worked}</span></div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
