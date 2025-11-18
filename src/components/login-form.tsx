'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

type User = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  password?: string;
  visibleInLogin?: boolean;
};

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');

  // Effect to fetch login users
  useEffect(() => {
    if (!firestore) return;
    setIsUsersLoading(true);

    const q = query(collection(firestore, 'app-users'), where("visibleInLogin", "==", true));
    
    getDocs(q).then(async (snapshot) => {
      if (snapshot.empty) {
        // If no users are found, create the default admin user.
        // This is a failsafe for the very first run of the application.
        const adminId = "admin_user"; 
        const adminDocRef = doc(firestore, 'app-users', adminId);
        const adminData = {
            username: "Amministratore",
            role: "admin" as const,
            password: "admin",
            visibleInLogin: true,
            firstName: "Admin",
            lastName: "User",
            workSchedule: {},
        };
        await setDoc(adminDocRef, adminData);
        setUsers([{id: adminId, ...adminData}]);
      } else {
        const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(usersData);
      }
      setIsUsersLoading(false);
    }).catch(error => {
      console.error("Error fetching login users:", error);
      toast({ title: "Errore", description: "Impossibile caricare la lista utenti.", variant: "destructive" });
      setIsUsersLoading(false);
    });

  }, [firestore, toast]);


  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!selectedUserId) {
      toast({ variant: "destructive", title: "Campo mancante", description: "Seleziona un nome utente." });
      setIsLoading(false);
      return;
    }

    const selectedUser = users.find(u => u.id === selectedUserId);
    
    if (!selectedUser) {
        toast({ variant: "destructive", title: "Login Fallito", description: "Utente non trovato." });
        setIsLoading(false);
        return;
    }
        
    const userToStore = {
        id: selectedUser.id,
        username: selectedUser.username,
        role: selectedUser.role,
    };
    
    localStorage.setItem('user', JSON.stringify(userToStore));
    // Use window.location to force a hard reload, ensuring all states are fresh.
    window.location.href = '/dashboard';
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="username">Nome Utente</Label>
        <Select onValueChange={setSelectedUserId} value={selectedUserId} required disabled={isUsersLoading || isLoading}>
            <SelectTrigger id="username">
                <SelectValue placeholder={isUsersLoading ? "Caricamento utenti..." : "Seleziona il tuo profilo"} />
            </SelectTrigger>
            <SelectContent>
                {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                        {user.username}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>
      
      <Button type="submit" className="w-full font-bold" disabled={isLoading || isUsersLoading}>
        {isLoading ? <Loader2 className="animate-spin" /> : 'Accedi'}
      </Button>
    </form>
  );
}
