"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, Trash, Edit, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { useAuth, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { addDoc, collection, deleteDoc, doc, updateDoc, setDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from "firebase/auth";

type User = {
  id: string;
  name: string;
  email: string;
  code: string;
  location: string;
  role: string;
};

const getAvatarFallback = (name: string) => {
    if (!name) return "??";
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};


export default function UsersPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();
  
  const usersCollection = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users, isLoading } = useCollection<User>(usersCollection);

  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = React.useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null);
  const router = useRouter();


  const handleAddUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;

    if (users?.some(u => u.email === email)) {
        toast({
            variant: "destructive",
            title: "Email già in uso",
            description: "Questa email è già associata a un altro utente.",
        });
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, code);
        
        const newUser: Omit<User, 'id'> = {
            name,
            email,
            code,
            location,
            role: 'operator'
        };
        await setDoc(doc(firestore, "users", userCredential.user.uid), newUser);
        
        setIsNewUserDialogOpen(false);
        toast({
        title: "Utente Aggiunto",
        description: `L'utente ${name} è stato aggiunto con successo.`,
        });
        form.reset();

    } catch (error: any) {
        console.error("Error adding user:", error);
        toast({
            variant: "destructive",
            title: "Errore",
            description: error.message || "Impossibile aggiungere l'utente.",
        });
    }
  };

  const handleEditUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) return;

    const form = event.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;

    const userDocRef = doc(firestore, 'users', selectedUser.id);
    
    const updatedData: Partial<User> = { name, email, location, code };

    try {
        await updateDoc(userDocRef, updatedData);
        
        // Note: Updating email/password in Firebase Auth is a sensitive operation
        // and requires the user to be re-authenticated. It's complex and omitted here for simplicity.
        // We will just update the Firestore document. If code is changed, it needs a backend function to be synced with Auth.

        setIsEditUserDialogOpen(false);
        setSelectedUser(null);
        toast({
        title: "Utente Modificato",
        description: `I dati di ${name} sono stati aggiornati.`,
        });
    } catch(error: any) {
        toast({
            variant: "destructive",
            title: "Errore",
            description: error.message || "Impossibile modificare l'utente.",
        });
    }
  };
  
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
        await deleteDoc(doc(firestore, 'users', selectedUser.id));
        // Note: Deleting the user from Firebase Auth is a separate, critical step.
        // This is a complex operation that requires a backend function for security reasons.
        // For this demo, we are only removing the user from the Firestore database.
        
        toast({
        title: "Utente Eliminato",
        description: `L'utente è stato rimosso dal database.`,
        variant: "destructive"
        });
        setIsDeleteDialogOpen(false);
        setSelectedUser(null);
    } catch(error: any) {
        toast({
            variant: "destructive",
            title: "Errore",
            description: error.message || "Impossibile eliminare l'utente.",
        });
    }
  }
  
  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setIsEditUserDialogOpen(true);
  }

  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  }
  
  const operatorUsers = users?.filter(u => u.role === 'operator');

  return (
    <>
      <div className="flex items-center justify-between space-y-2 mb-4">
        <h2 className="text-3xl font-bold tracking-tight">Gestione Operatori</h2>
        <Dialog open={isNewUserDialogOpen} onOpenChange={setIsNewUserDialogOpen}>
            <DialogTrigger asChild>
            <Button size="sm" className="h-8 gap-1">
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Aggiungi Operatore
                </span>
            </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
                <DialogTitle>Aggiungi Nuovo Operatore</DialogTitle>
                <DialogDescription>
                Compila i campi per creare un nuovo operatore. L'email e il codice verranno usati per l'accesso.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-left sm:text-right">Nome</Label>
                    <Input id="name" name="name" className="col-span-1 sm:col-span-3" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-left sm:text-right">Email</Label>
                    <Input id="email" name="email" type="email" className="col-span-1 sm:col-span-3" required />
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="code" className="text-left sm:text-right">Codice (Password)</Label>
                    <Input id="code" name="code" className="col-span-1 sm:col-span-3" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="location" className="text-left sm:text-right">Luogo</Label>
                    <Input id="location" name="location" className="col-span-1 sm:col-span-3" required />
                </div>
                <DialogFooter>
                    <Button type="submit">Crea Utente</Button>
                </DialogFooter>
            </form>
            </DialogContent>
        </Dialog>
      </div>
      
      {isLoading && <p>Caricamento operatori...</p>}

      {!isLoading && operatorUsers && operatorUsers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {operatorUsers.map((user) => (
            <Card key={user.id} className="flex flex-col">
                <CardHeader className="flex flex-row items-center gap-4">
                    <Avatar className="h-12 w-12">
                         <AvatarFallback>{getAvatarFallback(user.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <CardTitle>{user.name}</CardTitle>
                        <CardDescription>{user.location}</CardDescription>
                    </div>
                    <div className="ml-auto">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost" disabled={user.role === 'admin'}>
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Apri menu</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Azioni</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => openEditDialog(user)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Modifica
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onSelect={() => openDeleteDialog(user)}>
                                <Trash className="mr-2 h-4 w-4" />
                                Elimina
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardHeader>
                <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground">Email: {user.email}</p>
                </CardContent>
                <CardFooter>
                    <Button asChild className="w-full">
                        <Link href={`/dashboard/users/${user.id}`}>
                            <User className="mr-2 h-4 w-4" />
                            Visualizza Profilo
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        !isLoading && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed shadow-sm h-64 p-4 text-center">
            <h3 className="text-2xl font-bold tracking-tight">Nessun operatore trovato</h3>
            <p className="text-sm text-muted-foreground">Inizia aggiungendo un nuovo operatore.</p>
            <Button className="mt-4" onClick={() => setIsNewUserDialogOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Aggiungi Operatore
            </Button>
            </div>
        )
      )}

      {/* Edit User Dialog */}
      <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Operatore</DialogTitle>
            <DialogDescription>
              Aggiorna i dettagli dell'operatore. La modifica del codice qui non aggiorna la password di accesso.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <form onSubmit={handleEditUser} className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="text-left sm:text-right">Nome</Label>
                <Input id="edit-name" name="name" defaultValue={selectedUser.name} className="col-span-1 sm:col-span-3" required />
              </div>
               <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-email" className="text-left sm:text-right">Email</Label>
                <Input id="edit-email" name="email" type="email" defaultValue={selectedUser.email} className="col-span-1 sm:col-span-3" required />
              </div>
               <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-code" className="text-left sm:text-right">Codice (visual.)</Label>
                <Input id="edit-code" name="code" defaultValue={selectedUser.code} className="col-span-1 sm:col-span-3" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-location" className="text-left sm:text-right">Luogo</Label>
                <Input id="edit-location" name="location" defaultValue={selectedUser.location} className="col-span-1 sm:col-span-3" required />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditUserDialogOpen(false)}>Annulla</Button>
                <Button type="submit">Salva Modifiche</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Delete User Confirmation */}
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata. L'account di autenticazione Firebase per questo utente non verrà eliminato, solo il record del database.
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
