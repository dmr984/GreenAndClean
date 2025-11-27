'use client';
import Image from 'next/image';
import LoginForm from '@/components/login-form';

export default function LoginPage() {
  return (
    <div className="flex items-start justify-center min-h-screen bg-background pt-16 sm:pt-24">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 text-center">
          <Image
            src="https://i.postimg.cc/GhwM2hg1/1764199658760.png"
            alt="Serveco Logo"
            width={240}
            height={240}
            className="h-60 w-60 mx-auto rounded-full"
            priority
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
