'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, getDocs, query, where, doc, onSnapshot, writeBatch, getDoc, Firestore } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type User = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
  visibleInLogin?: boolean;
};

// This function will run once to set up the initial users if they don't exist.
const setupInitialUsers = async (firestore: Firestore) => {
    const adminUserRef = doc(firestore, 'app-users', 'admin_user');
    const adminDoc = await getDoc(adminUserRef).catch(err => {
        console.warn("Could not check for admin user, proceeding with setup. Error:", err.message);
        return null; 
    });

    if (!adminDoc || !adminDoc.exists()) {
        const batch = writeBatch(firestore);
        
        batch.set(adminUserRef, {
            username: 'Amministratore',
            password: '0000',
            role: 'admin',
            visibleInLogin: true,
        });

        const adminRoleRef = doc(firestore, 'roles_admin', 'admin_user');
        batch.set(adminRoleRef, { isAdmin: true });

        for (let i = 1; i <= 10; i++) {
            const operatorId = `operator_${i}`;
            const operatorRef = doc(firestore, 'app-users', operatorId);
            batch.set(operatorRef, {
                username: `Operatore ${i}`,
                password: '0000',
                role: 'operator',
                visibleInLogin: true,
            });
        }

        await batch.commit().catch(err => {
             if (err.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({
                    operation: 'write',
                    path: 'batch-write: setupInitialUsers'
                });
                errorEmitter.emit('permission-error', contextualError);
             } else {
                console.error("Error setting up initial users:", err);
             }
        });
    }
};


export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(true); 
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [password, setPassword] = React.useState('');

  useEffect(() => {
    if (firestore) {
      setupInitialUsers(firestore);
    }
  }, [firestore]);


  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'app-users'), where("visibleInLogin", "==", true));
  }, [firestore]);


  useEffect(() => {
    if (!usersQuery) {
        setIsLoading(false);
        return;
    }

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const userList: User[] = [];
        snapshot.forEach((doc) => {
            userList.push({ id: doc.id, ...doc.data() } as User);
        });

        userList.sort((a, b) => {
            if (a.role === 'admin') return -1;
            if (b.role === 'admin') return 1;
            const aNum = parseInt(a.username.split(' ')[1] || '0');
            const bNum = parseInt(b.username.split(' ')[1] || '0');
            return aNum - bNum;
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

            // This is a mock authentication. In a real app, you'd use Firebase Auth.
            // For now, we'll pass the user info to the dashboard.
            const userToAuth = {
              id: foundUser.id,
              username: foundUser.username,
              role: foundUser.role
            };
            
            // Instead of localStorage, we'll pass the user object via query params
            // This is NOT secure for real applications.
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
