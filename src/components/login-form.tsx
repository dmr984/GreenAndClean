'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, getDocs, query, where, doc, onSnapshot, writeBatch, getDoc, Firestore } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type User = {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'operator';
  visibleInLogin?: boolean;
};

// This function will run once to set up the initial users if they don't exist.
const setupInitialUsers = async (firestore: Firestore) => {
    const adminUserRef = doc(firestore, 'app-users', 'admin_user');
    const adminDoc = await getDoc(adminUserRef);

    // Only run setup if admin user doesn't exist
    if (!adminDoc.exists()) {
        const batch = writeBatch(firestore);

        // 1. Create Admin User
        batch.set(adminUserRef, {
            username: 'Amministratore',
            password: '070380',
            role: 'admin',
            visibleInLogin: true,
        });

        // 2. Create Admin Role
        const adminRoleRef = doc(firestore, 'roles_admin', 'admin_user');
        batch.set(adminRoleRef, { isAdmin: true });

        // 3. Create 10 Operator Users
        for (let i = 1; i <= 10; i++) {
            const operatorId = `operator_${i}`;
            const operatorRef = doc(firestore, 'app-users', operatorId);
            batch.set(operatorRef, {
                username: `Operatore ${i}`,
                password: '0000',
                role: 'operator',
                visibleInLogin: true,
            });
        }

        batch.commit()
            .then(() => console.log("Initial users and roles created successfully."))
            .catch(err => {
                 if (err.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'write',
                        path: 'batch-write: setupInitialUsers'
                    });
                    errorEmitter.emit('permission-error', contextualError);
                 } else {
                    console.error("Error setting up initial users:", err);
                 }
            });
    }
};


export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(true); 
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  useEffect(() => {
    if (firestore) {
      setupInitialUsers(firestore);
    }
  }, [firestore]);


  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'app-users'), where("visibleInLogin", "==", true));
  }, [firestore]);


  useEffect(() => {
    if (!usersQuery) return;

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const userList: User[] = [];
        snapshot.forEach((doc) => {
            userList.push({ id: doc.id, ...doc.data() } as User);
        });

        userList.sort((a, b) => {
            if (a.role === 'admin') return -1;
            if (b.role === 'admin') return 1;
            const aNum = parseInt(a.username.split(' ')[1] || '0');
            const bNum = parseInt(b.username.split(' ')[1] || '0');
            return aNum - bNum;
        });

        setUsers(userList);
        setIsLoading(false);
    }, (error) => {
        if (error.code === 'permission-denied' && firestore) {
            const contextualError = new FirestorePermissionError({
                operation: 'list',
                path: (usersQuery as any)._query.path.canonicalString(),
            });
            errorEmitter.emit('permission-error', contextualError);
        } else {
            console.error("Error fetching users for login:", error);
            toast({
                title: "Errore di Connessione",
                description: "Impossibile caricare la lista utenti. Riprova tra poco.",
                variant: "destructive",
            });
        }
        setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [usersQuery, toast, firestore]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!username || !password) {
      toast({
        variant: "destructive",
        title: "Campi mancanti",
        description: "Seleziona un utente e inserisci la password.",
      });
      setIsLoading(false);
      return;
    }

    if (!firestore) {
      toast({
        variant: "destructive",
        title: "Errore di sistema",
        description: "Database non disponibile. Riprova più tardi.",
      });
      setIsLoading(false);
      return;
    }
    
    const usersCollection = collection(firestore, 'app-users');
    const q = query(usersCollection, where("username", "==", username), where("password", "==", password));
    
    getDocs(q).then((querySnapshot) => {
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const foundUser = { id: userDoc.id, ...userDoc.data() } as User;

        const userToStore = {
          id: foundUser.id,
          username: foundUser.username,
          role: foundUser.role
        };
        localStorage.setItem('user', JSON.stringify(userToStore));
        
        router.push('/dashboard');
      } else {
        toast({
          variant: "destructive",
          title: "Credenziali non valide",
          description: "Il nome utente o la password non sono corretti. Riprova.",
        });
      }
       setIsLoading(false);
    }).catch((error) => {
       if (error.code === 'permission-denied') {
          const contextualError = new FirestorePermissionError({
              operation: 'list',
              path: 'app-users'
          });
          errorEmitter.emit('permission-error', contextualError);
       } else {
           toast({
              variant: "destructive",
              title: "Errore di Accesso",
              description: "Si è verificato un problema durante il login.",
            });
       }
       setIsLoading(false);
    });
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="username">Nome Utente</Label>
        <Select onValueChange={setUsername} value={username} required>
          <SelectTrigger id="username" disabled={isLoading || users.length === 0}>
            <SelectValue placeholder={isLoading ? "Caricamento..." : "Seleziona un utente..."} />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.username}>
                {user.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full font-bold" disabled={isLoading}>
        {isLoading ? 'Accesso in corso...' : 'Accedi'}
      </Button>
    </form>
  );
}
