'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where } from 'firebase/firestore';

type User = {
  id: string;
  name: string;
  email: string;
  code: string;
  role: string;
  location: string;
};

const adminUser: User = { id: "admin", name: "Amministratore", email: "admin@serveco.it", code: "070380", role: "admin", location: "Sede" };


export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedUserEmail, setSelectedUserEmail] = React.useState<string | null>(null);
  const firestore = useFirestore();
  const auth = useAuth();

  const usersCollection = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users, isLoading } = useCollection<Omit<User, 'id'>>(usersCollection);
  
  const allUsers = React.useMemo(() => {
    const operatorUsers = users || [];
    return [adminUser, ...operatorUsers];
  }, [users]);


  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = (event.currentTarget.elements.namedItem('code') as HTMLInputElement).value;
    
    if (!selectedUserEmail) {
      toast({
        variant: "destructive",
        title: "Errore di accesso",
        description: "Per favore, seleziona il tuo nome.",
      });
      return;
    }
    
    const user = allUsers.find(u => u.email === selectedUserEmail);

    if (user) {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, user.email, code);
        // On successful login, Firebase Auth state is managed by the provider.
        // We can store role/name in localStorage for quicker UI updates if needed.
        localStorage.setItem('userRole', user.role);
        localStorage.setItem('userName', user.name);
        localStorage.setItem('userId', userCredential.user.uid);
        
        router.push('/dashboard');
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Credenziali non valide",
          description: "L'email o il codice non sono corretti. Riprova.",
        });
      }
    } else {
       toast({
        variant: "destructive",
        title: "Utente non trovato",
        description: "L'utente selezionato non è valido.",
      });
    }
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="user-select">Seleziona Utente</Label>
        <Select onValueChange={setSelectedUserEmail} required>
            <SelectTrigger id="user-select" disabled={isLoading}>
                <SelectValue placeholder={isLoading ? "Caricamento..." : "Seleziona il tuo nome dall'elenco"} />
            </SelectTrigger>
            <SelectContent>
                {allUsers.map(user => (
                   <SelectItem key={user.email} value={user.email}>{user.name}</SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="code">Codice di Accesso</Label>
        <Input id="code" name="code" type="password" required />
      </div>
      <Button type="submit" className="w-full font-bold" disabled={isLoading}>
        Accedi
      </Button>
    </form>
  );
}

    