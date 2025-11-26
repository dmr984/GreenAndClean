'use client';
import Image from 'next/image';
import LoginForm from '@/components/login-form';

export default function LoginPage() {

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 text-center">
          <Image 
            src="https://i.ibb.co/cKq6nWLR/1762432288621.png"
            alt="Serveco Logo" 
            width={40} 
            height={40} 
            className="h-10 w-10 mx-auto rounded-full"
          />
          <h1 className="text-3xl font-bold font-headline tracking-wider uppercase">Serveco Cleaning</h1>
          <p className="text-balance text-muted-foreground">
            Inserisci il tuo codice operatore per accedere.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
