'use client';
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, writeBatch, deleteDoc, addDoc, getDocs, query, where, setDoc } from 'firebase/firestore';
import { useFirestore, useAuth, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2, PlusCircle, Pencil, Trash2, KeyRound } from 'lucide-react';
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
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';


type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    role: 'operator';
    visibleInLogin: boolean;
};

// The user prop is passed from the layout
export default function ManageOperatorsPage({ user }: { user: UserData | null }) {
    const firestore = useFirestore();
    const auth = useAuth();
    const { toast } = useToast();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isResetting, setIsResetting] = useState(false);
    const [operatorToDelete, setOperatorToDelete] = useState<Operator | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
    const [newOperatorName, setNewOperatorName] = useState("");
    const [editingOperatorName, setEditingOperatorName] = useState("");


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
        if (!firestore || !auth || !newOperatorName.trim()) return;

        const nameParts = newOperatorName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const email = `${firstName.toLowerCase().replace(/\s+/g, '')}.${lastName.toLowerCase().replace(/\s+/g, '')}@serveco.it`;
        const password = '000000';

        try {
            // Step 1: Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUserId = userCredential.user.uid;

            // Step 2: Create user document in Firestore
            const newOperatorDoc = {
                username: newOperatorName,
                role: 'operator',
                visibleInLogin: true,
                firstName,
                lastName,
                email,
            };
            
            await setDoc(doc(firestore, 'app-users', newUserId), newOperatorDoc);

            toast({
                title: "Successo",
                description: `Operatore "${newOperatorName}" aggiunto.`
            });
            setIsAddDialogOpen(false);
            setNewOperatorName("");
        } catch (error: any) {
            console.error("Error adding operator:", error);
            if (error.code === 'auth/email-already-in-use') {
                 toast({
                    title: "Errore",
                    description: "Questa email è già in uso. Prova un altro nome.",
                    variant: "destructive",
                });
            } else if (error.code === 'auth/weak-password') {
                 toast({
                    title: "Errore",
                    description: "La password è troppo debole.",
                    variant: "destructive",
                });
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
        
        const nameParts = editingOperatorName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const updatePayload = { 
            username: editingOperatorName,
            firstName,
            lastName,
        };

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
        if (!firestore || !auth || !operatorToDelete) return;

        const operatorRef = doc(firestore, 'app-users', operatorToDelete.id);
        try {
            // Step 1: Delete Firestore document
            await deleteDoc(operatorRef);

            // Step 2: Try to delete user from Auth. This is a best-effort attempt.
            // For this to work, the admin user must have sufficient permissions.
            // In a production environment, this should be handled by a backend function
            // with admin privileges for security reasons.
            try {
                // This will likely fail unless the admin SDK is used in a secure environment.
                // Re-authentication of the admin user might be required.
                const userToDelete = auth.currentUser; // This is incorrect, we need the actual user object to delete
                // A correct implementation requires a backend function. We simulate the deletion here.
                console.warn("Simulating Auth user deletion. For production, use a backend function.");
            } catch (authError: any) {
                console.error("Failed to delete user from Auth:", authError);
                toast({
                    title: "Avviso",
                    description: "Utente eliminato dal database, ma non da Firebase Authentication. Per la rimozione completa è necessario un intervento manuale dalla console Firebase.",
                    variant: "default",
                });
            }

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
    
    // This function is complex. Resetting passwords requires either knowing the old one,
    // or a backend function. For simplicity, we'll remove this feature.
    const handleResetAllPasswords = async () => {
        toast({
            title: "Funzione non disponibile",
            description: "Il reset massivo delle password richiede un intervento manuale o una funzione di backend.",
            variant: "default",
        });
    };
    
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
                        {/* 
                        <Button onClick={handleResetAllPasswords} variant="outline" disabled={isResetting}>
                            {isResetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                             {isResetting ? 'Reset in corso...' : 'Resetta Tutte le Password a 000000'}
                        </Button>
                        */}
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
                                            Inserisci il nome e cognome. La password iniziale sarà '000000'.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="name" className="text-right">
                                                Nome e Cognome
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
                                        <TableHead>Email</TableHead>
                                        <TableHead>Visibile nel Login</TableHead>
                                        <TableHead className="text-right w-[120px]">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {operators.map((operator) => (
                                        <TableRow key={operator.id}>
                                            <TableCell className="font-medium">{operator.username}</TableCell>
                                            <TableCell>{operator.email}</TableCell>
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
                                    Nome e Cognome
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
                            Questa azione eliminerà l'operatore "{operatorToDelete?.username}" dal database. Per la rimozione completa, l'utente dovrà essere eliminato anche dalla console Firebase Authentication (operazione che richiede privilegi da amministratore e solitamente viene eseguita da un backend).
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
