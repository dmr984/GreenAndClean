'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import Link from 'next/link';

import LoginForm from '@/components/login-form';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';

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
  const usersCollection = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users, isLoading: areUsersLoading } = useCollection<User>(usersCollection);


  useEffect(() => {
    // Redirect if user is already logged in AND the check is complete
    if (!isUserLoading && user) {
        router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!areUsersLoading && users) {
        const adminExists = users.some(u => u.role === 'admin');
        setShowSetupLink(!adminExists);
    }
  }, [users, areUsersLoading]);
  
  
  if (isUserLoading || (!isUserLoading && user) || areUsersLoading) {
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
                Hai problemi ad accedere?{' '}
                <Link href="/setup" className="underline">
                Setup Iniziale Admin
                </Link>
            </div>
          )}
        </div>
    </div>
  );
}
