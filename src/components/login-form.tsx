'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, where, doc, setDoc, getDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';

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
    async function setupUsers() {
        if (!firestore) return;
        setIsLoading(true);

        try {
            // Ensure admin user exists.
            const adminUserDocRef = doc(firestore, 'app-users', 'admin_user');
            const adminRoleDocRef = doc(firestore, 'roles_admin', 'admin_user');

            // This initial getDoc might fail if rules are not permissive enough for reads.
            // However, the rules have been updated to allow unauthenticated reads on app-users.
            // And unauthenticated writes on roles_admin.
            try {
              const adminDoc = await getDoc(adminUserDocRef);
              if (!adminDoc.exists()) {
                  // This part should only run once in the app's lifetime.
                  // The rules specifically allow this for unauthenticated users.
                  await setDoc(adminUserDocRef, {
                      username: 'Amministratore',
                      password: '0000',
                      role: 'admin'
                  });
                   await setDoc(adminRoleDocRef, { isAdmin: true });
              }
            } catch (e) {
                // This might fail if rules are not set up, but we proceed
                console.warn("Could not set up admin user, might already exist or rules are restrictive.", e);
            }


            // Fetch all users
            const usersCollection = collection(firestore, 'app-users');
            const querySnapshot = await getDocs(usersCollection);
            const userList: User[] = [];
            querySnapshot.forEach((doc) => {
                userList.push({ id: doc.id, ...doc.data() } as User);
            });

            userList.sort((a, b) => {
                if (a.role === 'admin') return -1;
                if (b.role === 'admin') return 1;
                return a.username.localeCompare(b.username);
            });
            setUsers(userList);

        } catch (error: any) {
             const contextualError = new FirestorePermissionError({
                path: 'app-users',
                operation: 'list', 
            });
            errorEmitter.emit('permission-error', contextualError);
        } finally {
            setIsLoading(false);
        }
    }

    if (firestore) {
      setupUsers();
    }
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
        const contextualError = new FirestorePermissionError({
            path: 'app-users',
            operation: 'list',
        });
        errorEmitter.emit('permission-error', contextualError);
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
