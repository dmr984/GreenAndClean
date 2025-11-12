
"use client";

import * as React from "react";
import { CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";

type ExtraShiftRequest = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  status: 'pending' | 'approved';
};


export default function ExtraShiftApprovalPage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [pendingRequests, setPendingRequests] = React.useState<ExtraShiftRequest[]>([]);

    React.useEffect(() => {
        if (!firestore) return;

        const q = query(collection(firestore, 'extra-shift-requests'), where('status', '==', 'pending'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtraShiftRequest));
            setPendingRequests(requests.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        });

        return () => unsubscribe();
    }, [firestore]);

    const handleApproveRequest = async (requestId: string) => {
        if (!firestore) return;
        
        const requestRef = doc(firestore, 'extra-shift-requests', requestId);
        try {
            await updateDoc(requestRef, { status: 'approved' });
            toast({
                title: "Richiesta Approvata",
                description: "L'operatore è stato autorizzato a effettuare una nuova timbratura.",
            });
        } catch (error) {
            toast({
                title: "Errore",
                description: "Impossibile approvare la richiesta.",
                variant: 'destructive'
            });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Approvazione Timbrature Extra</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Richieste in Attesa di Approvazione</CardTitle>
                    <CardDescription>
                        Approva le richieste degli operatori per effettuare una seconda timbratura nella stessa giornata.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {pendingRequests.length === 0 ? (
                         <div className="text-center text-muted-foreground py-16">
                            <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-4">Nessuna richiesta di timbratura extra. Ottimo lavoro!</p>
                        </div>
                    ) : (
                        pendingRequests.map(req => (
                            <Card key={req.id}>
                                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3">
                                    <div>
                                        <CardTitle className="text-xl">{req.userName}</CardTitle>
                                        <CardDescription>
                                            Data: {new Date(req.date).toLocaleDateString('it-IT', {weekday: 'long', day: 'numeric', month: 'long'})}
                                        </CardDescription>
                                    </div>
                                    <Button size="sm" onClick={() => handleApproveRequest(req.id)}>
                                        <CheckCircle className="mr-2 h-4 w-4"/>
                                        Approva Richiesta
                                    </Button>
                                </CardHeader>
                            </Card>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
