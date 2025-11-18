'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, getDoc, doc, setDoc, getDocs } from 'firebase/firestore';
import { Input } from '@/components/ui/input';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');


  // Effect to ensure the admin user exists in Firestore on first load
  useEffect(() => {
    if (!firestore) return;

    const ensureAdminExists = async () => {
        const adminUsername = "Amministratore";
        const q = query(collection(firestore, 'app-users'), where("role", "==", "admin"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            console.log("No admin user found, creating one...");
            const adminId = "admin_user"; 
            const adminDocRef = doc(firestore, 'app-users', adminId);
            const adminRoleDocRef = doc(firestore, 'roles_admin', adminId);

            try {
                await setDoc(adminDocRef, {
                    username: adminUsername,
                    role: "admin",
                    password: "admin", // Default password
                    visibleInLogin: false, // Admin should not be in login dropdown
                    firstName: "Admin",
                    lastName: "User",
                    workSchedule: {},
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


  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!username || !password) {
      toast({ variant: "destructive", title: "Campi mancanti", description: "Inserisci nome utente e codice." });
      setIsLoading(false);
      return;
    }

    if (!firestore) {
         toast({ variant: "destructive", title: "Errore", description: "Servizi Firebase non disponibili." });
         setIsLoading(false);
         return;
    }

    try {
        const usersRef = collection(firestore, 'app-users');
        const q = query(usersRef, where("username", "==", username));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            toast({
                variant: "destructive",
                title: "Login Fallito",
                description: "Nome utente o codice non corretti.",
            });
            setIsLoading(false);
            return;
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data() as User;

        if (userData.password !== password) {
             toast({
                variant: "destructive",
                title: "Login Fallito",
                description: "Nome utente o codice non corretti.",
            });
            setIsLoading(false);
            return;
        }
        
        const userToStore = {
            id: userDoc.id,
            username: userData.username,
            role: userData.role,
        };
        
        localStorage.setItem('user', JSON.stringify(userToStore));
        window.location.href = '/dashboard';
        
    } catch (error: any) {
        console.error("Login failed:", error);
        toast({
            variant: "destructive",
            title: "Errore di Login",
            description: `Si è verificato un errore durante l'accesso: ${error.message}`,
        });
        setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="username">Nome Utente</Label>
        <Input 
            id="username" 
            type="text" 
            placeholder="Es: Mario Rossi" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required 
            disabled={isLoading}
        />
      </div>
       <div className="grid gap-2">
        <Label htmlFor="password">Codice di Accesso</Label>
         <Input 
            id="password" 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required 
            disabled={isLoading}
        />
      </div>
      <Button type="submit" className="w-full font-bold" disabled={isLoading}>
        {isLoading ? 'Accesso in corso...' : 'Accedi'}
      </Button>
    </form>
  );
}
