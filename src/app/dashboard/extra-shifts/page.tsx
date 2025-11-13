"use client";

import * as React from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useCollection, useMemoFirebase, FirestorePermissionError, errorEmitter } from "@/firebase";
import { collection, doc, query, updateDoc, where } from "firebase/firestore";

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

    const pendingRequestsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'extra-shift-requests'), where('status', '==', 'pending'));
    }, [firestore]);

    const { data: pendingRequests, isLoading: loading, error: collectionError } = useCollection<ExtraShiftRequest>(pendingRequestsQuery);

    React.useEffect(() => {
        if (collectionError) {
             if (!(collectionError instanceof FirestorePermissionError)) {
                toast({
                    title: "Errore di Caricamento",
                    description: "Impossibile caricare le richieste.",
                    variant: 'destructive'
                });
             }
        }
    }, [collectionError, toast]);
    
    const sortedRequests = React.useMemo(() => {
        if (!pendingRequests) return [];
        return [...pendingRequests].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [pendingRequests]);


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
            const contextualError = new FirestorePermissionError({
                path: requestRef.path,
                operation: 'update',
                requestResourceData: { status: 'approved' }
            });
            errorEmitter.emit('permission-error', contextualError);
        }
    };
    
    if (loading) {
        return <p>Caricamento richieste...</p>
    }
    
    if (collectionError) {
        return (
             <div className="text-center text-red-500 py-12">
                <p>Errore di permessi. Non è possibile visualizzare le richieste di timbratura extra.</p>
                <p className="text-xs text-muted-foreground mt-2">Prova a ricaricare o contatta l'assistenza.</p>
            </div>
        )
    }

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
                    {sortedRequests.length === 0 ? (
                         <div className="text-center text-muted-foreground py-16">
                            <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-4">Nessuna richiesta di timbratura extra. Ottimo lavoro!</p>
                        </div>
                    ) : (
                        sortedRequests.map(req => (
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
