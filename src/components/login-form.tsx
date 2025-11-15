'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, getDoc, doc, setDoc, getDocs } from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type User = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
  visibleInLogin?: boolean;
};

// This is a MOCK function to simulate calling a Cloud Function
// In a real app, this would be a secure HTTPS call to a backend
async function getCustomToken(userId: string, passwordAttempt: string): Promise<{token: string} | {error: string}> {
  // This is insecure and for demonstration ONLY.
  // A real app would verify the password server-side against a hash.
  console.log(`Requesting token for userId: ${userId}`);

  // In a real scenario, you'd have a backend.json or similar config
  // that the backend function would read to connect to Firestore.
  // Since we are mocking, we can't do that. We will just return a dummy token.
  // This part of the code is conceptually what a Cloud Function would do.
  
  // This is a placeholder. A real implementation would involve a backend.
  if (userId && passwordAttempt) {
    // This is a dummy token for demonstration.
    // In a real app, this would be a securely generated JWT.
    const dummyToken = `fake-token-for-${userId}`;
    console.log("Returning mock custom token");
    return { token: dummyToken };
  }
  
  return { error: "Invalid user ID or password." };
}


export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();
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

    if (!firestore || !auth) {
         toast({ variant: "destructive", title: "Errore", description: "Servizi Firebase non disponibili." });
         setIsLoading(false);
         return;
    }

    try {
        const userDocRef = doc(firestore, 'app-users', selectedUserId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists() || userDoc.data().password !== password) {
             toast({
                variant: "destructive",
                title: "Credenziali non valide",
                description: "Il nome utente o il codice non sono corretti. Riprova.",
            });
            setIsLoading(false);
            return;
        }
        
        // This is where we simulate getting a custom token
        // In a real app, this would be a secure backend call.
        const tokenResponse = await getCustomToken(selectedUserId, password);

        if ('error' in tokenResponse) {
             throw new Error(tokenResponse.error);
        }

        // Sign in with the custom token
        const userCredential = await signInWithCustomToken(auth, tokenResponse.token);
        
        const userData = userDoc.data();
        const userToStore = {
            id: userCredential.user.uid, // Use the REAL UID from Auth
            username: userData.username,
            role: userData.role,
        };
        localStorage.setItem('user', JSON.stringify(userToStore));
        // The onAuthStateChanged listener in the layout will handle the redirect
        
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
