'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, CalendarCheck, Package, Warehouse, History } from 'lucide-react';

export function AdminDashboard() {
  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
            <CardHeader>
                <Users className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <CardTitle className="text-xl sm:text-2xl">Gestione Operatori</CardTitle>
            </CardContent>
        </Card>
        <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
            <CardHeader>
                <Clock className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <CardTitle className="text-xl sm:text-2xl">Gestione Timbrature</CardTitle>
            </CardContent>
        </Card>
        <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
            <CardHeader>
                <CalendarCheck className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <CardTitle className="text-xl sm:text-2xl">Richieste Ferie</CardTitle>
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
    </>
  );
}
