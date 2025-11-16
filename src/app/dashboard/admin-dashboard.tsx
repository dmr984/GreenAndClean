'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

interface AdminDashboardProps {
  user: UserData | null;
}

export function AdminDashboard({ user }: AdminDashboardProps) {
  const router = useRouter();

  if (!user) {
    return <div className="flex items-center justify-center h-full">Caricamento utente...</div>;
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm mt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center justify-center rounded-full bg-primary/10 p-4">
              <Users className="h-10 w-10 text-primary"/>
            </div>
            <h3 className="text-2xl font-bold tracking-tight">
              Benvenuto, Amministratore!
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Da qui puoi gestire gli operatori, il magazzino e supervisionare tutte le attività. Inizia selezionando un'opzione dal menu di navigazione.
            </p>
            <Button className="mt-4" onClick={() => router.push('/dashboard/operators')}>
              Vai a Gestione Operatori
            </Button>
          </div>
        </div>
    </>
  );
}
