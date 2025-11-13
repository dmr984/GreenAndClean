'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Calendar, Package, Megaphone, History } from 'lucide-react';

export function OperatorDashboard() {
  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
        <p className="text-muted-foreground">Versione stabile.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/dashboard/leave-requests" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Calendar className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Le mie Ferie</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/supply-requests" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Package className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Richieste Forniture</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/announcements" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Megaphone className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Annunci</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/history" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <History className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Storico</CardTitle>
                </CardContent>
            </Card>
        </Link>
      </div>
    </>
  );
}
