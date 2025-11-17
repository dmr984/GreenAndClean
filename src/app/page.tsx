'use client';
import { Briefcase } from 'lucide-react';
import LoginForm from '@/components/login-form';
import { useUser } from '@/hooks/use-user';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();

  // This page should only render the login form.
  // The logic to protect the dashboard is centralized in the DashboardLayout.
  useEffect(() => {
    // If a user is already logged in, redirect them to the dashboard.
    // This handles cases where a logged-in user manually navigates to the login page.
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);


  if (isLoading) {
    return null; // Or a loading spinner
  }

  // Prevent rendering the form if a user is found, to avoid a flash of content
  // while the redirection is in progress.
  if (user) {
    return null;
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
