'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';

type User = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
};

// This function creates the initial users if they don't exist.
const initializeUsers = async (firestore: any) => {
  const usersCollection = collection(firestore, 'app-users');
  const snapshot = await getDocs(usersCollection);

  // If users already exist, do nothing.
  if (!snapshot.empty) {
    return;
  }

  const batch = writeBatch(firestore);
  const defaultPassword = '0000';

  // Create Admin User
  const adminDocRef = doc(firestore, 'app-users', 'admin_user');
  batch.set(adminDocRef, {
    username: 'Amministratore',
    password: defaultPassword,
    role: 'admin',
  });

  // Create 10 Operator Users
  for (let i = 1; i <= 10; i++) {
    const operatorDocRef = doc(firestore, 'app-users', `operator_${i}`);
    batch.set(operatorDocRef, {
        username: `Operatore ${i}`,
        password: defaultPassword,
        role: 'operator',
    });
  }

  await batch.commit();
  console.log('Initial users created.');
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
        const q = query(usersCollection, where('username', '==', username));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            toast({
              variant: "destructive",
              title: "Credenziali non valide",
              description: "Il nome utente o la password non sono corretti. Riprova.",
            });
            setIsLoading(false);
            return;
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data() as User;

        if (userData.password === password) {
            const userToStore = {
                id: userDoc.id,
                username: userData.username,
                role: userData.role
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

    } catch (error) {
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
