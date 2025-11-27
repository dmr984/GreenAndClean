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
            width={320}
            height={320}
            className="h-80 w-80 mx-auto rounded-full"
            priority
          />
          <p className="text-balance text-muted-foreground">
            Inserisci il tuo codice operatore per accedere.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
