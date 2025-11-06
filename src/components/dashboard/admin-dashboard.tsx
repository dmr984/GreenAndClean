'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import Link from 'next/link';

export function AdminDashboard() {

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <Link href="/dashboard/users" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Users className="h-16 w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <CardTitle className="text-2xl">Gestione Operatori</CardTitle>
                </CardContent>
            </Card>
        </Link>
      </div>
    </>
  );
}

    