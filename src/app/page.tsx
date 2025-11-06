
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';

import LoginForm from '@/components/login-form';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Controlla se l'utente ha già effettuato l'accesso e reindirizza alla dashboard
    // Questo viene eseguito solo sul client, dopo l'idratazione iniziale.
    if (typeof window !== 'undefined') {
        const userRole = localStorage.getItem('userRole');
        if (userRole) {
            router.push('/dashboard');
        }
    }
  }, [router]);

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
            <a href="#" className="underline">
              Contatta l'amministratore
            </a>
          </div>
        </div>
    </div>
  );
}
