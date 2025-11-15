'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useAuth, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc, onSnapshot, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';


type User = {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'operator';
  visibleInLogin?: boolean;
};

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();
  const [isLoading, setIsLoading] = React.useState(true); 
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [password, setPassword] = React.useState('');

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'app-users'), where("visibleInLogin", "==", true));
  }, [firestore]);


  useEffect(() => {
    if (!firestore || !auth) {
        setIsLoading(false);
        return;
    };

    // This function ensures the admin user exists in Firestore.
    // It runs once and is simpler than trying to create the Auth user here.
    const ensureAdminDocExists = async () => {
        // This is a known, hardcoded UID for a pre-provisioned admin user.
        // In a real app, this would be handled differently, but for this setup it's reliable.
        const adminId = 'admin_user'; 
        const adminDocRef = doc(firestore, 'app-users', adminId);
        const roleDocRef = doc(firestore, 'roles_admin', adminId);

        try {
            const adminDoc = await getDoc(adminDocRef);
            if (!adminDoc.exists()) {
                // If the admin documents don't exist, create them.
                const batch = writeBatch(firestore);
                 batch.set(adminDocRef, {
                    username: "Amministratore",
                    role: "admin",
                    visibleInLogin: true,
                    firstName: "Admin",
                    lastName: "User",
                    email: 'admin@serveco.it',
                });
                batch.set(roleDocRef, {
                    email: 'admin@serveco.it',
                    firstName: "Admin",
                    lastName: "User",
                });
                await batch.commit();
                console.log("Admin user documents created in Firestore.");
            }
        } catch (error) {
            console.error("Error ensuring admin documents exist:", error);
        }
    };

    ensureAdminDocExists();

    if (!usersQuery) return;

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const userList: User[] = [];
        snapshot.forEach((doc) => {
            userList.push({ id: doc.id, ...doc.data() } as User);
        });

        userList.sort((a, b) => {
            if (a.role === 'admin') return -1;
            if (b.role === 'admin') return 1;
            return a.username.localeCompare(b.username, undefined, { numeric: true });
        });

        setUsers(userList);
        setIsLoading(false);
    }, (error) => {
        if (error.code === 'permission-denied' && firestore) {
             const contextualError = new FirestorePermissionError({
                operation: 'list',
                path: 'app-users'
            });
            errorEmitter.emit('permission-error', contextualError);
        } else {
            console.error("Error fetching users for login:", error);
            toast({
                title: "Errore di Connessione",
                description: "Impossibile caricare la lista utenti. Riprova tra poco.",
                variant: "destructive",
            });
        }
        // It's important to set loading to false even on error
        setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [usersQuery, toast, firestore, auth]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!selectedUserId || !password) {
      toast({ variant: "destructive", title: "Campi mancanti", description: "Seleziona un utente e inserisci la password." });
      setIsLoading(false);
      return;
    }
    
    if (!auth) {
       toast({ variant: "destructive", title: "Errore di sistema", description: "Servizio di autenticazione non disponibile." });
       setIsLoading(false);
       return;
    }
    
    const selectedUser = users.find(u => u.id === selectedUserId);
    if (!selectedUser) {
        toast({ variant: "destructive", title: "Errore", description: "Utente selezionato non valido." });
        setIsLoading(false);
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, selectedUser.email, password);
        // On successful sign-in, the onAuthStateChanged listener in the layout will handle the redirect.
        // No need to call router.push here.
    } catch (error: any) {
        console.error("Login failed:", error.code);
        toast({
            variant: "destructive",
            title: "Credenziali non valide",
            description: "Il nome utente o la password non sono corretti. Riprova.",
        });
        setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="username">Nome Utente</Label>
        <Select onValueChange={setSelectedUserId} value={selectedUserId} required>
          <SelectTrigger id="username" disabled={isLoading || users.length === 0}>
            <SelectValue placeholder={isLoading ? "Caricamento..." : "Seleziona un utente..."} />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full font-bold" disabled={isLoading}>
        {isLoading ? 'Accesso in corso...' : 'Accedi'}
      </Button>
    </form>
  );
}
