'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function OperatorDashboard() {
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-between space-y-2 mb-4">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
           <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => router.push('/dashboard/clock-in')}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-6 w-6 text-primary" />
                  <CardTitle className="text-2xl">Gestione Turno</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground">
                    Accedi al pannello per avviare, mettere in pausa o terminare il tuo turno.
                </p>
              </CardContent>
           </Card>
        </div>
      </div>
    </>
  );
}
