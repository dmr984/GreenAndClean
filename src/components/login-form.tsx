'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, getDocs, doc, query, where, getDoc, setDoc } from 'firebase/firestore';
import { Firestore, FirestoreError } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
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
    async function setupAndFetchUsers() {
      if (!firestore) {
        return;
      }
      setIsLoading(true);

      // Step 1: Initialize Admin User
      const adminDocRef = doc(firestore, 'app-users', 'admin_user');
      try {
        const adminDoc = await getDoc(adminDocRef);
        if (!adminDoc.exists()) {
          try {
            await setDoc(adminDocRef, {
              username: 'Amministratore',
              password: '0000',
              role: 'admin',
            });
          } catch (error) {
            if (error instanceof FirestoreError && error.code === 'permission-denied') {
              const permissionError = new FirestorePermissionError({
                path: adminDocRef.path,
                operation: 'create',
                requestResourceData: { username: 'Amministratore', role: 'admin' }
              });
              errorEmitter.emit('permission-error', permissionError);
            }
            return; // Stop if we can't create the admin
          }
        }
      } catch (error) {
        if (error instanceof FirestoreError && error.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: adminDocRef.path,
            operation: 'get',
          });
          errorEmitter.emit('permission-error', permissionError);
        }
        setIsLoading(false);
        return; // Stop if we can't check for the admin
      }

      // Step 2: Fetch all users for the dropdown
      try {
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
        if (error instanceof FirestoreError && error.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: 'app-users',
            operation: 'list',
          });
          errorEmitter.emit('permission-error', permissionError);
        } else {
          console.error("Error fetching users for dropdown:", error);
          toast({
            variant: "destructive",
            title: "Errore di caricamento",
            description: "Impossibile caricare l'elenco degli utenti."
          });
        }
      } finally {
        setIsLoading(false);
      }
    }

    setupAndFetchUsers();
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
      // Direct query for the specific user and password
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
      if (error instanceof FirestoreError && error.code === 'permission-denied') {
        const permissionError = new FirestorePermissionError({
          path: 'app-users', // The query is on this collection
          operation: 'list', // A query is a 'list' operation under the hood
        });
        errorEmitter.emit('permission-error', permissionError);
      } else {
        console.error("Login error:", error);
        toast({
          variant: "destructive",
          title: "Errore di accesso",
          description: "Si è verificato un errore durante il login. Riprova.",
        });
      }
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
