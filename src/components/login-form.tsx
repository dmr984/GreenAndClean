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
import { collection, getDocs, query } from 'firebase/firestore';

type User = {
  id: string;
  name: string;
  email: string;
  code: string;
  role: string;
  location: string;
};

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedUserEmail, setSelectedUserEmail] = React.useState<string | null>(null);
  const firestore = useFirestore();
  const auth = useAuth();
  
  // We will now fetch users manually because useCollection hook has security rule issues before login
  const [users, setUsers] = React.useState<User[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCollection = collection(firestore, 'users');
        const userSnapshot = await getDocs(usersCollection);
        const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(userList);
      } catch (error) {
        console.error("Error fetching users for login:", error);
        toast({
            variant: "destructive",
            title: "Errore di connessione",
            description: "Impossibile caricare l'elenco degli utenti. Controlla le regole di sicurezza di Firestore.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (firestore) {
      fetchUsers();
    }
  }, [firestore, toast]);


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
    
    const user = users?.find(u => u.email === selectedUserEmail);

    if (user) {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, user.email, code);
        localStorage.setItem('userRole', user.role);
        localStorage.setItem('userName', user.name);
        localStorage.setItem('userId', userCredential.user.uid);
        
        router.push('/dashboard');
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Credenziali non valide",
          description: "Il nome utente o il codice non sono corretti. Riprova.",
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

  const adminUser = users.find(u => u.role === 'admin');
  const operatorUsers = users.filter(u => u.role === 'operator');


  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="user-select">Seleziona Utente</Label>
        <Select onValueChange={setSelectedUserEmail} required>
            <SelectTrigger id="user-select" disabled={isLoading}>
                <SelectValue placeholder={isLoading ? "Caricamento..." : "Seleziona il tuo nome dall'elenco"} />
            </SelectTrigger>
            <SelectContent>
                {adminUser && (
                    <SelectItem key={adminUser.id} value={adminUser.email}>{adminUser.name}</SelectItem>
                )}
                {operatorUsers?.map(user => (
                   <SelectItem key={user.id} value={user.email}>{user.name}</SelectItem>
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
