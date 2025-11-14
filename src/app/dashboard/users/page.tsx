'use client';

import * as React from 'react';
import {PlusCircle, Trash2, Edit} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {Input} from '@/components/ui/input';
import {useToast} from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useFirestore,
  useMemoFirebase,
  useCollection,
  errorEmitter,
} from '@/firebase';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import {Skeleton} from '@/components/ui/skeleton';
import { FirestorePermissionError } from '@/firebase/errors';

type AppUser = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
  location: string;
  expectedHours: number;
};

export default function UsersPage() {
  const {toast} = useToast();
  const firestore = useFirestore();
  const [isUserDialogOpen, setIsUserDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<AppUser | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
  }, [firestore]);

  const {data: users, error: usersError, isLoading} = useCollection<AppUser>(
    usersQuery
  );

  React.useEffect(() => {
    if (usersError) {
      if (!(usersError instanceof FirestorePermissionError)) {
        toast({
          title: 'Errore di Caricamento',
          description: 'Impossibile caricare gli operatori.',
          variant: 'destructive',
        });
      }
    }
  }, [usersError, toast]);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firestore) return;

    const form = event.currentTarget;
    const username = (form.elements.namedItem('username') as HTMLInputElement)
      .value;
    const password = (form.elements.namedItem('password') as HTMLInputElement)
      .value;
    const location = (form.elements.namedItem('location') as HTMLInputElement)
      .value;
    const expectedHours = Number(
      (form.elements.namedItem('expectedHours') as HTMLInputElement).value
    );

    const userData: Partial<AppUser> = {
      username,
      location,
      expectedHours,
      role: 'operator',
    };
    if (password) {
      userData.password = password;
    }

    try {
      if (isEditing && selectedUser) {
        const docRef = doc(firestore, 'app-users', selectedUser.id);
        await updateDoc(docRef, userData);
        toast({title: 'Operatore Modificato', description: `"${username}" è stato aggiornato.`});
      } else {
        if (!password) {
          toast({
            title: 'Password Obbligatoria',
            description: 'La password è obbligatoria per i nuovi operatori.',
            variant: 'destructive',
          });
          return;
        }
        const finalUserData = {...userData, password};
        const collectionRef = collection(firestore, 'app-users');
        await addDoc(collectionRef, finalUserData);
        toast({title: 'Operatore Creato', description: `"${username}" è stato aggiunto.`});
      }
    } catch (serverError) {
      let errorToEmit;
      if (isEditing && selectedUser) {
        errorToEmit = new FirestorePermissionError({
          path: doc(firestore, 'app-users', selectedUser.id).path,
          operation: 'update',
          requestResourceData: userData,
        });
      } else {
        errorToEmit = new FirestorePermissionError({
          path: collection(firestore, 'app-users').path,
          operation: 'create',
          requestResourceData: {...userData, password},
        });
      }
      errorEmitter.emit('permission-error', errorToEmit);
    }

    setIsUserDialogOpen(false);
    setSelectedUser(null);
    setIsEditing(false);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || !firestore) return;

    const userRef = doc(firestore, 'app-users', selectedUser.id);

    try {
      await deleteDoc(userRef);
      toast({
        title: 'Operatore Eliminato',
        description: `"${selectedUser.username}" è stato rimosso.`,
        variant: 'destructive',
      });
    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: userRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    }

    setIsDeleteDialogOpen(false);
    setSelectedUser(null);
  };

  const openDialog = (user: AppUser | null, editing: boolean) => {
    setSelectedUser(user);
    setIsEditing(editing);
    setIsUserDialogOpen(true);
  };

  const openDeleteDialog = (user: AppUser) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }

    if (usersError) {
      return (
        <div className="text-center text-red-500 py-12">
          <p>Errore di permessi. Non è possibile visualizzare gli operatori.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Prova a ricaricare o contatta l'assistenza.
          </p>
        </div>
      );
    }

    if (!users || users.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-12">
          <p>Non ci sono operatori. Inizia aggiungendone uno.</p>
        </div>
      );
    }

    const sortedUsers = [...users].sort((a, b) =>
      a.username.localeCompare(b.username)
    );

    return (
      <div className="space-y-4">
        {sortedUsers.map(user => (
          <Card key={user.id}>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4">
              <div>
                <CardTitle>{user.username}</CardTitle>
                <CardDescription>
                  Codice: {user.id}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDialog(user, true)}
                >
                  <Edit className="mr-2 h-4 w-4" /> Modifica
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => openDeleteDialog(user)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Elimina
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          Gestione Operatori
        </h2>
        <Button
          size="sm"
          className="gap-1"
          onClick={() => openDialog(null, false)}
        >
          <PlusCircle className="h-4 w-4" />
          Aggiungi Nuovo Operatore
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Elenco Operatori</CardTitle>
          <CardDescription>
            Aggiungi, modifica o elimina gli account degli operatori.
          </CardDescription>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>

      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Modifica Operatore' : 'Aggiungi Nuovo Operatore'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Aggiorna i dettagli dell'operatore."
                : 'Compila i campi per creare un nuovo account.'}
            </DialogDescription>
          </DialogHeader>
          <form id="user-form" onSubmit={handleFormSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="username" className="text-left sm:text-right">
                Nome Utente
              </Label>
              <Input
                id="username"
                name="username"
                className="col-span-1 sm:col-span-3"
                defaultValue={selectedUser?.username}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-left sm:text-right">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                className="col-span-1 sm:col-span-3"
                placeholder={isEditing ? 'Lascia vuoto per non cambiare' : ''}
                required={!isEditing}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUserDialogOpen(false)}
              >
                Annulla
              </Button>
              <Button type="submit">
                {isEditing ? 'Salva Modifiche' : 'Crea Operatore'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. L'operatore{' '}
              <strong>{selectedUser?.username}</strong> e tutti i suoi dati
              verranno eliminati definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser}>
              Conferma Eliminazione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

    