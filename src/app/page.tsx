'use client';
import { Briefcase } from 'lucide-react';
import LoginForm from '@/components/login-form';
import { useUser } from '@/hooks/use-user';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useUser();

  // This is the single source of truth for redirecting a logged-in user.
  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  // While loading, this page will be blank, which is fine.
  // If not loading and no user, the form will be shown.
  // If not loading and there IS a user, the effect will trigger the redirect.
  if (isLoading || user) {
    return null; // Or a loading spinner if you prefer
  }
  

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 text-center">
          <Briefcase className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-3xl font-bold font-headline tracking-wider uppercase">Serveco Cleaning</h1>
          <p className="text-balance text-muted-foreground">
            Seleziona il tuo nome utente per accedere.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
