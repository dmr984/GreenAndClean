'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

type User = {
  id: string;
  name: string;
  email: string;
  code: string;
  role: string;
  location: string;
};

// Admin is hardcoded, operators are loaded from localStorage
const adminUser: User = { id: "admin", name: "Amministratore", email: "admin@serveco.it", code: "070380", role: "admin", location: "Sede" };

// Function to get users from localStorage
const getUsersFromStorage = (): User[] => {
  if (typeof window === 'undefined') return [];
  const storedUsers = localStorage.getItem('app-users');
  try {
      // If there are no stored users, let's create a default list for the demo
      if (!storedUsers) {
          const defaultOperators: User[] = [
              { id: 'USR1', name: 'Mario Rossi', email: 'mario.rossi@serveco.it', code: '1234', role: 'operator', location: 'Cantiere A' },
              { id: 'USR2', name: 'Luigi Verdi', email: 'luigi.verdi@serveco.it', code: '5678', role: 'operator', location: 'Cantiere B' },
          ];
          localStorage.setItem('app-users', JSON.stringify(defaultOperators));
          return defaultOperators;
      }
      return JSON.parse(storedUsers);
  } catch (e) {
      console.error("Failed to parse users from localStorage.", e);
      return [];
  }
};


export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<User[]>([adminUser]);
  const auth = useAuth();

  React.useEffect(() => {
    const loadUsers = () => {
        const operatorUsers = getUsersFromStorage();
        setUsers([adminUser, ...operatorUsers]);
    };
    
    loadUsers();

    window.addEventListener('storage', loadUsers);

    return () => {
        window.removeEventListener('storage', loadUsers);
    };
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = (event.currentTarget.elements.namedItem('code') as HTMLInputElement).value;
    
    if (!selectedUserId) {
      toast({
        variant: "destructive",
        title: "Errore di accesso",
        description: "Per favore, seleziona il tuo nome.",
      });
      return;
    }
    
    const user = users.find(u => u.id === selectedUserId);

    if (user) {
      try {
        await signInWithEmailAndPassword(auth, user.email, code);
        localStorage.setItem('userRole', user.role);
        localStorage.setItem('userName', user.name);
        localStorage.setItem('userId', user.id);
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
        <Select onValueChange={setSelectedUserId} required>
            <SelectTrigger id="user-select">
                <SelectValue placeholder="Seleziona il tuo nome dall'elenco" />
            </SelectTrigger>
            <SelectContent>
                {users.map(user => (
                   <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="code">Codice di Accesso</Label>
        <Input id="code" name="code" type="password" required />
      </div>
      <Button type="submit" className="w-full font-bold">
        Accedi
      </Button>
    </form>
  );
}
