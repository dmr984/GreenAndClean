'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Package, Clock } from 'lucide-react';

export function OperatorDashboard() {

  return (
    <>
      <div className="flex items-center justify-between space-y-2 mb-4">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl">Gestione Turno</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-6">
              <div className="text-6xl font-bold font-mono tracking-tight text-foreground">
                --:--
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
              <CardHeader>
                  <Calendar className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <CardTitle className="text-xl sm:text-2xl">Le mie Ferie</CardTitle>
              </CardContent>
          </Card>
          <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
              <CardHeader>
                  <Package className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <CardTitle className="text-xl sm:text-2xl">Richieste Forniture</CardTitle>
              </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
