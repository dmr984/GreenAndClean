'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc, onSnapshot, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type User = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  visibleInLogin?: boolean;
  password?: string;
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
  
  // Effect to ensure the admin user exists on first load
  useEffect(() => {
    if (!firestore) return;
    
    const ensureAdminExists = async () => {
        const adminId = "admin_user";
        const adminDocRef = doc(firestore, 'app-users', adminId);
        const adminRoleDocRef = doc(firestore, 'roles_admin', adminId);

        try {
            const adminDoc = await getDoc(adminDocRef);
            if (!adminDoc.exists()) {
                const batch = writeBatch(firestore);
                batch.set(adminDocRef, {
                    username: "Amministratore",
                    role: "admin",
                    visibleInLogin: true,
                    firstName: "Admin",
                    lastName: "User",
                    password: "0000",
                });
                batch.set(adminRoleDocRef, {
                    firstName: "Admin",
                    lastName: "User",
                });
                await batch.commit();
                console.log("Admin user and role created in Firestore.");
            }
        } catch (error) {
            console.error("Error ensuring admin user exists:", error);
        }
    };
    
    ensureAdminExists();
  }, [firestore]);


  useEffect(() => {
    if (!firestore || !usersQuery) {
        setIsLoading(false);
        return;
    };

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
        setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [usersQuery, toast, firestore]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!selectedUserId || !password) {
      toast({ variant: "destructive", title: "Campi mancanti", description: "Seleziona un utente e inserisci il codice." });
      setIsLoading(false);
      return;
    }
    
    const selectedUser = users.find(u => u.id === selectedUserId);
    if (!selectedUser) {
        toast({ variant: "destructive", title: "Errore", description: "Utente selezionato non valido." });
        setIsLoading(false);
        return;
    }

    // Custom password check
    if (selectedUser.password === password) {
        // On successful login, save user info to localStorage and redirect
        const userToStore = {
            id: selectedUser.id,
            username: selectedUser.username,
            role: selectedUser.role
        };
        localStorage.setItem('user', JSON.stringify(userToStore));
        window.dispatchEvent(new Event('storage')); // Notify other tabs/windows
        router.push('/dashboard');
        
    } else {
         toast({
            variant: "destructive",
            title: "Credenziali non valide",
            description: "Il nome utente o il codice non sono corretti. Riprova.",
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
        <Label htmlFor="password">Codice</Label>
        <Input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full font-bold" disabled={isLoading}>
        {isLoading ? 'Accesso in corso...' : 'Accedi'}
      </Button>
    </form>
  );
}

    