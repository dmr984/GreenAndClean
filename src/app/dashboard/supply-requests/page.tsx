'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, runTransaction, query, orderBy, where } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

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

export default function AdminSupplyRequestsPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [allRequests, setAllRequests] = useState<SupplyRequest[]>([]);
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
            setAllRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupplyRequest)));
            setIsLoading(false);
        }, error => {
            console.error("Error fetching supply requests:", error);
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ operation: 'list', path: 'supply-requests'}));
            } else {
                toast({ title: "Errore", description: "Impossibile caricare le richieste di fornitura.", variant: "destructive" });
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [firestore, user, toast]);

    const { pendingRequests, historicalRequests } = useMemo(() => {
        const pending = allRequests.filter(r => r.status === 'in_attesa');
        const historical = allRequests.filter(r => r.status !== 'in_attesa');
        return { pendingRequests, historicalRequests };
    }, [allRequests]);


    const openApproveDialog = (request: SupplyRequest) => {
        setSelectedRequest(request);
        setApprovedQuantity(String(request.requestedQuantity));
        setIsApproveDialogOpen(true);
    };

    const handleApproveRequest = async () => {
        if (!firestore || !selectedRequest) return;
        const finalQuantity = parseInt(approvedQuantity, 10);
        if (isNaN(finalQuantity) || finalQuantity < 0) {
            toast({ title: "Quantità Invalida", variant: "destructive"});
            return;
        }

        const requestRef = doc(firestore, 'supply-requests', selectedRequest.id);
        const productRef = doc(firestore, 'products', selectedRequest.productId);
        const updatePayload = { status: 'approvata' as const, approvedQuantity: finalQuantity, viewedByOperator: false };

        try {
            await runTransaction(firestore, async (transaction) => {
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) throw new Error("Prodotto non trovato.");
                const currentStock = productDoc.data().quantity;
                if (currentStock < finalQuantity) throw new Error(`Scorte insufficienti. Disponibili: ${currentStock}.`);
                transaction.update(productRef, { quantity: currentStock - finalQuantity });
                transaction.update(requestRef, updatePayload);
            });
            toast({ title: "Successo", description: "Richiesta approvata e magazzino aggiornato." });
        } catch (error: any) {
             toast({ title: "Errore", description: error.message || "Impossibile approvare la richiesta.", variant: "destructive"});
        } finally {
            setIsApproveDialogOpen(false);
        }
    };
    
    const handleRejectRequest = async (request: SupplyRequest) => {
        if (!firestore) return;
        const requestRef = doc(firestore, 'supply-requests', request.id);
        await updateDoc(requestRef, { status: 'rifiutata' as const, viewedByOperator: false }).catch(err => {
            console.error("Error rejecting request:", err);
            toast({ title: 'Errore', description: 'Impossibile rifiutare la richiesta.', variant: 'destructive'})
        });
    };

    if (isUserLoading || isLoading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground">Accesso negato.</div>;
    }

    const renderTable = (requests: SupplyRequest[], isHistory: boolean = false) => (
         <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Operatore</TableHead>
                        <TableHead>Prodotto</TableHead>
                        <TableHead>Qtà Rich.</TableHead>
                        <TableHead>Data</TableHead>
                        {isHistory && <TableHead>Stato</TableHead>}
                        {!isHistory && <TableHead className="text-right">Azioni</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {requests.length === 0 ? (
                        <TableRow><TableCell colSpan={isHistory ? 5 : 5} className="h-24 text-center">Nessuna richiesta trovata.</TableCell></TableRow>
                    ) : (
                        requests.map(req => (
                            <TableRow key={req.id}>
                                <TableCell className="font-medium">{req.username}</TableCell>
                                <TableCell>{req.productName}</TableCell>
                                <TableCell>{req.requestedQuantity}</TableCell>
                                <TableCell>{req.createdAt ? format(req.createdAt.toDate(), 'dd/MM/yyyy') : 'N/D'}</TableCell>
                                {isHistory ? (
                                    <TableCell>
                                         <Badge variant={req.status === 'approvata' ? 'secondary' : 'destructive'}>
                                            {req.status}
                                        </Badge>
                                    </TableCell>
                                ) : (
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => openApproveDialog(req)}><CheckCircle className="h-5 w-5 text-green-500" /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleRejectRequest(req)}><XCircle className="h-5 w-5 text-red-500" /></Button>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <ClipboardList className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Richieste Forniture</h1>
                    <p className="text-muted-foreground">Approva o rifiuta le richieste di materiale degli operatori.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Richieste in Attesa</CardTitle>
                </CardHeader>
                <CardContent>
                    {renderTable(pendingRequests)}
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Storico Richieste</CardTitle>
                </CardHeader>
                <CardContent>
                    {renderTable(historicalRequests, true)}
                </CardContent>
            </Card>

            <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approva Richiesta</AlertDialogTitle>
                        <AlertDialogDescription>
                           Conferma o modifica la quantità da approvare. Verrà scalata dal magazzino.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="approved-quantity" className="text-right">Quantità</Label>
                            <Input id="approved-quantity" type="number" value={approvedQuantity} onChange={(e) => setApprovedQuantity(e.target.value)} className="col-span-3"/>
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleApproveRequest}>Approva e Aggiorna Magazzino</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}