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


  // Effect to ensure the admin user exists in Firestore on first load
  useEffect(() => {
    if (!firestore) return;

    const ensureAdminExists = async () => {
        const adminId = "admin_user"; 
        const adminDocRef = doc(firestore, 'app-users', adminId);

        try {
            const docSnap = await getDoc(adminDocRef);
            if (!docSnap.exists()) {
                console.log("No admin user found, creating one...");
                await setDoc(adminDocRef, {
                    username: "Amministratore",
                    role: "admin",
                    password: "admin", // Default password
                    visibleInLogin: true, // Make admin visible for login
                    firstName: "Admin",
                    lastName: "User",
                    workSchedule: {},
                });
                console.log("Admin user created successfully.");
            } else {
                 console.log("Admin user already exists.");
            }
        } catch (error) {
            console.error("Error checking or creating admin user:", error);
             toast({
                variant: "destructive",
                title: "Errore di Setup Critico",
                description: "Impossibile configurare l'utente amministratore iniziale.",
            });
        }
    };
    
    ensureAdminExists();
  }, [firestore, toast]);
  
  // Effect to fetch login users
  useEffect(() => {
    if (!firestore) return;
    setIsUsersLoading(true);

    const q = query(collection(firestore, 'app-users'), where("visibleInLogin", "==", true));
    const unsubscribe = getDocs(q).then(snapshot => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
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
    
    // For simplicity, we are not using a password for now.
    // The user is logged in just by selecting their profile.

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
        {isLoading ? 'Accesso in corso...' : 'Accedi'}
      </Button>
    </form>
  );
}
