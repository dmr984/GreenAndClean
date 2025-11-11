'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { FirestorePermissionError, errorEmitter } from '@/firebase';

type User = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
};

// This function creates the initial users if they don't exist.
const initializeUsers = async (firestore: any) => {
  const usersCollectionRef = collection(firestore, 'app-users');
  try {
    const snapshot = await getDocs(usersCollectionRef);

    // If users already exist, do nothing.
    if (!snapshot.empty) {
      return;
    }

    const batch = writeBatch(firestore);
    const defaultPassword = '0000';

    // Create Admin User
    const adminData = {
      username: 'Amministratore',
      password: defaultPassword,
      role: 'admin',
    };
    const adminDocRef = doc(firestore, 'app-users', 'admin_user');
    batch.set(adminDocRef, adminData);

    // Create 10 Operator Users
    for (let i = 1; i <= 10; i++) {
      const operatorData = {
        username: `Operatore ${i}`,
        password: defaultPassword,
        role: 'operator',
      };
      const operatorDocRef = doc(firestore, 'app-users', `operator_${i}`);
      batch.set(operatorDocRef, operatorData);
    }
    
    // Non-blocking commit with contextual error handling
    batch.commit().then(() => {
        console.log('Initial users created.');
    }).catch(error => {
        console.error("Batch commit failed:", error);
        // We can't know which specific doc failed in a batch, so we emit a general error for the collection.
        const permissionError = new FirestorePermissionError({
            path: 'app-users',
            operation: 'create',
            requestResourceData: {note: 'Batch write for initial users.'}
        });
        errorEmitter.emit('permission-error', permissionError);
    });

  } catch (error) {
    console.error("Failed to check for existing users:", error);
    // This getDocs call can also fail due to permissions
    if (error instanceof Error && error.message.includes('permission-denied')) {
        const permissionError = new FirestorePermissionError({
            path: 'app-users',
            operation: 'list',
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
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  React.useEffect(() => {
    if (firestore) {
      initializeUsers(firestore);
    }
  }, [firestore]);


  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!username || !password) {
      toast({
        variant: "destructive",
        title: "Campi mancanti",
        description: "Inserisci nome utente e password.",
      });
      setIsLoading(false);
      return;
    }
    
    try {
        const usersCollection = collection(firestore, 'app-users');
        const querySnapshot = await getDocs(usersCollection);

        let foundUser: (User & { id: string }) | null = null;
        querySnapshot.forEach((doc) => {
            const userData = doc.data() as User;
            if (userData.username === username && userData.password === password) {
                foundUser = { ...userData, id: doc.id };
            }
        });


        if (foundUser) {
            const userToStore = {
                id: foundUser.id,
                username: foundUser.username,
                role: foundUser.role
            };
            localStorage.setItem('user', JSON.stringify(userToStore));
            // Store role and username for other parts of the app that still use it
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
         if (error.message.includes('permission-denied')) {
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
        <Input id="username" name="username" value={username} onChange={e => setUsername(e.target.value)} required />
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
