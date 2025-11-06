import Image from 'next/image';
import { Briefcase } from 'lucide-react';

import LoginForm from '@/components/login-form';
import placeholder from '@/lib/placeholder-images.json';

export default function LoginPage() {
  const loginImage = placeholder.placeholderImages.find(p => p.id === 'login-background');

  return (
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-md gap-6">
          <div className="grid gap-3 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-3xl font-bold font-headline tracking-tight">WorkForce Hub</h1>
            <p className="text-balance text-muted-foreground">
              Enter your credentials to access your operator dashboard
            </p>
          </div>
          <LoginForm />
          <div className="mt-4 text-center text-sm">
            Having trouble signing in?{' '}
            <a href="#" className="underline">
              Contact Admin
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
