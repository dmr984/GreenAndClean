'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc, setDoc, getDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type User = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
};

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(false); 
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'app-users'));
  }, [firestore]);


  useEffect(() => {
    async function setupAdmin() {
      if (!firestore) return;
      
      const adminUserDocRef = doc(firestore, 'app-users', 'admin_user');
      const adminRoleDocRef = doc(firestore, 'roles_admin', 'admin_user');

      try {
        const batch = writeBatch(firestore);
        batch.set(adminUserDocRef, {
            username: 'Amministratore',
            password: '0000',
            role: 'admin'
        }, { merge: true });
        batch.set(adminRoleDocRef, { isAdmin: true }, { merge: true });
        await batch.commit();
      } catch(e) {
        console.info("Could not set up admin user, rules might not be ready yet.", e);
      }
    }
    setupAdmin();
  }, [firestore]);

  useEffect(() => {
    if (!usersQuery) {
        setIsLoading(true);
        return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const userList: User[] = [];
        snapshot.forEach((doc) => {
            userList.push({ id: doc.id, ...doc.data() } as User);
        });

        userList.sort((a, b) => {
            if (a.role === 'admin') return -1;
            if (b.role === 'admin') return 1;
            return a.username.localeCompare(b.username);
        });
        setUsers(userList);
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching users for login:", error);
        // This toast might be aggressive if rules aren't ready, but good for debugging.
        // Consider removing for production if it shows up too often on first load.
        toast({
            title: "Errore di Connessione",
            description: "Impossibile caricare la lista utenti. Riprova tra poco.",
            variant: "destructive",
        });
        setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [usersQuery, toast]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!username || !password) {
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
    
    try {
      const usersCollection = collection(firestore, 'app-users');
      const q = query(usersCollection, where("username", "==", username), where("password", "==", password));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const foundUser = { id: userDoc.id, ...userDoc.data() } as User;

        const userToStore = {
          id: foundUser.id,
          username: foundUser.username,
          role: foundUser.role
        };
        localStorage.setItem('user', JSON.stringify(userToStore));
        
        router.push('/dashboard');
      } else {
        toast({
          variant: "destructive",
          title: "Credenziali non valide",
          description: "Il nome utente o la password non sono corretti. Riprova.",
        });
      }

    } catch (error: any) {
       toast({
          variant: "destructive",
          title: "Errore di Accesso",
          description: "Si è verificato un problema durante il login. Controlla la console.",
        });
        console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="username">Nome Utente</Label>
        <Select onValueChange={setUsername} value={username} required>
          <SelectTrigger id="username" disabled={isLoading || users.length === 0}>
            <SelectValue placeholder={isLoading ? "Caricamento..." : "Seleziona un utente..."} />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.username}>
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
