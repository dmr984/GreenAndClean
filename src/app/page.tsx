'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import LoginForm from '@/components/login-form';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // If the user is already logged in (checked via localStorage), redirect to the dashboard
    if (localStorage.getItem('user')) {
      router.push('/dashboard');
    }
  }, [router]);


  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 text-center">
          <Briefcase className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-3xl font-bold font-headline tracking-wider uppercase">Serveco Cleaning</h1>
          <p className="text-balance text-muted-foreground">
            Seleziona il tuo nome utente e inserisci il codice per accedere. <br />
            Il codice predefinito al primo accesso è <span className="font-mono font-bold">0000</span>.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

    