'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

type User = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(false);
  const [operatorCode, setOperatorCode] = useState('');

  // Effect to ensure default admin exists
  useEffect(() => {
    if (!firestore) return;
    
    const checkAndCreateAdmin = async () => {
        try {
            const adminId = "admin_user";
            const adminDocRef = doc(firestore, 'app-users', adminId);
            const docSnap = await getDocs(query(collection(firestore, 'app-users'), where('username', '==', 'admin')));

            if (docSnap.empty) {
                 const adminData = {
                    username: "admin",
                    role: "admin" as const,
                    firstName: "Admin",
                    lastName: "User",
                    workSchedule: {},
                };
                await setDoc(adminDocRef, adminData, { merge: true });
            }
        } catch (error) {
            console.error("Error ensuring admin user exists:", error);
        }
    };
    
    checkAndCreateAdmin();

  }, [firestore]);


  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    if (!operatorCode.trim()) {
      toast({ variant: "destructive", title: "Campo mancante", description: "Inserisci un codice operatore." });
      setIsLoading(false);
      return;
    }

    if (!firestore) {
        toast({ variant: "destructive", title: "Errore", description: "Database non disponibile." });
        setIsLoading(false);
        return;
    }

    try {
        const usersRef = collection(firestore, 'app-users');
        const q = query(usersRef, where("username", "==", operatorCode.trim()));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            toast({ variant: "destructive", title: "Login Fallito", description: "Codice operatore non valido." });
            setIsLoading(false);
            return;
        }

        const userDoc = querySnapshot.docs[0];
        const selectedUser = { id: userDoc.id, ...userDoc.data() } as User;
        
        const userToStore = {
            id: selectedUser.id,
            username: selectedUser.username,
            role: selectedUser.role,
        };
        
        localStorage.setItem('user', JSON.stringify(userToStore));
        window.location.href = '/dashboard';

    } catch (error) {
        console.error("Login error:", error);
        toast({ variant: "destructive", title: "Errore di Login", description: "Si è verificato un problema durante l'accesso." });
        setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="operator-code">Codice Operatore</Label>
        <Input 
            id="operator-code"
            type="text"
            value={operatorCode}
            onChange={(e) => setOperatorCode(e.target.value)}
            placeholder="Inserisci il tuo codice"
            required
            disabled={isLoading}
            inputMode="numeric" 
        />
      </div>
      
      <Button type="submit" className="w-full font-bold" disabled={isLoading}>
        {isLoading ? <Loader2 className="animate-spin" /> : 'Accedi'}
      </Button>
    </form>
  );
}
