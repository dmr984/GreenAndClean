'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, writeBatch } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, Auth } from "firebase/auth";


type User = {
  id: string;
  username: string;
  email: string;
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
  
  
   // Effect to ensure the admin user exists on first load
   useEffect(() => {
    if (!firestore) return;
    const auth = getAuth();

    const setupInitialAdmin = async () => {
        const adminEmail = 'admin@serveco.it';
        const adminPassword = 'password'; // Use a secure password
        const adminUsername = "Amministratore";

        try {
            // First, try to create the user in Firebase Auth.
            const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
            const adminId = userCredential.user.uid;

            // If creation was successful, this is the first run. Let's create the Firestore docs.
            const batch = writeBatch(firestore);
            const adminDocRef = doc(firestore, 'app-users', adminId);
            const adminRoleDocRef = doc(firestore, 'roles_admin', adminId);

            batch.set(adminDocRef, {
                username: adminUsername,
                role: "admin",
                visibleInLogin: true,
                firstName: "Admin",
                lastName: "User",
                email: adminEmail,
            });

            batch.set(adminRoleDocRef, {
                firstName: "Admin",
                lastName: "User",
            });

            await batch.commit();
            console.log("Admin user and role documents created in Firestore.");

        } catch (error: any) {
            // If the user already exists, that's fine. We just log it and move on.
            // Any other error during setup is a problem.
            if (error.code === 'auth/email-already-in-use') {
                console.log('Admin user already exists in Firebase Auth. Setup is not needed.');
            } else {
                console.error("Critical error during initial admin setup:", error);
                 toast({
                    variant: "destructive",
                    title: "Errore di Setup Critico",
                    description: "Impossibile configurare l'utente amministratore iniziale.",
                });
            }
        }
    };
    
    setupInitialAdmin();
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
    
    const selectedUser = users.find(u => u.id === selectedUserId);
    if (!selectedUser) {
        toast({ variant: "destructive", title: "Errore", description: "Utente selezionato non valido." });
        setIsLoading(false);
        return;
    }

    try {
        const auth = getAuth();
        await signInWithEmailAndPassword(auth, selectedUser.email, password);
        // Successful login is handled by the onAuthStateChanged listener in the layout.
        // No need to call router.push here.
    } catch (error: any) {
        console.error("Login failed:", error.code);
        toast({
            variant: "destructive",
            title: "Credenziali non valide",
            description: "Il nome utente o il codice non sono corretti. Riprova.",
        });
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
