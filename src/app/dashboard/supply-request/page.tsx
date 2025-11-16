
'use client';
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PackageSearch, Loader2, Send } from 'lucide-react';

type Product = {
    id: string;
    name: string;
    // Quantity is intentionally omitted for operators
};

type SupplyRequest = {
    id: string;
    productName: string;
    requestedQuantity: number;
    approvedQuantity?: number;
    status: 'in_attesa' | 'approvata' | 'rifiutata';
    createdAt: any;
};

export default function SupplyRequestPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [products, setProducts] = useState<Product[]>([]);
    const [myRequests, setMyRequests] = useState<SupplyRequest[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [selectedProductId, setSelectedProductId] = useState('');
    const [quantity, setQuantity] = useState('');

    // Fetch products for the dropdown
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

    // Fetch user's past supply requests
    useEffect(() => {
        if (!firestore || !user?.id) {
            if (!isUserLoading) setIsLoadingRequests(false);
            return;
        }

        setIsLoadingRequests(true);
        const requestsQuery = query(
            collection(firestore, 'supply-requests'), 
            where('userId', '==', user.id),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(requestsQuery, snapshot => {
            setMyRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupplyRequest)));
            setIsLoadingRequests(false);
        }, error => {
            console.error("Error fetching request history:", error);
            if (error.code === 'permission-denied' && firestore) {
                const contextualError = new FirestorePermissionError({
                    operation: 'list',
                    path: 'supply-requests', // This is a top-level collection query
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                 toast({ title: "Errore", description: "Impossibile caricare lo storico delle richieste.", variant: "destructive" });
            }
            setIsLoadingRequests(false);
        });
        return () => unsubscribe();

    }, [firestore, user, toast, isUserLoading]);


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !user || !selectedProductId || !quantity) {
            toast({ title: "Campi Mancanti", description: "Seleziona un prodotto e inserisci una quantità.", variant: "destructive" });
            return;
        }
        
        const requestedQuantity = parseInt(quantity, 10);
        if (isNaN(requestedQuantity) || requestedQuantity <= 0) {
            toast({ title: "Quantità Invalida", description: "La quantità deve essere un numero maggiore di zero.", variant: "destructive" });
            return;
        }
        
        setIsSubmitting(true);
        const selectedProduct = products.find(p => p.id === selectedProductId);
        if (!selectedProduct) {
             toast({ title: "Errore", description: "Prodotto selezionato non valido.", variant: "destructive" });
             setIsSubmitting(false);
             return;
        }

        const supplyRequestsCollection = collection(firestore, 'supply-requests');
        const newRequestData = {
            userId: user.id,
            username: user.username,
            productId: selectedProductId,
            productName: selectedProduct.name,
            requestedQuantity,
            status: 'in_attesa' as const,
            createdAt: serverTimestamp(),
        };

        addDoc(supplyRequestsCollection, newRequestData)
            .then(() => {
                toast({ title: "Successo", description: "Richiesta di fornitura inviata." });
                setSelectedProductId('');
                setQuantity('');
            })
            .catch((error: any) => {
                console.error("Error creating supply request:", error);
                 if (error.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'create',
                        path: supplyRequestsCollection.path,
                        requestResourceData: newRequestData,
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({ title: "Errore", description: "Impossibile inviare la richiesta.", variant: "destructive" });
                }
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    };
    
    if (isUserLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <PackageSearch className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Crea Nuova Richiesta Fornitura</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="product">Prodotto</Label>
                             <Select onValueChange={setSelectedProductId} value={selectedProductId} required>
                                <SelectTrigger id="product" disabled={isLoadingProducts}>
                                    <SelectValue placeholder={isLoadingProducts ? "Caricamento..." : "Seleziona un prodotto..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {products.map((product) => (
                                    <SelectItem key={product.id} value={product.id}>
                                        {product.name}
                                    </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="quantity">Quantità</Label>
                            <Input 
                                id="quantity" 
                                type="number" 
                                placeholder="Es: 5" 
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                min="1"
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Invia Richiesta
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
                        <div className="border rounded-md max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Prodotto</TableHead>
                                        <TableHead>Qtà Rich.</TableHead>
                                        <TableHead>Qtà Appr.</TableHead>
                                        <TableHead className="text-right">Stato</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {myRequests.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">Nessuna richiesta trovata.</TableCell>
                                        </TableRow>
                                    ) : (
                                        myRequests.map(req => (
                                            <TableRow key={req.id}>
                                                <TableCell>{req.productName}</TableCell>
                                                <TableCell>{req.requestedQuantity}</TableCell>
                                                <TableCell>{req.approvedQuantity ?? '-'}</TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant={
                                                        req.status === 'approvata' ? 'secondary'
                                                        : req.status === 'rifiutata' ? 'destructive'
                                                        : 'default'
                                                    }>{req.status.replace('_', ' ')}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

    