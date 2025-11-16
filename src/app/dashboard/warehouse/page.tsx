'use client';
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Warehouse, Loader2, PlusCircle, Pencil, Trash2 } from 'lucide-react';

type Product = {
    id: string;
    name: string;
    quantity: number;
};

export default function WarehousePage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // State for dialogs
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    // State for forms
    const [newProductName, setNewProductName] = useState('');
    const [newProductQuantity, setNewProductQuantity] = useState('');
    const [editProductName, setEditProductName] = useState('');
    const [editProductQuantity, setEditProductQuantity] = useState('');

    useEffect(() => {
        if (!firestore || !user || user.role !== 'admin') {
            setIsLoading(false);
            return;
        }

        const productsQuery = query(collection(firestore, 'products'), orderBy('name'));
        const unsubscribe = onSnapshot(productsQuery, snapshot => {
            setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
            setIsLoading(false);
        }, error => {
            console.error("Error fetching products:", error);
            if (error.code === 'permission-denied' && firestore) {
                const contextualError = new FirestorePermissionError({ operation: 'list', path: 'products' });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile caricare i prodotti dal magazzino.", variant: "destructive" });
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [firestore, user, toast]);

    const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !newProductName.trim() || !newProductQuantity.trim()) return;

        const quantity = parseInt(newProductQuantity, 10);
        if (isNaN(quantity) || quantity < 0) {
            toast({ title: "Quantità non valida", variant: "destructive" });
            return;
        }
        
        const productsCollection = collection(firestore, 'products');
        const newProductData = { name: newProductName, quantity };

        addDoc(productsCollection, newProductData)
            .then(() => {
                 toast({ title: "Successo", description: "Prodotto aggiunto al magazzino." });
                setIsAddDialogOpen(false);
                setNewProductName('');
                setNewProductQuantity('');
            })
            .catch((error: any) => {
                console.error("Error adding product:", error);
                if (error.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'create',
                        path: productsCollection.path,
                        requestResourceData: newProductData
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({ title: "Errore", description: "Impossibile aggiungere il prodotto.", variant: "destructive" });
                }
            });
    };

    const openEditDialog = (product: Product) => {
        setSelectedProduct(product);
        setEditProductName(product.name);
        setEditProductQuantity(String(product.quantity));
        setIsEditDialogOpen(true);
    };

    const handleEditProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !selectedProduct) return;
        
        const quantity = parseInt(editProductQuantity, 10);
        if (isNaN(quantity) || quantity < 0) {
            toast({ title: "Quantità non valida", variant: "destructive" });
            return;
        }
        
        const productRef = doc(firestore, 'products', selectedProduct.id);
        const updatePayload = { name: editProductName, quantity };

        updateDoc(productRef, updatePayload)
            .then(() => {
                toast({ title: "Successo", description: "Prodotto aggiornato." });
                setIsEditDialogOpen(false);
                setSelectedProduct(null);
            })
            .catch((error: any) => {
                console.error("Error updating product:", error);
                if (error.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'update',
                        path: productRef.path,
                        requestResourceData: updatePayload
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({ title: "Errore", description: "Impossibile aggiornare il prodotto.", variant: "destructive" });
                }
            });
    };

    const handleDeleteProduct = async () => {
        if (!firestore || !productToDelete) return;
        const productRef = doc(firestore, 'products', productToDelete.id);
        
        deleteDoc(productRef)
            .then(() => {
                toast({ title: "Successo", description: `Prodotto "${productToDelete.name}" eliminato.` });
            })
            .catch((error: any) => {
                console.error("Error deleting product:", error);
                 if (error.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'delete',
                        path: productRef.path,
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({ title: "Errore", description: "Impossibile eliminare il prodotto.", variant: "destructive" });
                }
            })
            .finally(() => {
                setProductToDelete(null);
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
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Warehouse className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Gestione Magazzino</CardTitle>
                    </div>
                     <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button><PlusCircle className="mr-2 h-4 w-4" /> Aggiungi Prodotto</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <form onSubmit={handleAddProduct}>
                                <DialogHeader><DialogTitle>Nuovo Prodotto</DialogTitle></DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="new-name" className="text-right">Nome</Label>
                                        <Input id="new-name" value={newProductName} onChange={e => setNewProductName(e.target.value)} className="col-span-3" required />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="new-quantity" className="text-right">Quantità</Label>
                                        <Input id="new-quantity" type="number" value={newProductQuantity} onChange={e => setNewProductQuantity(e.target.value)} className="col-span-3" required min="0" />
                                    </div>
                                </div>
                                <DialogFooter><Button type="submit">Salva</Button></DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome Prodotto</TableHead>
                                    <TableHead>Quantità</TableHead>
                                    <TableHead className="text-right w-[120px]">Azioni</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {products.map((product) => (
                                    <TableRow key={product.id}>
                                        <TableCell className="font-medium">{product.name}</TableCell>
                                        <TableCell>{product.quantity}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => setProductToDelete(product)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <form onSubmit={handleEditProduct}>
                        <DialogHeader><DialogTitle>Modifica Prodotto</DialogTitle></DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="edit-name" className="text-right">Nome</Label>
                                <Input id="edit-name" value={editProductName} onChange={e => setEditProductName(e.target.value)} className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="edit-quantity" className="text-right">Quantità</Label>
                                <Input id="edit-quantity" type="number" value={editProductQuantity} onChange={e => setEditProductQuantity(e.target.value)} className="col-span-3" required min="0" />
                            </div>
                        </div>
                        <DialogFooter><Button type="submit">Salva Modifiche</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà il prodotto "{productToDelete?.name}" in modo permanente. L'azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteProduct}>Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

    