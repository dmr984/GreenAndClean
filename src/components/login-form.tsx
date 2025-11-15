'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, getDoc, doc, setDoc, getDocs } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type User = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  visibleInLogin?: boolean;
};

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [password, setPassword] = React.useState('');

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'app-users'), where("visibleInLogin", "==", true));
  }, [firestore]);

  // Effect to ensure the admin user exists in Firestore on first load
  useEffect(() => {
    if (!firestore) return;

    const ensureAdminExists = async () => {
        const adminUsername = "Amministratore";
        const adminPassword = "0000"; // Simple code-based password

        // Check if an admin user already exists
        const q = query(collection(firestore, 'app-users'), where("role", "==", "admin"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            console.log("No admin user found, creating one...");
            // If no admin user exists, create one.
            const adminId = "admin_user"; // Use a predictable ID
            const adminDocRef = doc(firestore, 'app-users', adminId);
            const adminRoleDocRef = doc(firestore, 'roles_admin', adminId);

            try {
                await setDoc(adminDocRef, {
                    username: adminUsername,
                    role: "admin",
                    visibleInLogin: true,
                    firstName: "Admin",
                    lastName: "User",
                    password: adminPassword 
                });
                await setDoc(adminRoleDocRef, {
                     firstName: "Admin",
                     lastName: "User",
                });
                console.log("Admin user and role created successfully.");
            } catch (error) {
                console.error("Error creating admin user:", error);
                 toast({
                    variant: "destructive",
                    title: "Errore di Setup Critico",
                    description: "Impossibile configurare l'utente amministratore iniziale.",
                });
            }
        } else {
             console.log("Admin user already exists.");
        }
    };
    
    ensureAdminExists();
  }, [firestore, toast]);


  useEffect(() => {
    if (!firestore || !usersQuery) {
        setIsLoading(false);
        return;
    };

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const userList: User[] = [];
        snapshot.forEach((doc) => {
            userList.push({ id: doc.id, ...doc.data() } as User);
        });

        userList.sort((a, b) => {
            if (a.role === 'admin') return -1;
            if (b.role === 'admin') return 1;
            return a.username.localeCompare(b.username, undefined, { numeric: true });
        });

        setUsers(userList);
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching users for login:", error);
        toast({
            title: "Errore di Connessione",
            description: "Impossibile caricare la lista utenti. Riprova tra poco.",
            variant: "destructive",
        });
        setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [usersQuery, toast, firestore]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!selectedUserId || !password) {
      toast({ variant: "destructive", title: "Campi mancanti", description: "Seleziona un utente e inserisci il codice." });
      setIsLoading(false);
      return;
    }

    if (!firestore) {
         toast({ variant: "destructive", title: "Errore", description: "Database non disponibile." });
         setIsLoading(false);
         return;
    }

    try {
        const userDocRef = doc(firestore, 'app-users', selectedUserId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
             toast({ variant: "destructive", title: "Errore", description: "Utente non trovato." });
             setIsLoading(false);
             return;
        }

        const userData = userDoc.data();

        if (userData.password === password) {
             const userToStore = {
                id: userDoc.id,
                username: userData.username,
                role: userData.role,
             };
             localStorage.setItem('user', JSON.stringify(userToStore));
             window.dispatchEvent(new Event('storage')); // Notify layout to update
             router.push('/dashboard');
        } else {
             toast({
                variant: "destructive",
                title: "Credenziali non valide",
                description: "Il nome utente o il codice non sono corretti. Riprova.",
            });
        }
    } catch (error: any) {
        console.error("Login failed:", error);
        toast({
            variant: "destructive",
            title: "Errore di Login",
            description: "Si è verificato un errore durante l'accesso.",
        });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="username">Nome Utente</Label>
        <Select onValueChange={setSelectedUserId} value={selectedUserId} required>
          <SelectTrigger id="username" disabled={isLoading || users.length === 0}>
            <SelectValue placeholder={isLoading ? "Caricamento..." : "Seleziona un utente..."} />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Codice</Label>
        <Input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full font-bold" disabled={isLoading}>
        {isLoading ? 'Accesso in corso...' : 'Accedi'}
      </Button>
    </form>
  );
}
