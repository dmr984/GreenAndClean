'use client';
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, writeBatch, deleteDoc, addDoc, getDocs, query, where, setDoc } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2, PlusCircle, Pencil, Trash2, ChevronRight } from 'lucide-react';
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
import { useUser } from '@/hooks/use-user';
import Link from 'next/link';

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    role: 'operator';
    visibleInLogin: boolean;
};

// The user prop is passed from the layout
export default function ManageOperatorsPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [operatorToDelete, setOperatorToDelete] = useState<Operator | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
    
    // State for the "Add" dialog
    const [newFirstName, setNewFirstName] = useState("");
    const [newLastName, setNewLastName] = useState("");

    // State for the "Edit" dialog
    const [editingFirstName, setEditingFirstName] = useState("");
    const [editingLastName, setEditingLastName] = useState("");


    const operatorsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        return q;
    }, [firestore]);

    useEffect(() => {
        if (!operatorsQuery || !user || user.role !== 'admin' ) {
            setIsLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() })) as Operator[];
            
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
    }, [operatorsQuery, toast, firestore, user]);

    const handleAddOperator = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !newFirstName.trim() || !newLastName.trim()) return;

        const generatedUsername = `${newFirstName} ${newLastName}`;
        
        const newOperatorDoc = {
            username: generatedUsername,
            role: 'operator',
            visibleInLogin: true,
            firstName: newFirstName,
            lastName: newLastName,
        };
        
        addDoc(collection(firestore, 'app-users'), newOperatorDoc)
          .then(() => {
            toast({
                title: "Successo",
                description: `Operatore "${generatedUsername}" aggiunto.`
            });
            setIsAddDialogOpen(false);
            setNewFirstName("");
            setNewLastName("");
          }).catch((error: any) => {
            console.error("Error adding operator:", error);
            if (error.code === 'permission-denied') {
                 const contextualError = new FirestorePermissionError({
                    operation: 'create',
                    path: 'app-users',
                    requestResourceData: newOperatorDoc
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                 toast({
                    title: "Errore",
                    description: "Impossibile aggiungere l'operatore.",
                    variant: "destructive",
                });
            }
        });
    };

    const handleEditOperator = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !selectedOperator || !editingFirstName.trim() || !editingLastName.trim()) return;
        
        const operatorRef = doc(firestore, 'app-users', selectedOperator.id);
        
        const generatedUsername = `${editingFirstName} ${editingLastName}`;

        const updatePayload = { 
            username: generatedUsername,
            firstName: editingFirstName,
            lastName: editingLastName,
        };

        updateDoc(operatorRef, updatePayload)
            .then(() => {
                toast({
                    title: "Successo",
                    description: "Dati operatore aggiornati."
                });
                setIsEditDialogOpen(false);
                setSelectedOperator(null);
            }).catch((error: any) => {
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
            });
    };

    const handleDeleteOperator = async () => {
        if (!firestore || !operatorToDelete) return;

        const operatorRef = doc(firestore, 'app-users', operatorToDelete.id);
        deleteDoc(operatorRef)
            .then(() => {
                toast({
                    title: "Successo",
                    description: `Operatore "${operatorToDelete.username}" eliminato.`
                });
            }).catch((error: any) => {
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
            }).finally(() => {
                setOperatorToDelete(null);
            });
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
    
    if (isUserLoading) {
        return (
             <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user || user.role !== 'admin') {
        return (
             <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm mt-6">
              <div className="flex flex-col items-center gap-1 text-center">
                <h3 className="text-2xl font-bold tracking-tight">
                  Accesso Negato
                </h3>
                <p className="text-sm text-muted-foreground">
                  Non hai i permessi per visualizzare questa pagina.
                </p>
              </div>
            </div>
        );
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Users className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Gestione Operatori</CardTitle>
                    </div>
                     <div className="flex flex-col sm:flex-row gap-2">
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
                                            Inserisci i dati per creare un nuovo operatore.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="firstName" className="text-right">
                                                Nome
                                            </Label>
                                            <Input id="firstName" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} className="col-span-3" required />
                                        </div>
                                         <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="lastName" className="text-right">
                                                Cognome
                                            </Label>
                                            <Input id="lastName" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} className="col-span-3" required />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit">Salva Operatore</Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                     </div>
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
                                        <TableHead className="text-right w-[160px]">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {operators.map((operator) => (
                                        <TableRow key={operator.id} className="group">
                                            <TableCell className="font-medium">
                                                <Link href={`/dashboard/operators/${operator.id}`} className="hover:underline flex items-center">
                                                    {operator.username}
                                                    <ChevronRight className="h-4 w-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <Switch
                                                    checked={operator.visibleInLogin}
                                                    onCheckedChange={(checked) => handleVisibilityChange(operator.id, checked)}
                                                    aria-label={`Toggle visibility for ${operator.username}`}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => { setSelectedOperator(operator); setEditingFirstName(operator.firstName); setEditingLastName(operator.lastName); setIsEditDialogOpen(true);}}>
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
                                Modifica il nome e cognome dell'operatore.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="editing-firstName" className="text-right">
                                    Nome
                                </Label>
                                <Input id="editing-firstName" value={editingFirstName} onChange={(e) => setEditingFirstName(e.target.value)} className="col-span-3" required />
                            </div>
                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="editing-lastName" className="text-right">
                                    Cognome
                                </Label>
                                <Input id="editing-lastName" value={editingLastName} onChange={(e) => setEditingLastName(e.target.value)} className="col-span-3" required />
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
                            Questa azione eliminerà l'operatore "{operatorToDelete?.username}" dal database in modo permanente. Questa azione non può essere annullata.
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
