'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, getDocs, writeBatch, doc, query, where, getDoc, setDoc } from 'firebase/firestore';
import { FirestorePermissionError, errorEmitter } from '@/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


type User = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
};

// This function creates the initial users if they don't exist.
const initializeUsers = async (firestore: any) => {
  try {
    const adminDocRef = doc(firestore, 'app-users', 'admin_user');
    const adminDoc = await getDoc(adminDocRef);

    if (adminDoc.exists()) {
      return; // Admin user already exists
    }

    const defaultPassword = '0000';
    // Use setDoc which allows specifying an ID
    await setDoc(adminDocRef, {
      username: 'Amministratore',
      password: defaultPassword,
      role: 'admin',
    });

  } catch (error) {
    console.error("Failed to initialize admin user:", error);
    if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
        const permissionError = new FirestorePermissionError({
            path: 'app-users/admin_user',
            operation: 'write',
        });
        errorEmitter.emit('permission-error', permissionError);
    }
  }
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
        await initializeUsers(firestore);

        try {
            const usersCollection = collection(firestore, 'app-users');
            const querySnapshot = await getDocs(usersCollection);
            const userList: User[] = [];
            querySnapshot.forEach((doc) => {
                userList.push({ id: doc.id, ...doc.data() } as User);
            });
            // Sort users: Admin first, then operators
            userList.sort((a, b) => {
                if (a.role === 'admin') return -1;
                if (b.role === 'admin') return 1;
                return a.username.localeCompare(b.username);
            });
            setUsers(userList);
        } catch (error) {
            console.error("Error fetching users for dropdown", error);
            if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
                const permissionError = new FirestorePermissionError({
                    path: 'app-users',
                    operation: 'list',
                });
                errorEmitter.emit('permission-error', permissionError);
            }
        } finally {
            setIsLoading(false);
        }
    }
    setupUsers();
}, [firestore]);


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
            // Store legacy keys for compatibility with other components that may not have been updated
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
         if (error.message.includes('permission-denied') || error.message.includes('insufficient permissions')) {
            const permissionError = new FirestorePermissionError({ path: 'app-users', operation: 'list' });
            errorEmitter.emit('permission-error', permissionError);
        } else {
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
            <SelectTrigger id="username">
                <SelectValue placeholder="Seleziona un utente..." />
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
