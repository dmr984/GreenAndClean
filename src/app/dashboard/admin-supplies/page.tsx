
'use client';
import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, runTransaction } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClipboardCheck, Loader2, CheckCircle, XCircle } from 'lucide-react';

type SupplyRequest = {
    id: string;
    userId: string;
    username: string;
    productId: string;
    productName: string;
    requestedQuantity: number;
    approvedQuantity?: number;
    status: 'in_attesa' | 'approvata' | 'rifiutata';
    createdAt: any;
};

export default function AdminSuppliesPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [requests, setRequests] = useState<SupplyRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [selectedRequest, setSelectedRequest] = useState<SupplyRequest | null>(null);
    const [approvedQuantity, setApprovedQuantity] = useState('');
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);

    useEffect(() => {
        if (!firestore || !user || user.role !== 'admin') {
            setIsLoading(false);
            return;
        }
        
        const requestsQuery = query(collection(firestore, 'supply-requests'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(requestsQuery, snapshot => {
            setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupplyRequest)));
            setIsLoading(false);
        }, error => {
            console.error("Error fetching supply requests:", error);
            if (error.code === 'permission-denied' && firestore) {
                const contextualError = new FirestorePermissionError({ operation: 'list', path: 'supply-requests' });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile caricare le richieste di forniture.", variant: "destructive" });
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [firestore, user, toast]);

    const openApproveDialog = (request: SupplyRequest) => {
        setSelectedRequest(request);
        setApprovedQuantity(String(request.requestedQuantity));
        setIsApproveDialogOpen(true);
    };

    const handleApproveRequest = async () => {
        if (!firestore || !selectedRequest) return;
        
        const finalQuantity = parseInt(approvedQuantity, 10);
        if (isNaN(finalQuantity) || finalQuantity < 0) {
            toast({ title: "Quantità Invalida", description: "Inserisci una quantità numerica valida.", variant: "destructive"});
            return;
        }

        const requestRef = doc(firestore, 'supply-requests', selectedRequest.id);
        const productRef = doc(firestore, 'products', selectedRequest.productId);
        const updatePayload = { status: 'approvata' as const, approvedQuantity: finalQuantity };

        try {
            await runTransaction(firestore, async (transaction) => {
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) {
                    throw new Error("Prodotto non trovato in magazzino.");
                }

                const currentStock = productDoc.data().quantity;
                if (currentStock < finalQuantity) {
                    throw new Error(`Scorte insufficienti. Disponibili: ${currentStock}.`);
                }

                transaction.update(productRef, { quantity: currentStock - finalQuantity });
                transaction.update(requestRef, updatePayload);
            });

            toast({ title: "Successo", description: "Richiesta approvata e magazzino aggiornato." });
        } catch (error: any) {
            console.error("Error approving request:", error);
            if (error.code === 'permission-denied' || error.message.includes('permission-denied')) { // runTransaction can wrap errors
                 const contextualError = new FirestorePermissionError({
                    operation: 'update',
                    path: `supply-requests/${selectedRequest.id} and products/${selectedRequest.productId}`,
                    requestResourceData: updatePayload
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: error.message || "Impossibile approvare la richiesta.", variant: "destructive"});
            }
        } finally {
            setIsApproveDialogOpen(false);
            setSelectedRequest(null);
            setApprovedQuantity('');
        }
    };
    
    const handleRejectRequest = async (request: SupplyRequest) => {
        if (!firestore) return;
        const requestRef = doc(firestore, 'supply-requests', request.id);
        const updatePayload = { status: 'rifiutata' as const };
        updateDoc(requestRef, updatePayload)
            .then(() => {
                toast({ title: "Successo", description: "Richiesta rifiutata." });
            })
            .catch((error: any) => {
                console.error("Error rejecting request:", error);
                 if (error.code === 'permission-denied') {
                     const contextualError = new FirestorePermissionError({
                        operation: 'update',
                        path: requestRef.path,
                        requestResourceData: updatePayload
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({ title: "Errore", description: "Impossibile rifiutare la richiesta.", variant: "destructive" });
                }
            });
    };

    if (isUserLoading || isLoading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground">Accesso negato.</div>;
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <ClipboardCheck className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Gestione Richieste Forniture</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                     <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Operatore</TableHead>
                                    <TableHead>Prodotto</TableHead>
                                    <TableHead>Qtà Rich.</TableHead>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Stato</TableHead>
                                    <TableHead className="text-right">Azioni</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Nessuna richiesta trovata.</TableCell></TableRow>
                                ) : (
                                    requests.map(req => (
                                        <TableRow key={req.id}>
                                            <TableCell className="font-medium">{req.username}</TableCell>
                                            <TableCell>{req.productName}</TableCell>
                                            <TableCell>{req.requestedQuantity}</TableCell>
                                            <TableCell>{req.createdAt?.toDate().toLocaleDateString('it-IT')}</TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    req.status === 'approvata' ? 'secondary'
                                                    : req.status === 'rifiutata' ? 'destructive'
                                                    : 'default'
                                                }>{req.status.replace('_', ' ')}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {req.status === 'in_attesa' && (
                                                    <div className="flex gap-2 justify-end">
                                                        <Button variant="ghost" size="icon" onClick={() => openApproveDialog(req)}>
                                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => handleRejectRequest(req)}>
                                                            <XCircle className="h-5 w-5 text-red-500" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approva Richiesta</AlertDialogTitle>
                        <AlertDialogDescription>
                            Stai approvando la richiesta di <strong>{selectedRequest?.productName}</strong> per <strong>{selectedRequest?.username}</strong>. Puoi modificare la quantità da approvare.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="approved-quantity" className="text-right">Quantità</Label>
                            <Input
                                id="approved-quantity"
                                type="number"
                                value={approvedQuantity}
                                onChange={(e) => setApprovedQuantity(e.target.value)}
                                className="col-span-3"
                                min="0"
                            />
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleApproveRequest}>Approva e Aggiorna Magazzino</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

    