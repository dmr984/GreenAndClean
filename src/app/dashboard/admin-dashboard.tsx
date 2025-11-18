'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Warehouse, HardHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

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
     if (user.role !== 'admin') {
        return <div className="flex items-center justify-center h-full">Accesso non autorizzato.</div>;
    }
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Pannello di Controllo Admin</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <Button variant="outline" className="h-28 text-lg" onClick={() => router.push('/dashboard/operators')}>
                        <HardHat className="mr-4 h-8 w-8" />
                        Gestione Operatori
                    </Button>
                    <Button variant="outline" className="h-28 text-lg" onClick={() => router.push('/dashboard/warehouse')}>
                        <Warehouse className="mr-4 h-8 w-8" />
                        Gestione Magazzino
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
