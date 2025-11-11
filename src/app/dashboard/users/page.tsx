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
import { useFirestore } from "@/firebase";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";

type AppUser = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  password?: string;
  // Add other fields if necessary, e.g., location
  location?: string;
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
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = React.useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<AppUser | null>(null);

  React.useEffect(() => {
    if (!firestore) return;
    const usersCollection = collection(firestore, 'app-users');
    const unsubscribe = onSnapshot(usersCollection, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
      setUsers(userList);
      setIsLoading(false);
    }, (error) => {
        console.error("Error fetching users:", error);
        toast({
            variant: "destructive",
            title: "Errore di caricamento",
            description: "Impossibile caricare gli utenti."
        });
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, toast]);


  const handleAddUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;
    const defaultPassword = "0000";

    if (users.some(u => u.username === username)) {
        toast({
            variant: "destructive",
            title: "Nome utente già in uso",
        });
        return;
    }

    try {
        await addDoc(collection(firestore, "app-users"), {
            username,
            location,
            password: defaultPassword,
            role: 'operator',
        });
        
        setIsNewUserDialogOpen(false);
        toast({
            title: "Utente Aggiunto",
            description: `L'utente ${username} è stato aggiunto con successo.`,
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
    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem('password') as HTMLInputElement).value;

    const userDocRef = doc(firestore, 'app-users', selectedUser.id);
    
    const updatedData: Partial<AppUser> = { username, location };
    if (newPassword) {
        updatedData.password = newPassword;
    }

    try {
        await updateDoc(userDocRef, updatedData);

        setIsEditUserDialogOpen(false);
        setSelectedUser(null);
        toast({
        title: "Utente Modificato",
        description: `I dati di ${username} sono stati aggiornati.`,
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
        await deleteDoc(doc(firestore, 'app-users', selectedUser.id));
        
        toast({
        title: "Utente Eliminato",
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
  
  const openEditDialog = (user: AppUser) => {
    setSelectedUser(user);
    setIsEditUserDialogOpen(true);
  }

  const openDeleteDialog = (user: AppUser) => {
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
                La password iniziale sarà '0000'. L'operatore potrà cambiarla dalle impostazioni.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="username" className="text-left sm:text-right">Nome Utente</Label>
                    <Input id="username" name="username" className="col-span-1 sm:col-span-3" required />
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
                         <AvatarFallback>{getAvatarFallback(user.username)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <CardTitle>{user.username}</CardTitle>
                        <CardDescription>{user.location}</CardDescription>
                    </div>
                    <div className="ml-auto">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost">
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
                                <DropdownMenuItem className="text-destructive" onSelect={() => openDeleteDialog(user)} disabled={user.role === 'admin'}>
                                <Trash className="mr-2 h-4 w-4" />
                                Elimina
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardHeader>
                <CardContent className="flex-grow">
                    {/* Content can be added here if needed */}
                </CardContent>
                <CardFooter>
                    <Button asChild className="w-full" disabled>
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
              Aggiorna i dettagli dell'operatore.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <form onSubmit={handleEditUser} className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-username" className="text-left sm:text-right">Nome Utente</Label>
                <Input id="edit-username" name="username" defaultValue={selectedUser.username} className="col-span-1 sm:col-span-3" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-location" className="text-left sm:text-right">Luogo</Label>
                <Input id="edit-location" name="location" defaultValue={selectedUser.location} className="col-span-1 sm:col-span-3" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-password" className="text-left sm:text-right">Nuova Password</Label>
                <Input id="edit-password" name="password" placeholder="Lascia vuoto per non cambiare" className="col-span-1 sm:col-span-3" />
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
              Questa azione non può essere annullata. L'operatore verrà eliminato in modo permanente.
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
