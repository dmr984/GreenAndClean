'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/componentsui/button';
import { ArrowLeft, Trash2, Pencil, Minus, Plus } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

type SupplyRequest = { id: string; user: string; operatorId: string; items: { [key: string]: number }; status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale'; fulfilledItems?: { [key: string]: number }; adminNotes?: string };
type WarehouseItem = { id: string; name: string; quantity: number; };

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case "Approvata": return "default";
        case "In attesa": return "secondary";
        case "Rifiutata": return "destructive";
        case "Parziale": return "outline";
        default: return "secondary";
    }
};

export default function UserSuppliesPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.userId as string;
    const firestore = useFirestore();
    const { toast } = useToast();

    const [userName, setUserName] = useState<string | null>(null);
    const [supplyRequests, setSupplyRequests] = useState<SupplyRequest[]>([]);
    const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<SupplyRequest | null>(null);
    const [editDraftItems, setEditDraftItems] = useState<{ [itemName: string]: number }>({});


    useEffect(() => {
        if (!userId || !firestore) return;
        setLoading(true);
        
        const userDocRef = doc(firestore, 'app-users', userId);
        getDoc(userDocRef).then(userDoc => {
            if (userDoc.exists()) {
                setUserName(userDoc.data().username);
            } else {
                setUserName(null);
            }
        }).catch(console.error);

        const suppliesQuery = query(collection(firestore, 'supply-requests'), where('operatorId', '==', userId));
        const unsubSupplies = onSnapshot(suppliesQuery, snapshot => {
            setSupplyRequests(snapshot.docs.map(d => ({id: d.id, ...d.data()} as SupplyRequest)).sort((a,b) => (b.id || "").localeCompare(a.id || "")));
            setLoading(false);
        }, console.error);

        const unsubWarehouse = onSnapshot(collection(firestore, 'warehouse-items'), snapshot => {
             setWarehouseItems(snapshot.docs.map(d => ({id: d.id, ...d.data()} as WarehouseItem)));
        });

        return () => {
            unsubSupplies();
            unsubWarehouse();
        };
    }, [userId, firestore]);
    
    const openDeleteConfirmation = (request: SupplyRequest) => {
        setSelectedRequest(request);
        setIsDeleteDialogOpen(true);
    };
    
    const handleDeleteRequest = async () => {
        if (!selectedRequest || !firestore) return;
        try {
            await deleteDoc(doc(firestore, 'supply-requests', selectedRequest.id));
            toast({ title: "Richiesta eliminata", variant: "destructive"});
        } catch(e) {
            toast({ title: "Errore", description: "Impossibile eliminare la richiesta.", variant: "destructive"});
        } finally {
             setIsDeleteDialogOpen(false);
             setSelectedRequest(null);
        }
    };

    const openEditDialog = (request: SupplyRequest) => {
        setSelectedRequest(request);
        setEditDraftItems(request.items);
        setIsEditDialogOpen(true);
    }
    
    const handleItemQuantityChange = (itemName: string, amount: number) => {
        setEditDraftItems(prev => {
            const currentQuantity = prev[itemName] || 0;
            const newQuantity = Math.max(0, currentQuantity + amount);
            if (newQuantity === 0) {
                const { [itemName]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [itemName]: newQuantity };
        });
    };
    
    const handleEditRequestSubmit = async () => {
        if (!selectedRequest || !firestore) return;
         if (Object.keys(editDraftItems).length === 0) {
            toast({ title: "Nessun prodotto", description: "La richiesta non può essere vuota.", variant: "destructive" });
            return;
        }

        try {
            await updateDoc(doc(firestore, 'supply-requests', selectedRequest.id), {
                items: editDraftItems,
                status: 'In attesa'
            });
            toast({ title: "Richiesta Modificata", description: "La richiesta è stata aggiornata e dovrà essere riapprovata." });
        } catch (e) {
            toast({ title: "Errore", description: "Impossibile modificare la richiesta.", variant: "destructive"});
        } finally {
            setIsEditDialogOpen(false);
            setSelectedRequest(null);
        }
    };

    if (loading) {
        return (
            <div className="p-4 md:p-6 space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    if (!userName) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <h2 className="text-2xl font-bold mb-4">Utente non trovato</h2>
            <Button onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
            </Button>
          </div>
        );
    }
    
    return (
        <>
            <div className="flex flex-col gap-6">
                <h2 className="text-3xl font-bold tracking-tight">Storico Richieste Forniture di {userName}</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Riepilogo Richieste</CardTitle>
                        <CardDescription>Visualizza e gestisci tutte le richieste di forniture.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[calc(100vh-20rem)]">
                            {supplyRequests.length > 0 ? (
                                <div className="space-y-4">
                                    {supplyRequests.map(req => (
                                        <Card key={req.id}>
                                            <CardHeader className="flex flex-row justify-between items-start pb-3">
                                                <div>
                                                    <p className="font-semibold">Richiesta del {new Date().toLocaleDateString('it-IT')}</p>
                                                    <p className="text-sm text-muted-foreground">ID: {req.id}</p>
                                                </div>
                                                <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                                            </CardHeader>
                                            <CardContent className="pb-2">
                                                <div className="space-y-2 text-sm">
                                                    {Object.entries(req.items).map(([name, qty]) => (
                                                        <div key={name} className="flex justify-between border-b pb-2 last:border-none">
                                                            <span>{name}</span>
                                                            <div className="text-right">
                                                                <p>Richiesti: <span className="font-medium">{qty}</span></p>
                                                                <p>Consegnati: <span className="font-bold">{req.fulfilledItems ? req.fulfilledItems[name] ?? 0 : '-'}</span></p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {req.adminNotes && (
                                                    <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                                                        <h4 className="font-semibold">Note Admin:</h4>
                                                        <p className="text-muted-foreground">{req.adminNotes}</p>
                                                    </div>
                                                )}
                                            </CardContent>
                                            <CardFooter className="pb-3 pt-1 flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(req)}>
                                                    <Pencil className="h-4 w-4" />
                                                    <span className="sr-only">Modifica</span>
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => openDeleteConfirmation(req)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                    <span className="sr-only">Elimina</span>
                                                </Button>
                                            </CardFooter>
                                        </Card>
                                    ))}
                                </div>
                            ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di forniture trovata.</p>}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
            
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione non può essere annullata. La richiesta verrà eliminata in modo permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSelectedRequest(null)}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteRequest}>Conferma Eliminazione</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifica Richiesta Fornitura</DialogTitle>
                        <DialogDescription>Aggiungi o rimuovi prodotti e quantità. La richiesta tornerà in stato "In attesa".</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-2">
                            {warehouseItems.map(item => (
                                <div key={item.id} className="flex justify-between items-center p-2 rounded-md border">
                                    <span className="font-medium">{item.name}</span>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleItemQuantityChange(item.name, -1)}><Minus className="h-4 w-4" /></Button>
                                        <span className="min-w-[40px] text-center font-bold text-lg">{editDraftItems[item.name] || 0}</span>
                                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleItemQuantityChange(item.name, 1)}><Plus className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                         {warehouseItems.length === 0 && <p className="text-muted-foreground text-center">Magazzino vuoto.</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Annulla</Button>
                        <Button onClick={handleEditRequestSubmit} disabled={Object.keys(editDraftItems).length === 0}>Salva Modifiche</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
