'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
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

  useEffect(() => {
    async function fetchUsers() {
      if (!firestore) return;
      setIsLoading(true);

      try {
        const usersCollection = collection(firestore, 'app-users');
        const querySnapshot = await getDocs(usersCollection);
        const userList: User[] = [];
        querySnapshot.forEach((doc) => {
          userList.push({ id: doc.id, ...doc.data() } as User);
        });
        
        // Ensure admin user exists, if not, add it for the first run.
        if (!userList.some(u => u.role === 'admin')) {
            // This is a simple seeding mechanism. In a real app, this would be handled by a setup script.
            // For now, we assume an admin user "Amministratore" with password "0000" should exist.
            // We won't create it here to keep client-side logic simple, but we'll add it to the dropdown
            // to allow the first login.
            userList.unshift({id: 'admin_user', username: 'Amministratore', role: 'admin'});
        }

        userList.sort((a, b) => {
          if (a.role === 'admin') return -1;
          if (b.role === 'admin') return 1;
          return a.username.localeCompare(b.username);
        });
        setUsers(userList);

      } catch (error: any) {
        console.error("Error fetching users:", error);
        toast({
          variant: "destructive",
          title: "Errore di caricamento",
          description: "Impossibile caricare l'elenco degli utenti. Controlla la console per i dettagli."
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchUsers();
  }, [firestore, toast]);

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
    
    // Special case for initial admin login
    if (username === 'Amministratore' && password === '0000') {
         const userToStore = {
          id: 'admin_user',
          username: 'Amministratore',
          role: 'admin'
        };
        localStorage.setItem('user', JSON.stringify(userToStore));
        localStorage.setItem('userRole', userToStore.role);
        localStorage.setItem('userName', userToStore.username);
        localStorage.setItem('userId', userToStore.id);
        router.push('/dashboard');
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
        localStorage.setItem('userRole', foundUser.role);
        localStorage.setItem('userName', foundUser.username);
        localStorage.setItem('userId', foundUser.id);

        router.push('/dashboard');
      } else {
        toast({
          variant: "destructive",
          title: "Credenziali non valide",
          description: "Il nome utente o la password non sono corretti. Riprova.",
        });
      }

    } catch (error: any) {
        console.error("Login error:", error);
        toast({
          variant: "destructive",
          title: "Errore di accesso",
          description: "Si è verificato un errore durante il login. Riprova.",
        });
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
