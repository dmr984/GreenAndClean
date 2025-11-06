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
  status: string;
};

// Admin is hardcoded, operators are loaded from localStorage
const adminUser = { id: "admin", name: "Amministratore", code: "070380", role: "admin", location: "Sede", status: "Attivo" };

const getUsersFromStorage = (): User[] => {
  if (typeof window === 'undefined') return [];
  const storedUsers = localStorage.getItem('app-users');
  return storedUsers ? JSON.parse(storedUsers) : [];
};


export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<User[]>([adminUser]);

  React.useEffect(() => {
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

    const allUsers = [adminUser, ...getUsersFromStorage()];
    const user = allUsers.find(u => u.id === selectedUserId);

    if (user && user.code === code) {
      localStorage.setItem('userRole', user.role);
      localStorage.setItem('userName', user.name);
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

    