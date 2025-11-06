"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, File, Trash, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import placeholder from '@/lib/placeholder-images.json';
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type User = {
  id: string;
  name: string;
  code: string;
  role: string;
  status: string;
};

const initialUsers: User[] = [
  {
    id: "USR001",
    name: "Mario Rossi",
    code: "123456",
    role: "Operatore",
    status: "Attivo",
  },
  {
    id: "USR002",
    name: "Anna Bianchi",
    code: "654321",
    role: "Operatore",
    status: "Attivo",
  },
  {
    id: "USR003",
    name: "Luca Verdi",
    code: "112233",
    role: "Operatore",
    status: "Inattivo",
  },
  {
    id: "USR004",
    name: "Giulia Neri",
    code: "332211",
    role: "Supervisore",
    status: "Attivo",
  },
  {
    id: "USR005",
    name: "Amministratore",
    code: "070380",
    role: "Admin",
    status: "Attivo",
  },
];

export default function UsersPage() {
  const userAvatar = placeholder.placeholderImages.find(p => p.id === 'user-avatar');
  const { toast } = useToast();
  const [users, setUsers] = React.useState(initialUsers);
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = React.useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null);

  const handleAddUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    const role = (form.elements.namedItem('role') as HTMLInputElement).value;

    const newUser: User = {
      id: `USR${String(users.length + 1).padStart(3, '0')}`,
      name,
      code,
      role,
      status: 'Attivo',
    };

    setUsers(prevUsers => [...prevUsers, newUser]);
    setIsNewUserDialogOpen(false);
    toast({
      title: "Utente Aggiunto",
      description: `L'utente ${name} è stato aggiunto con successo.`,
    });
  };

  const handleEditUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) return;

    const form = event.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    const role = (form.elements.namedItem('role') as HTMLInputElement).value;
    const status = (form.elements.namedItem('status') as HTMLInputElement).value;

    const updatedUser: User = { ...selectedUser, name, code, role, status };

    setUsers(prevUsers => prevUsers.map(u => u.id === selectedUser.id ? updatedUser : u));
    setIsEditUserDialogOpen(false);
    setSelectedUser(null);
    toast({
      title: "Utente Modificato",
      description: `I dati di ${name} sono stati aggiornati.`,
    });
  };
  
  const handleDeleteUser = () => {
    if (!selectedUser) return;
    
    setUsers(prevUsers => prevUsers.filter(user => user.id !== selectedUser.id));
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
  
  const displayedUsers = users.filter(user => user.role !== 'Admin');

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Gestione Utenti</h2>
      </div>
      <Tabs defaultValue="all">
        <div className="flex items-center">
          <TabsList>
            <TabsTrigger value="all">Tutti</TabsTrigger>
            <TabsTrigger value="active">Attivi</TabsTrigger>
            <TabsTrigger value="inactive">Inattivi</TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1">
              <File className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Esporta
              </span>
            </Button>
            <Dialog open={isNewUserDialogOpen} onOpenChange={setIsNewUserDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 gap-1">
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                    Aggiungi Utente
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Aggiungi Nuovo Utente</DialogTitle>
                  <DialogDescription>
                    Compila i campi per creare un nuovo operatore e assegnare un codice di accesso.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddUser} className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Nome</Label>
                    <Input id="name" name="name" className="col-span-3" required />
                  </div>
                   <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="code" className="text-right">Codice</Label>
                    <Input id="code" name="code" className="col-span-3" required />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="role" className="text-right">Ruolo</Label>
                    <Input id="role" name="role" defaultValue="Operatore" className="col-span-3" required />
                  </div>
                  <DialogFooter>
                    <Button type="submit">Crea Utente</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>Utenti</CardTitle>
              <CardDescription>
                Gestisci gli utenti del sistema, visualizza i loro ruoli e lo stato.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden w-[100px] sm:table-cell">
                      <span className="sr-only">Avatar</span>
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Codice</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>
                      <span className="sr-only">Azioni</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="hidden sm:table-cell">
                        <Avatar className="h-9 w-9">
                          {userAvatar && <AvatarImage src={userAvatar.imageUrl} alt="Avatar" />}
                          <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{user.name}</TableCell>
                       <TableCell className="font-mono">******</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'Admin' ? 'destructive' : 'secondary'}>{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'Attivo' ? 'default' : 'outline'}>{user.status}</Badge>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Edit User Dialog */}
      <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Utente</DialogTitle>
            <DialogDescription>
              Aggiorna i dettagli dell'utente.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <form onSubmit={handleEditUser} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="text-right">Nome</Label>
                <Input id="edit-name" name="name" defaultValue={selectedUser.name} className="col-span-3" required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-code" className="text-right">Codice</Label>
                <Input id="edit-code" name="code" defaultValue={selectedUser.code} className="col-span-3" required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-role" className="text-right">Ruolo</Label>
                <Input id="edit-role" name="role" defaultValue={selectedUser.role} className="col-span-3" required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-status" className="text-right">Stato</Label>
                <Input id="edit-status" name="status" defaultValue={selectedUser.status} className="col-span-3" required />
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
              Questa azione non può essere annullata. L'utente verrà eliminato in modo permanente.
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
