'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, runTransaction, query, orderBy, where, getDocs, writeBatch, getDoc } from 'firebase/firestore';
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
import { ClipboardList, Loader2, CheckCircle, XCircle, Archive, Info } from 'lucide-react';
import { format } from 'date-fns';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle } from '@/components/ui/responsive-dialog';

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

type Product = {
    id: string;
    name: string;
    quantity: number;
};


export default function AdminSupplyRequestsPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [allRequests, setAllRequests] = useState<SupplyRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [selectedRequest, setSelectedRequest] = useState<SupplyRequest | null>(null);
    const [currentStock, setCurrentStock] = useState<number | null>(null);
    const [approvedQuantity, setApprovedQuantity] = useState('');
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    
    const [isCleaning, setIsCleaning] = useState(false);
    const [isCleanConfirmOpen, setIsCleanConfirmOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

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
        return { pendingRequests: pending, historicalRequests: historical };
    }, [allRequests]);


    const openApproveDialog = async (request: SupplyRequest) => {
        if (!firestore) return;
        setSelectedRequest(request);
        setApprovedQuantity(String(request.requestedQuantity));

        // Fetch current stock
        const productRef = doc(firestore, 'products', request.productId);
        const productSnap = await getDoc(productRef);
        if(productSnap.exists()){
            setCurrentStock(productSnap.data().quantity);
        } else {
            setCurrentStock(0);
            toast({ title: 'Prodotto non trovato', variant: 'destructive'});
        }
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
            setSelectedRequest(null);
            setCurrentStock(null);
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
    
    const handleCleanHistory = async () => {
        if(!firestore) return;
        setIsCleaning(true);

        const q = query(collection(firestore, 'supply-requests'), where('status', '!=', 'in_attesa'));
        
        try {
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                toast({ title: 'Nessun dato', description: 'Non ci sono richieste storiche da eliminare.' });
                return;
            }
            const batch = writeBatch(firestore);
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            toast({ title: 'Successo', description: 'Lo storico delle richieste è stato pulito.' });
        } catch (error) {
            console.error("Error cleaning history: ", error);
            toast({ title: 'Errore', description: "Impossibile pulire lo storico.", variant: "destructive" });
        } finally {
            setIsCleaning(false);
            setIsCleanConfirmOpen(false);
        }
    };

    if (isUserLoading || isLoading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground">Accesso negato.</div>;
    }

    const renderTable = (requests: SupplyRequest[], isHistory: boolean = false) => (
         <div className="border rounded-md overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Operatore</TableHead>
                        <TableHead>Prodotto</TableHead>
                        <TableHead>Qtà Rich.</TableHead>
                        {isHistory && <TableHead>Qtà Appr.</TableHead>}
                        <TableHead>Data</TableHead>
                        {isHistory && <TableHead>Stato</TableHead>}
                        {!isHistory && <TableHead className="text-right">Azioni</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {requests.length === 0 ? (
                        <TableRow><TableCell colSpan={isHistory ? 6 : 5} className="h-24 text-center">Nessuna richiesta trovata.</TableCell></TableRow>
                    ) : (
                        requests.map(req => (
                            <TableRow key={req.id}>
                                <TableCell className="font-medium">{req.username}</TableCell>
                                <TableCell>{req.productName}</TableCell>
                                <TableCell>{req.requestedQuantity}</TableCell>
                                {isHistory && <TableCell>{req.approvedQuantity ?? '-'}</TableCell>}
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
        <>
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <ClipboardList className="h-8 w-8 text-primary" />
                    <div>
                         <div className='flex items-center gap-2'>
                           <h1 className="text-3xl font-bold tracking-tight">Richieste Forniture</h1>
                            <Button variant="ghost" size="icon" onClick={() => setIsHelpOpen(true)}><Info className="h-5 w-5"/></Button>
                         </div>
                        <p className="text-muted-foreground">Approva o rifiuta le richieste di materiale degli operatori.</p>
                    </div>
                </div>
                 <Button variant="destructive" onClick={() => setIsCleanConfirmOpen(true)} disabled={isCleaning}>
                     {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Archive className="mr-2 h-4 w-4" />}
                    Pulisci Storico
                </Button>
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
                        <AlertDialogTitle>Approva: {selectedRequest?.productName}</AlertDialogTitle>
                        <AlertDialogDescription>
                           Conferma o modifica la quantità da approvare. Verrà scalata dal magazzino.
                           <br />
                           <span className='font-bold mt-2 inline-block'>Giacenza attuale: {currentStock ?? <Loader2 className='h-4 w-4 animate-spin inline-block ml-1' />}</span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="approved-quantity" className="text-right">Quantità</Label>
                            <Input id="approved-quantity" type="number" value={approvedQuantity} onChange={(e) => setApprovedQuantity(e.target.value)} className="col-span-3"/>
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSelectedRequest(null)}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleApproveRequest}>Approva e Aggiorna</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
        
        <AlertDialog open={isCleanConfirmOpen} onOpenChange={setIsCleanConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Questa azione è irreversibile. Verranno eliminate tutte le richieste di fornitura approvate e rifiutate. Le richieste in attesa non verranno toccate.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCleanHistory} disabled={isCleaning}>
                        {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Conferma ed Elimina
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <ResponsiveDialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>Guida alla Gestione Forniture</ResponsiveDialogTitle>
                </ResponsiveDialogHeader>
                <div className="py-4 space-y-4 text-sm">
                    <div>
                        <h4 className="font-semibold mb-1">Approvazione Richieste</h4>
                        <p className="text-muted-foreground">
                            Quando un operatore fa una richiesta, appare nella tabella "Richieste in Attesa". Clicca sul pulsante verde <CheckCircle className="h-4 w-4 inline-block text-green-500"/> per approvare. Si aprirà una finestra dove potrai confermare o modificare la quantità. L'approvazione scalerà automaticamente la quantità dal magazzino.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-1">Giacenza Magazzino</h4>
                        <p className="text-muted-foreground">
                           Prima di approvare, controlla sempre la "Giacenza attuale" per assicurarti di avere abbastanza scorte. Non puoi approvare una quantità superiore a quella disponibile.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-1">Rifiuto e Storico</h4>
                        <p className="text-muted-foreground">
                           Usa il pulsante rosso <XCircle className="h-4 w-4 inline-block text-red-500"/> per rifiutare una richiesta. Tutte le richieste approvate e rifiutate vengono spostate nello "Storico Richieste".
                        </p>
                    </div>
                     <div>
                        <h4 className="font-semibold mb-1">Pulizia Storico</h4>
                        <p className="text-muted-foreground">
                           Periodicamente, puoi pulire lo storico delle richieste completate usando il pulsante "Pulisci Storico". Questa azione è irreversibile ed elimina solo le richieste approvate o rifiutate.
                        </p>
                    </div>
                </div>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
        </>
    );
}
