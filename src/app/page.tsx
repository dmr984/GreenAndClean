'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import Link from 'next/link';

import LoginForm from '@/components/login-form';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';

type User = {
  id: string;
  name: string;
  email: string;
  code: string;
  role: string;
  location: string;
};


export default function LoginPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const [showSetupLink, setShowSetupLink] = useState(false);
  
  const firestore = useFirestore();
  const adminQuery = useMemoFirebase(() => query(collection(firestore, 'users'), where('role', '==', 'admin')), [firestore]);
  const { data: adminUsers, isLoading: areAdminsLoading } = useCollection<User>(adminQuery);


  useEffect(() => {
    // Redirect if user is already logged in AND the check is complete
    if (!isUserLoading && user) {
        router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!areAdminsLoading) {
        setShowSetupLink(!adminUsers || adminUsers.length === 0);
    }
  }, [adminUsers, areAdminsLoading]);
  
  
  if (isUserLoading || (!isUserLoading && user) || areAdminsLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <p>Caricamento...</p>
        </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
          <div className="grid gap-3 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-3xl font-bold font-headline tracking-wider uppercase">Serveco Cleaning</h1>
            <p className="text-balance text-muted-foreground">
              Seleziona il tuo nome e inserisci il codice per accedere.
            </p>
          </div>
          <LoginForm />
          {showSetupLink && (
            <div className="mt-4 text-center text-sm">
                Sei l'amministratore?{' '}
                <Link href="/setup" className="underline">
                Esegui il setup iniziale
                </Link>
            </div>
          )}
        </div>
    </div>
  );
}
