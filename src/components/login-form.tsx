'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type User = {
  id: string;
  name: string;
  code: string;
  role: string;
  location: string;
};

// Admin is hardcoded, operators are loaded from localStorage
const adminUser: User = { id: "admin", name: "Amministratore", code: "070380", role: "admin", location: "Sede" };

// Function to get users from localStorage
const getUsersFromStorage = (): User[] => {
  if (typeof window === 'undefined') return [];
  const storedUsers = localStorage.getItem('app-users');
  try {
      // If there are stored users, parse them, otherwise return an empty array.
      return storedUsers ? JSON.parse(storedUsers) : [];
  } catch (e) {
      console.error("Failed to parse users from localStorage.", e);
      // If parsing fails, return an empty array.
      return [];
  }
};


export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<User[]>([adminUser]);

  React.useEffect(() => {
    // We only load operator users from storage. The admin user is always present.
    const operatorUsers = getUsersFromStorage();
    setUsers([adminUser, ...operatorUsers]);
  }, []);

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
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
    
    // The 'users' state already contains the admin and all operators.
    const user = users.find(u => u.id === selectedUserId);

    if (user && user.code === code) {
      localStorage.setItem('userRole', user.role);
      localStorage.setItem('userName', user.name);
      localStorage.setItem('userId', user.id); // Save user ID
      router.push('/dashboard');
    } else {
       toast({
        variant: "destructive",
        title: "Credenziali non valide",
        description: "Il codice inserito non è corretto. Riprova.",
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
