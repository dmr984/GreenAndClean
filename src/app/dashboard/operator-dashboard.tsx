'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';

export function OperatorDashboard() {

  return (
    <>
      <div className="flex items-center justify-between space-y-2 mb-4">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
           <Card className="cursor-not-allowed opacity-50">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-6 w-6 text-primary" />
                  <CardTitle className="text-2xl">Gestione Turno</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center gap-6">
                <div className="text-6xl font-bold font-mono tracking-tight text-foreground">
                  --:--:--
                </div>
                <div className="text-sm text-muted-foreground">
                    Le funzionalità di timbratura sono temporaneamente disabilitate.
                </div>
              </CardContent>
           </Card>
        </div>
      </div>
    </>
  );
}
