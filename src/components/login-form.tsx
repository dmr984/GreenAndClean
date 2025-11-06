'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React from 'react';

export default function LoginForm() {
  const router = useRouter();

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    // In a real app, you'd perform authentication here
    router.push('/dashboard');
  };

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email or Access Code</Label>
        <Input
          id="email"
          type="email"
          placeholder="m@example.com"
          required
          defaultValue="operatrice@workforce.hub"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required defaultValue="password" />
      </div>
      <Button type="submit" className="w-full font-bold">
        Sign In
      </Button>
    </form>
  );
}
