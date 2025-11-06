
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Briefcase } from 'lucide-react';

import LoginForm from '@/components/login-form';
import placeholder from '@/lib/placeholder-images.json';

export default function LoginPage() {
  const loginImage = placeholder.placeholderImages.find(p => p.id === 'login-background');
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
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-md gap-6">
          <div className="grid gap-3 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-3xl font-bold font-headline tracking-tight">Serveco Cleaning</h1>
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
      <div className="hidden bg-muted lg:block relative">
        {loginImage &&
          <Image
            src={loginImage.imageUrl}
            alt={loginImage.description}
            data-ai-hint={loginImage.imageHint}
            fill
            className="h-full w-full object-cover dark:brightness-[0.3]"
          />
        }
      </div>
    </div>
  );
}
