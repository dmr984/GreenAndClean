'use client';
import Link from 'next/link';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AdminDashboard() {

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Gestione Operatori
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Operatori</div>
            <p className="text-xs text-muted-foreground">
              Aggiungi, modifica o rimuovi operatori
            </p>
          </CardContent>
          <div className="p-6 pt-0">
             <Link href="/dashboard/operators" passHref>
                <Button className="w-full">
                    Vai alla Gestione <ArrowRight className="ml-2 h-4 w-4"/>
                </Button>
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
