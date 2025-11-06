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


type User = {
  id: string;
  name: string;
  code: string;
  location: string;
  role: string;
};

// Function to get users from localStorage
const getUsersFromStorage = (): User[] => {
  if (typeof window === 'undefined') return [];
  const storedUsers = localStorage.getItem('app-users');
  try {
    return storedUsers ? JSON.parse(storedUsers) : [];
  } catch (e) {
    console.error("Failed to parse users from localStorage", e);
    return [];
  }
};

// Function to save users to localStorage
const saveUsersToStorage = (users: User[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('app-users', JSON.stringify(users));
  window.dispatchEvent(new Event('storage'));
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
  const [users, setUsers] = React.useState<User[]>([]);
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = React.useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    const storedUsers = getUsersFromStorage();
    setUsers(storedUsers);
  }, []);

  const handleAddUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;

    const newUser: User = {
      id: `USR${String(Date.now()).slice(-6)}`,
      name,
      code,
      location,
      role: 'operator' // Role is fixed to 'operator'
    };

    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    saveUsersToStorage(updatedUsers);

    setIsNewUserDialogOpen(false);
    toast({
      title: "Utente Aggiunto",
      description: `L'utente ${name} è stato aggiunto con successo.`,
    });
    form.reset();
  };

  const handleEditUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) return;

    const form = event.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;

    const updatedUser = { ...selectedUser, name, code, location };

    const updatedUsers = users.map(u => u.id === selectedUser.id ? updatedUser : u);
    setUsers(updatedUsers);
    saveUsersToStorage(updatedUsers);

    setIsEditUserDialogOpen(false);
    setSelectedUser(null);
    toast({
      title: "Utente Modificato",
      description: `I dati di ${name} sono stati aggiornati.`,
    });
  };
  
  const handleDeleteUser = () => {
    if (!selectedUser) return;
    
    const updatedUsers = users.filter(user => user.id !== selectedUser.id);
    setUsers(updatedUsers);
    saveUsersToStorage(updatedUsers);

    toast({
      title: "Utente Eliminato",
      description: `L'utente è stato rimosso dal sistema.`,
      variant: "destructive"
    });
    setIsDeleteDialogOpen(false);
    setSelectedUser(null);
  }
  
  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setIsEditUserDialogOpen(true);
  }

  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  }

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
                Compila i campi per creare un nuovo operatore.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-left sm:text-right">Nome</Label>
                <Input id="name" name="name" className="col-span-1 sm:col-span-3" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-left sm:text-right">Luogo</Label>
                <Input id="location" name="location" className="col-span-1 sm:col-span-3" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="code" className="text-left sm:text-right">Codice</Label>
                <Input id="code" name="code" className="col-span-1 sm:col-span-3" required />
                </div>
                <DialogFooter>
                <Button type="submit">Crea Utente</Button>
                </DialogFooter>
            </form>
            </DialogContent>
        </Dialog>
      </div>
      
      {users.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {users.map((user) => (
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
                                <DropdownMenuItem className="text-destructive" onSelect={() => openDeleteDialog(user)}>
                                <Trash className="mr-2 h-4 w-4" />
                                Elimina
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardHeader>
                <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground">Codice: {user.code}</p>
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed shadow-sm h-64 p-4 text-center">
          <h3 className="text-2xl font-bold tracking-tight">Nessun operatore trovato</h3>
          <p className="text-sm text-muted-foreground">Inizia aggiungendo un nuovo operatore.</p>
           <Button className="mt-4" onClick={() => setIsNewUserDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Aggiungi Operatore
          </Button>
        </div>
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
                <Label htmlFor="edit-name" className="text-left sm:text-right">Nome</Label>
                <Input id="edit-name" name="name" defaultValue={selectedUser.name} className="col-span-1 sm:col-span-3" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-location" className="text-left sm:text-right">Luogo</Label>
                <Input id="edit-location" name="location" defaultValue={selectedUser.location} className="col-span-1 sm:col-span-3" required />
              </div>
               <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-code" className="text-left sm:text-right">Codice</Label>
                <Input id="edit-code" name="code" defaultValue={selectedUser.code} className="col-span-1 sm:col-span-3" required />
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
