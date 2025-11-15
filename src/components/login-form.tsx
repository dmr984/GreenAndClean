'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, getDocs, query, where, doc, onSnapshot, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type User = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
  visibleInLogin?: boolean;
};

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(true); 
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [password, setPassword] = React.useState('');

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'app-users'), where("visibleInLogin", "==", true));
  }, [firestore]);


  useEffect(() => {
    if (!firestore) {
        setIsLoading(false);
        return;
    };

    // This function ensures the admin user exists and has the correct password.
    const setupInitialAdmin = async () => {
        const adminUsername = 'Amministratore';
        const adminPassword = '0000';
        const adminRole = 'admin';
        const adminId = 'admin_user'; // A fixed, known ID for the admin doc

        const adminDocRef = doc(firestore, 'app-users', adminId);
        const adminRoleDocRef = doc(firestore, 'roles_admin', adminId);

        try {
            const adminDocSnap = await getDoc(adminDocRef);

            if (!adminDocSnap.exists()) {
                // Admin does not exist, create it in a batch
                 const batch = writeBatch(firestore);
                 const newAdminData = {
                    username: adminUsername,
                    password: adminPassword,
                    role: adminRole,
                    visibleInLogin: true,
                    firstName: "Admin",
                    lastName: "User",
                    email: "admin@serveco.it"
                };
                 const adminRoleData = {
                    email: "admin@serveco.it",
                    firstName: "Admin",
                    lastName: "User",
                };
                batch.set(adminDocRef, newAdminData);
                batch.set(adminRoleDocRef, adminRoleData);
                await batch.commit();

            } else {
                // Admin exists, check and update password if necessary
                if (adminDocSnap.data().password !== adminPassword) {
                    await setDoc(adminDocRef, { password: adminPassword }, { merge: true });
                }
            }
        } catch (error: any) {
            if (error.code === 'permission-denied') {
                 const contextualError = new FirestorePermissionError({
                    operation: 'get', 
                    path: adminDocRef.path,
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                console.error("Error setting up initial admin:", error);
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
            if (a.id === 'admin_user') return -1;
            if (b.id === 'admin_user') return 1;
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
        setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [usersQuery, toast, firestore]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!selectedUserId || !password) {
      toast({
        variant: "destructive",
        title: "Campi mancanti",
        description: "Seleziona un utente e inserisci la password.",
      });
      setIsLoading(false);
      return;
    }

    if (!firestore) {
      toast({
        variant: "destructive",
        title: "Errore di sistema",
        description: "Database non disponibile. Riprova più tardi.",
      });
      setIsLoading(false);
      return;
    }
    
    const userDocRef = doc(firestore, 'app-users', selectedUserId);
    
    try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists() && docSnap.data().password === password) {
            const foundUser = { id: docSnap.id, ...docSnap.data() } as User;

            const userToAuth = {
              id: foundUser.id,
              username: foundUser.username,
              role: foundUser.role
            };
            
            localStorage.setItem('user', JSON.stringify(userToAuth));
            
            router.push('/dashboard');
        } else {
            toast({
            variant: "destructive",
            title: "Credenziali non valide",
            description: "Il nome utente o la password non sono corretti. Riprova.",
            });
            setIsLoading(false);
        }
    } catch (error: any) {
       if (error.code === 'permission-denied') {
          const contextualError = new FirestorePermissionError({
              operation: 'get',
              path: userDocRef.path
          });
          errorEmitter.emit('permission-error', contextualError);
       } else {
           toast({
              variant: "destructive",
              title: "Errore di Accesso",
              description: "Si è verificato un problema durante il login.",
            });
       }
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
