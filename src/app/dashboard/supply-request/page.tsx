'use client';
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, where, writeBatch, doc, deleteDoc } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PackageSearch, Loader2, Send, Circle, Trash2, AlertCircle } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

type Product = {
    id: string;
    name: string;
    quantity: number;
};

type SupplyRequest = {
    id: string;
    productName: string;
    requestedQuantity: number;
    approvedQuantity?: number;
    status: 'in_attesa' | 'approvata' | 'rifiutata';
    createdAt: any;
    viewedByOperator?: boolean;
};

type Quantities = {
  [productId: string]: number | '';
}

export default function SupplyRequestPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [products, setProducts] = useState<Product[]>([]);
    const [myRequests, setMyRequests] = useState<SupplyRequest[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [requestToDelete, setRequestToDelete] = useState<SupplyRequest | null>(null);
    const [quantities, setQuantities] = useState<Quantities>({});

    useEffect(() => {
        if (!firestore) return;
        const productsQuery = query(collection(firestore, 'products'), orderBy('name'));
        const unsubscribe = onSnapshot(productsQuery, snapshot => {
            setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
            setIsLoadingProducts(false);
        }, error => {
            console.error("Error fetching products:", error);
            if (error.code === 'permission-denied' && firestore) {
                const contextualError = new FirestorePermissionError({ operation: 'list', path: 'products' });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile caricare i prodotti.", variant: "destructive" });
            }
            setIsLoadingProducts(false);
        });
        return () => unsubscribe();
    }, [firestore, toast]);

    useEffect(() => {
        if (!firestore || !user?.id) {
            if (!isUserLoading) setIsLoadingRequests(false);
            return;
        }

        setIsLoadingRequests(true);
        const requestsQuery = query(
            collection(firestore, 'supply-requests'), 
            where('userId', '==', user.id)
        );

        const unsubscribe = onSnapshot(requestsQuery, snapshot => {
            const allRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupplyRequest));
            allRequests.sort((a, b) => {
                if (a.createdAt && b.createdAt) {
                    return b.createdAt.toMillis() - a.createdAt.toMillis();
                }
                if (a.createdAt) return -1;
                if (b.createdAt) return 1;
                return 0;
            });
            
            setMyRequests(allRequests);
            setIsLoadingRequests(false);

            const unread = allRequests.filter(r => r.viewedByOperator === false);
            if(unread.length > 0 && firestore && user) {
                const batch = writeBatch(firestore);
                unread.forEach(req => {
                    const reqRef = doc(firestore, 'supply-requests', req.id);
                    batch.update(reqRef, { viewedByOperator: true });
                });
                batch.commit().catch(console.error);
            }

        }, error => {
            console.error("Error fetching request history:", error);
            if (error.code === 'permission-denied' && firestore) {
                const contextualError = new FirestorePermissionError({
                    operation: 'list',
                    path: 'supply-requests', 
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                 toast({ title: "Errore", description: "Impossibile caricare lo storico delle richieste.", variant: "destructive" });
            }
            setIsLoadingRequests(false);
        });
        return () => unsubscribe();

    }, [firestore, user, toast, isUserLoading]);
    
    const handleQuantityChange = (productId: string, value: string) => {
        const numValue = value === '' ? '' : parseInt(value, 10);
        if (numValue === '' || (numValue >= 0 && !isNaN(numValue))) {
            setQuantities(prev => ({ ...prev, [productId]: numValue }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !user) return;
        
        const requestsToCreate = Object.entries(quantities)
            .map(([productId, quantity]) => ({
                product: products.find(p => p.id === productId),
                quantity: typeof quantity === 'number' ? quantity : 0,
            }))
            .filter(item => item.product && item.quantity > 0);

        if (requestsToCreate.length === 0) {
            toast({ title: "Nessuna richiesta da inviare", description: "Inserisci una quantità per almeno un prodotto.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        const batch = writeBatch(firestore);
        const supplyRequestsCollection = collection(firestore, 'supply-requests');

        requestsToCreate.forEach(({ product, quantity }) => {
            const newRequestRef = doc(supplyRequestsCollection);
            batch.set(newRequestRef, {
                userId: user.id,
                username: user.username,
                productId: product!.id,
                productName: product!.name,
                requestedQuantity: quantity,
                status: 'in_attesa' as const,
                createdAt: serverTimestamp(),
                viewedByOperator: true,
            });
        });

        try {
            await batch.commit();
            toast({ title: "Successo", description: "Le tue richieste sono state inviate." });
            setQuantities({});
        } catch (error: any) {
            console.error("Error creating supply requests:", error);
            if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({ operation: 'create', path: supplyRequestsCollection.path });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile inviare le richieste.", variant: "destructive" });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancelRequest = async () => {
        if (!firestore || !requestToDelete) return;
        const requestRef = doc(firestore, 'supply-requests', requestToDelete.id);
        
        try {
            await deleteDoc(requestRef);
            toast({ title: "Successo", description: "Richiesta annullata." });
        } catch (error: any) {
            if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({ operation: 'delete', path: requestRef.path });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile annullare la richiesta.", variant: "destructive"});
            }
        } finally {
            setRequestToDelete(null);
        }
    };
    
    if (isUserLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <>
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <PackageSearch className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Crea Nuova Richiesta Fornitura</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {isLoadingProducts ? (
                            <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : (
                           <ScrollArea className="h-96">
                             <Table>
                               <TableHeader>
                                 <TableRow>
                                   <TableHead>Prodotto</TableHead>
                                   <TableHead className="w-[120px]">Quantità</TableHead>
                                 </TableRow>
                               </TableHeader>
                               <TableBody>
                                 {products.map(product => (
                                   <TableRow key={product.id}>
                                     <TableCell>
                                       <Label htmlFor={`quantity-${product.id}`} className="font-medium">{product.name}</Label>
                                       {product.quantity === 0 && <p className="text-xs text-destructive">Esaurito</p>}
                                     </TableCell>
                                     <TableCell>
                                       <Input 
                                         id={`quantity-${product.id}`} 
                                         type="number"
                                         placeholder="0"
                                         value={quantities[product.id] || ''}
                                         onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                                         min="0"
                                         disabled={product.quantity === 0 || isSubmitting}
                                       />
                                     </TableCell>
                                   </TableRow>
                                 ))}
                               </TableBody>
                             </Table>
                           </ScrollArea>
                        )}
                        <Button type="submit" className="w-full" disabled={isSubmitting || isLoadingProducts}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Invia Richieste
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Storico Richieste</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingRequests ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <ScrollArea className="h-96">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead></TableHead>
                                        <TableHead>Prodotto</TableHead>
                                        <TableHead>Qtà Rich.</TableHead>
                                        <TableHead>Qtà Appr.</TableHead>
                                        <TableHead>Stato</TableHead>
                                        <TableHead className="w-[100px] text-right">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {myRequests.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">Nessuna richiesta trovata.</TableCell>
                                        </TableRow>
                                    ) : (
                                        myRequests.map(req => (
                                            <TableRow key={req.id}>
                                                 <TableCell>
                                                    {req.viewedByOperator === false && <Circle fill="red" className="h-2 w-2 text-red-500" />}
                                                </TableCell>
                                                <TableCell>{req.productName}</TableCell>
                                                <TableCell>{req.requestedQuantity}</TableCell>
                                                <TableCell>{req.status === 'approvata' ? req.approvedQuantity : '-'}</TableCell>
                                                <TableCell>
                                                    <Badge variant={
                                                        req.status === 'approvata' ? 'secondary'
                                                        : req.status === 'rifiutata' ? 'destructive'
                                                        : 'default'
                                                    }>{req.status.replace('_', ' ')}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  {req.status === 'in_attesa' && (
                                                    <Button variant="ghost" size="icon" onClick={() => setRequestToDelete(req)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                  )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
        </div>
        <AlertDialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Annullare la richiesta?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione è permanente. Sei sicuro di voler annullare questa richiesta di fornitura?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Chiudi</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelRequest}>Annulla Richiesta</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
