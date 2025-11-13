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
import { useFirestore } from "@/firebase";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where, getDocs } from "firebase/firestore";

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
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [isUserDialogOpen, setIsUserDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<AppUser | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);

  React.useEffect(() => {
    if (!firestore) return;
    const unsubscribe = onSnapshot(collection(firestore, 'app-users'), (snapshot) => {
        const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser))
                                    .filter(u => u.role === 'operator');
        setUsers(userList.sort((a,b) => a.username.localeCompare(b.username)));
    });
    return () => unsubscribe();
  }, [firestore]);

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

    try {
        if (isEditing && selectedUser) {
          const docRef = doc(firestore, 'app-users', selectedUser.id);
          await updateDoc(docRef, userData);
          toast({ title: "Operatore Modificato", description: `"${username}" è stato aggiornato.` });
        } else {
          if(!password) {
            toast({ title: "Password Obbligatoria", description: "La password è obbligatoria per i nuovi operatori.", variant: "destructive" });
            return;
          }
          await addDoc(collection(firestore, 'app-users'), userData);
          toast({ title: "Operatore Creato", description: `"${username}" è stato aggiunto.` });
        }
    } catch (error) {
        toast({ title: "Errore", description: "Impossibile salvare l'operatore.", variant: "destructive"});
    }

    setIsUserDialogOpen(false);
    setSelectedUser(null);
    setIsEditing(false);
  };
  
 const handleDeleteUser = async () => {
    if (!selectedUser || !firestore) return;

    try {
        const batch = writeBatch(firestore);

        // Delete user document
        const userRef = doc(firestore, 'app-users', selectedUser.id);
        batch.delete(userRef);

        // Define collections to clean up
        const collectionsToDelete = ['shifts', 'leave-requests', 'supply-requests', 'extra-shift-requests', 'communications'];
        
        for (const coll of collectionsToDelete) {
            const q = query(collection(firestore, coll), where('operatorId', '==', selectedUser.id));
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => batch.delete(doc.ref));
        }

        await batch.commit();

        toast({
            title: "Operatore Eliminato",
            description: `"${selectedUser.username}" e tutti i suoi dati sono stati rimossi.`,
            variant: "destructive"
        });
    } catch (error) {
        console.error("Error deleting user and related data: ", error);
        toast({ title: "Errore", description: "Impossibile eliminare l'operatore e i suoi dati.", variant: "destructive"});
    }

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

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Gestione Operatori</h2>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Elenco Operatori</CardTitle>
              <CardDescription>Aggiungi, modifica o elimina gli account degli operatori.</CardDescription>
            </div>
            <Button size="sm" className="gap-1 w-full sm:w-auto" onClick={() => openDialog(null, false)}>
              <PlusCircle className="h-4 w-4" />
              Aggiungi Operatore
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p>Non ci sono operatori. Inizia aggiungendone uno.</p>
            </div>
          ) : (
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
                  {users.map((user) => (
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
          )}
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
