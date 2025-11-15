'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useAuth, FirestorePermissionError, errorEmitter } from '@/firebase';
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

    // This function ensures the admin user exists in Auth and Firestore.
    const setupInitialAdmin = async () => {
        const adminId = 'admin_user'; // A fixed, known ID for the admin
        const adminEmail = 'admin@serveco.it';
        const adminPassword = '0000';

        const adminDocRef = doc(firestore, 'app-users', adminId);
        const adminRoleDocRef = doc(firestore, 'roles_admin', adminId);

        try {
            const adminDocSnap = await getDoc(adminDocRef);
            if (!adminDocSnap.exists()) {
                // Admin does not exist, let's create it in Auth and Firestore
                try {
                    // Try to create the auth user. If it fails because it already exists, that's fine.
                    const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
                     // Set the UID from Auth to ensure consistency
                    const adminAuthId = userCredential.user.uid;
                    const consistentAdminDocRef = doc(firestore, 'app-users', adminAuthId);
                    const consistentAdminRoleDocRef = doc(firestore, 'roles_admin', adminAuthId);

                     const batch = writeBatch(firestore);
                    batch.set(consistentAdminDocRef, {
                        username: "Amministratore",
                        role: "admin",
                        visibleInLogin: true,
                        firstName: "Admin",
                        lastName: "User",
                        email: adminEmail,
                    });
                    batch.set(consistentAdminRoleDocRef, {
                        email: adminEmail,
                        firstName: "Admin",
                        lastName: "User",
                    });
                    await batch.commit();


                } catch (error: any) {
                    if (error.code !== 'auth/email-already-in-use') {
                        throw error; // Re-throw other auth errors
                    }
                    // If user already exists in Auth, we can proceed to ensure Firestore docs are there.
                    const batch = writeBatch(firestore);
                    batch.set(adminDocRef, {
                        username: "Amministratore",
                        role: "admin",
                        visibleInLogin: true,
                        firstName: "Admin",
                        lastName: "User",
                        email: adminEmail,
                    }, { merge: true });
                     batch.set(adminRoleDocRef, {
                        email: adminEmail,
                        firstName: "Admin",
                        lastName: "User",
                    }, { merge: true });
                    await batch.commit();
                }
            }
        } catch (error: any) {
            console.error("Error setting up initial admin:", error);
            // Don't show toast for permission errors during setup, as they are expected if rules are strict
            if (error.code !== 'permission-denied') {
                 toast({
                    title: "Errore di Configurazione Iniziale",
                    description: "Impossibile configurare l'utente amministratore.",
                    variant: "destructive",
                });
            }
        }
    };

    setupInitialAdmin();

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


// Helper to useMemoize a query, to prevent re-renders
const useMemoFirebase = <T,>(factory: () => T, deps: React.DependencyList): T => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const memoized = React.useMemo(factory, deps);
    if (typeof memoized === 'object' && memoized !== null) {
      (memoized as any).__memo = true;
    }
    return memoized;
};
