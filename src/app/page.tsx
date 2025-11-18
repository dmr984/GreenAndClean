'use client';
import { Briefcase, Loader2 } from 'lucide-react';
import LoginForm from '@/components/login-form';
import { useUser } from '@/hooks/use-user';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // If a user is already logged in, redirect them to the dashboard.
    // This handles cases where a logged-in user manually navigates to the login page.
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  // While checking for user, show a loader to prevent content flash
  if (isLoading) {
    return (
       <div className="flex items-center justify-center min-h-screen bg-background">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
       </div>
    );
  }

  // Prevent rendering the form if a user is found, to avoid a flash of content
  // while the redirection is in progress.
  if (!isLoading && user) {
    return null;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 text-center">
          <Briefcase className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-3xl font-bold font-headline tracking-wider uppercase">Serveco Cleaning</h1>
          <p className="text-balance text-muted-foreground">
            Seleziona il tuo nome utente e inserisci il codice per accedere.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
