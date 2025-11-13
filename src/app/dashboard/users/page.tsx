"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, Trash2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useFirestore, useMemoFirebase, useCollection, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where, getDocs } from "firebase/firestore";

type AppUser = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
  location: string;
  expectedHours: number;
};

export default function UsersPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isUserDialogOpen, setIsUserDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<AppUser | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
  }, [firestore]);

  const { data: users, error: usersError, isLoading } = useCollection<AppUser>(usersQuery);

  React.useEffect(() => {
    if (usersError) {
        // The useCollection hook already emits a detailed error.
        // We can show a generic toast, but the detailed error will be in the console/overlay.
        toast({
            title: "Errore di Permesso",
            description: "Non hai i permessi per visualizzare gli operatori.",
            variant: "destructive"
        });
    }
  }, [usersError, toast]);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firestore) return;

    const form = event.currentTarget;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;
    const expectedHours = Number((form.elements.namedItem('expectedHours') as HTMLInputElement).value);

    const userData: Partial<AppUser> = { username, location, expectedHours, role: 'operator' };
    if (password) {
        userData.password = password;
    }

    if (isEditing && selectedUser) {
      const docRef = doc(firestore, 'app-users', selectedUser.id);
      updateDoc(docRef, userData)
        .then(() => {
          toast({ title: "Operatore Modificato", description: `"${username}" è stato aggiornato.` });
        })
        .catch((serverError) => {
          const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: userData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
    } else {
      if (!password) {
        toast({ title: "Password Obbligatoria", description: "La password è obbligatoria per i nuovi operatori.", variant: "destructive" });
        return;
      }
      const finalUserData = { ...userData, password };
      const collectionRef = collection(firestore, 'app-users');
      addDoc(collectionRef, finalUserData)
        .then(() => {
          toast({ title: "Operatore Creato", description: `"${username}" è stato aggiunto.` });
        })
        .catch((serverError) => {
          const permissionError = new FirestorePermissionError({
            path: collectionRef.path,
            operation: 'create',
            requestResourceData: finalUserData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
    }

    setIsUserDialogOpen(false);
    setSelectedUser(null);
    setIsEditing(false);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || !firestore) return;

    const batch = writeBatch(firestore);
    const userRef = doc(firestore, 'app-users', selectedUser.id);
    batch.delete(userRef);

    const collectionsToDelete = ['shifts', 'leave-requests', 'supply-requests', 'extra-shift-requests', 'communications'];
    
    // This part can still fail due to permissions, but we'll catch the batch.commit()
    // It's harder to provide granular error context for batch writes.
    // We will optimistically try to delete.
    for (const coll of collectionsToDelete) {
        const q = query(collection(firestore, coll), where('operatorId', '==', selectedUser.id));
        const snapshot = await getDocs(q).catch(() => { /* Ignore read errors here */ });
        snapshot?.forEach(doc => batch.delete(doc.ref));
    }

    batch.commit()
        .then(() => {
             toast({
                title: "Operatore Eliminato",
                description: `"${selectedUser.username}" e tutti i suoi dati sono stati rimossi.`,
                variant: "destructive"
            });
        })
        .catch((serverError) => {
             const permissionError = new FirestorePermissionError({
                // We can't know which specific write in the batch failed,
                // but deleting the user doc is a primary candidate.
                path: userRef.path,
                operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
        });

    setIsDeleteDialogOpen(false);
    setSelectedUser(null);
  };

  const openDialog = (user: AppUser | null, editing: boolean) => {
    setSelectedUser(user);
    setIsEditing(editing);
    setIsUserDialogOpen(true);
  }

  const openDeleteDialog = (user: AppUser) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  }
  
  const renderContent = () => {
    if (isLoading) {
      return <div className="text-center text-muted-foreground py-12">Caricamento operatori...</div>;
    }

    // Since we handle the error in useEffect, we might not have users data.
    if (!users || users.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-12">
          <p>Non ci sono operatori. Inizia aggiungendone uno.</p>
        </div>
      );
    }
    
    const sortedUsers = [...users].sort((a,b) => a.username.localeCompare(b.username));

    return (
      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome Utente</TableHead>
              <TableHead>Sede di Lavoro</TableHead>
              <TableHead>Ore Previste</TableHead>
              <TableHead className="text-right"><span className="sr-only">Azioni</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.location}</TableCell>
                <TableCell>{user.expectedHours} ore</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Apri menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Azioni</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => openDialog(user, true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Modifica
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onSelect={() => openDeleteDialog(user)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };


  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Gestione Operatori</h2>
        <Button size="sm" className="gap-1" onClick={() => openDialog(null, false)}>
            <PlusCircle className="h-4 w-4" />
            Aggiungi Nuovo Operatore
        </Button>
      </div>
      <Card>
        <CardHeader>
            <CardTitle>Elenco Operatori</CardTitle>
            <CardDescription>Aggiungi, modifica o elimina gli account degli operatori.</CardDescription>
        </CardHeader>
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>

      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Modifica Operatore' : 'Aggiungi Nuovo Operatore'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Aggiorna i dettagli dell\'operatore.' : 'Compila i campi per creare un nuovo account.'}
            </DialogDescription>
          </DialogHeader>
          <form id="user-form" onSubmit={handleFormSubmit} className="grid gap-4 py-4">
             <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="username" className="text-left sm:text-right">Nome Utente</Label>
                <Input id="username" name="username" className="col-span-1 sm:col-span-3" defaultValue={selectedUser?.username} required />
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="password" className="text-left sm:text-right">Password</Label>
                <Input id="password" name="password" type="password" className="col-span-1 sm:col-span-3" placeholder={isEditing ? 'Lascia vuoto per non cambiare' : ''} required={!isEditing}/>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-left sm:text-right">Sede di Lavoro</Label>
                <Input id="location" name="location" className="col-span-1 sm:col-span-3" defaultValue={selectedUser?.location} required />
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="expectedHours" className="text-left sm:text-right">Ore giornaliere</Label>
                <Input id="expectedHours" name="expectedHours" type="number" className="col-span-1 sm:col-span-3" defaultValue={selectedUser?.expectedHours ?? 3} required min="1" />
             </div>
             <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsUserDialogOpen(false)}>Annulla</Button>
                <Button type="submit">{isEditing ? 'Salva Modifiche' : 'Crea Operatore'}</Button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. L'operatore <strong>{selectedUser?.username}</strong> e tutti i suoi dati (timbrature, ferie, ecc.) verranno eliminati definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser}>Conferma Eliminazione</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

    