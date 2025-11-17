'use client';
import { Briefcase } from 'lucide-react';
import LoginForm from '@/components/login-form';
import { useUser } from '@/hooks/use-user';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { user, isLoading } = useUser();

  // This page should only render the login form.
  // The logic to protect the dashboard is now centralized in the DashboardLayout.
  // If a user is already logged in, the DashboardLayout's check won't run here,
  // and the login form will be shown. But any attempt to navigate to /dashboard
  // will be correctly handled by the layout. When a user logs out, they are
  // redirected here.

  if (isLoading) {
    return null; // Or a loading spinner
  }

  // A logged-in user trying to access the login page will be redirected
  // by the effect in the DashboardLayout, so we prevent rendering the form
  // to avoid a flash of content.
  if(user) {
    // This will be handled by the redirect in the layout, but good to have a guard
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
