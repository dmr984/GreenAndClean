'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserData } from '@/providers/user-provider';

interface AdminDashboardProps {
  user: UserData | null;
}

export function AdminDashboard({ user }: AdminDashboardProps) {
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
                <CardContent>
                    <div className="text-center p-8">
                        <h3 className="text-xl font-semibold">Benvenuto, {user.username}!</h3>
                        <p className="text-muted-foreground mt-2">
                            Utilizza il menu laterale per navigare tra le sezioni di gestione.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
