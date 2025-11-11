
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import Link from 'next/link';

import LoginForm from '@/components/login-form';
import { useUser } from '@/firebase';

export default function LoginPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    // Redirect if user is already logged in AND the check is complete
    if (!isUserLoading && user) {
        router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);
  
  if (isUserLoading || (!isUserLoading && user)) {
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
          <div className="mt-4 text-center text-sm">
            Hai problemi ad accedere?{' '}
            <Link href="/setup" className="underline">
              Setup Iniziale Admin
            </Link>
          </div>
        </div>
    </div>
  );
}
