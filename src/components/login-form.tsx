'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React from 'react';

export default function LoginForm() {
  const router = useRouter();

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = (event.currentTarget.elements.namedItem('email') as HTMLInputElement).value;
    
    // Simple role check based on email for prototype purposes
    if (email.toLowerCase() === 'admin@workforce.hub') {
      localStorage.setItem('userRole', 'admin');
    } else {
      localStorage.setItem('userRole', 'operator');
    }
    
    router.push('/dashboard');
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email o codice di accesso</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="m@example.com"
          required
          defaultValue="admin@workforce.hub"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required defaultValue="password" />
      </div>
      <Button type="submit" className="w-full font-bold">
        Accedi
      </Button>
    </form>
  );
}
