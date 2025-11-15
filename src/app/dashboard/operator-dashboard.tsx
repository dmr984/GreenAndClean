'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Play, Pause, Square, History, MapPin, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useCollection, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

type ClockingEvent = {
    id: string;
    userId: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    latitude: number;
    longitude: number;
    status: 'sospesa' | 'confermata';
};

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

interface OperatorDashboardProps {
  user: UserData | null;
}

export function OperatorDashboard({ user }: OperatorDashboardProps) {
    const router = useRouter();

    const goToClockIn = () => {
        router.push('/dashboard/clock-in');
    }

  if (!user) {
      return <div className="flex items-center justify-center h-full">Caricamento utente...</div>;
  }

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo</h2>
      </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
           <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={goToClockIn}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    Timbratura
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">Entra / Esci</div>
                <p className="text-xs text-muted-foreground">
                    Registra l'inizio e la fine del tuo turno.
                </p>
            </CardContent>
           </Card>
        </div>
    </div>
  );
}
