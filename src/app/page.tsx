'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import LoginForm from '@/components/login-form';
import { useAuth } from '@/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    // If the user is already logged in, redirect to the dashboard
     if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/dashboard');
      }
    });

    return () => unsubscribe();
  }, [router, auth]);


  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 text-center">
          <Briefcase className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-3xl font-bold font-headline tracking-wider uppercase">Serveco Cleaning</h1>
          <p className="text-balance text-muted-foreground">
            Seleziona il tuo nome utente e inserisci la password per accedere. <br />
            La password predefinita al primo accesso è <span className="font-mono font-bold">0000</span>.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
