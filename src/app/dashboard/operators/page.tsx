'use client';
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, writeBatch, deleteDoc, addDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2, PlusCircle, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


type Operator = {
    id: string;
    username: string;
    role: 'operator';
    visibleInLogin: boolean;
};

export default function ManageOperatorsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [operatorToDelete, setOperatorToDelete] = useState<Operator | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
    const [newOperatorName, setNewOperatorName] = useState("");
    const [editingOperatorName, setEditingOperatorName] = useState("");


    const operatorsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'app-users');
    }, [firestore]);

    useEffect(() => {
        if (!operatorsQuery) {
            setIsLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(user => user.role === 'operator') as Operator[];
            
            usersData.sort((a,b) => a.username.localeCompare(b.username, undefined, { numeric: true }));

            setOperators(usersData);
            setIsLoading(false);
        }, (error) => {
            if (error.code === 'permission-denied' && firestore) {
                 const contextualError = new FirestorePermissionError({
                    operation: 'list',
                    path: 'app-users',
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({
                    title: "Errore",
                    description: "Impossibile caricare gli operatori.",
                    variant: "destructive",
                });
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [operatorsQuery, toast, firestore]);

    const handleAddOperator = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !newOperatorName.trim()) return;

        const newOperator = {
            username: newOperatorName,
            password: '0000',
            role: 'operator',
            visibleInLogin: true,
        };

        try {
            const docRef = await addDoc(collection(firestore, 'app-users'), newOperator);
            toast({
                title: "Successo",
                description: `Operatore "${newOperatorName}" aggiunto.`
            });
            setIsAddDialogOpen(false);
            setNewOperatorName("");
        } catch (error: any) {
            if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({
                    operation: 'create',
                    path: 'app-users',
                    requestResourceData: newOperator
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                 toast({
                    title: "Errore",
                    description: "Impossibile aggiungere l'operatore.",
                    variant: "destructive",
                });
            }
        }
    };

    const handleEditOperator = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !selectedOperator || !editingOperatorName.trim()) return;
        
        const operatorRef = doc(firestore, 'app-users', selectedOperator.id);
        const updatePayload = { username: editingOperatorName };

        try {
            await updateDoc(operatorRef, updatePayload);
            toast({
                title: "Successo",
                description: "Nome operatore aggiornato."
            });
            setIsEditDialogOpen(false);
            setSelectedOperator(null);
        } catch (error: any) {
             if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({
                    operation: 'update',
                    path: operatorRef.path,
                    requestResourceData: updatePayload
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                 toast({
                    title: "Errore",
                    description: "Impossibile aggiornare l'operatore.",
                    variant: "destructive",
                });
            }
        }
    };

    const handleDeleteOperator = async () => {
        if (!firestore || !operatorToDelete) return;

        const operatorRef = doc(firestore, 'app-users', operatorToDelete.id);
        try {
            await deleteDoc(operatorRef);
            toast({
                title: "Successo",
                description: `Operatore "${operatorToDelete.username}" eliminato.`
            });
        } catch (error: any) {
            if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({
                    operation: 'delete',
                    path: operatorRef.path,
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                 toast({
                    title: "Errore",
                    description: "Impossibile eliminare l'operatore.",
                    variant: "destructive",
                });
            }
        } finally {
            setOperatorToDelete(null);
        }
    };


    const handleVisibilityChange = (operatorId: string, newVisibility: boolean) => {
        if (!firestore) return;
        const operatorRef = doc(firestore, 'app-users', operatorId);
        const updatePayload = { visibleInLogin: newVisibility };
        
        updateDoc(operatorRef, updatePayload)
            .catch((error) => {
                if (error.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'update',
                        path: operatorRef.path,
                        requestResourceData: updatePayload
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({
                        title: "Errore",
                        description: "Impossibile aggiornare la visibilità.",
                        variant: "destructive",
                    });
                }
            });
    };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Users className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Gestione Operatori</CardTitle>
                    </div>
                     <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi Operatore
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                             <form onSubmit={handleAddOperator}>
                                <DialogHeader>
                                    <DialogTitle>Aggiungi Nuovo Operatore</DialogTitle>
                                    <DialogDescription>
                                        Inserisci il nome del nuovo operatore. La password iniziale sarà '0000'.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="name" className="text-right">
                                            Nome
                                        </Label>
                                        <Input id="name" value={newOperatorName} onChange={(e) => setNewOperatorName(e.target.value)} className="col-span-3" required />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="submit">Salva Operatore</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome Operatore</TableHead>
                                        <TableHead>Visibile nel Login</TableHead>
                                        <TableHead className="text-right w-[120px]">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {operators.map((operator) => (
                                        <TableRow key={operator.id}>
                                            <TableCell className="font-medium">{operator.username}</TableCell>
                                            <TableCell>
                                                <Switch
                                                    checked={operator.visibleInLogin}
                                                    onCheckedChange={(checked) => handleVisibilityChange(operator.id, checked)}
                                                    aria-label={`Toggle visibility for ${operator.username}`}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => { setSelectedOperator(operator); setEditingOperatorName(operator.username); setIsEditDialogOpen(true);}}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => setOperatorToDelete(operator)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <form onSubmit={handleEditOperator}>
                        <DialogHeader>
                            <DialogTitle>Modifica Operatore</DialogTitle>
                            <DialogDescription>
                                Modifica il nome dell'operatore selezionato.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="editing-name" className="text-right">
                                    Nome
                                </Label>
                                <Input id="editing-name" value={editingOperatorName} onChange={(e) => setEditingOperatorName(e.target.value)} className="col-span-3" required />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit">Salva Modifiche</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!operatorToDelete} onOpenChange={(open) => !open && setOperatorToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione non può essere annullata. L'operatore "{operatorToDelete?.username}" sarà eliminato in modo permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOperator}>Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
