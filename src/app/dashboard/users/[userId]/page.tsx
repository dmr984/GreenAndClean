'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, Package, Briefcase, Plus, Minus, CalendarDays, Hourglass, TrendingUp, CalendarCheck, ClipboardCheck } from 'lucide-react';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';


type User = {
  id: string;
  username: string;
  password?: string;
  location?: string;
  role: 'admin' | 'operator';
  expectedHours?: number;
};

const getAvatarFallback = (name: string) => {
    if (!name) return "??";
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const { toast } = useToast();
  const firestore = useFirestore();

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  
  const fetchAllData = useCallback(async () => {
    if (!firestore || !userId) return;
    setLoading(true);
    try {
        const userDocRef = doc(firestore, 'app-users', userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const foundUser = { id: userDoc.id, ...userDoc.data() } as User;
            setUser(foundUser);
        } else {
            setUser(null);
        }
    } catch (e) {
        setUser(null);
        console.error("Error fetching user:", e);
        toast({ title: "Errore", description: "Impossibile caricare i dati dell'utente.", variant: "destructive" });
    } finally {
        setLoading(false);
    }
  }, [userId, firestore, toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleExpectedHoursChange = async (amount: number) => {
      if (!user || !firestore) return;
      
      const currentHours = user.expectedHours || 0;
      const newHours = Math.max(0, currentHours + amount);

      const updatedUser = { ...user, expectedHours: newHours };
      setUser(updatedUser);

      const userDocRef = doc(firestore, 'app-users', userId);
      try {
          await updateDoc(userDocRef, { expectedHours: newHours });
          toast({ title: "Ore aggiornate", description: `Ore giornaliere previste impostate a ${newHours}.` });
      } catch (e) {
          toast({ title: "Errore", description: "Impossibile aggiornare le ore.", variant: "destructive" });
          setUser(user);
      }
  };

  if (loading) {
    return (
        <>
            <div className="flex items-center gap-4 mb-4"> <Skeleton className="h-10 w-64" /> </div>
            <Card>
                <CardHeader className="flex flex-col md:flex-row items-start md:items-center gap-4">
                    <Skeleton className="h-20 w-20 rounded-full" />
                    <div className="flex-1 space-y-2"> <Skeleton className="h-8 w-48" /> <Skeleton className="h-6 w-64" /> </div>
                </CardHeader>
                <CardContent> <Skeleton className="h-48 w-full" /> </CardContent>
            </Card>
        </>
    );
  }

  if (user === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold mb-4">Utente non trovato</h2>
        <p className="text-muted-foreground mb-4">L'utente che stai cercando non esiste.</p>
         <Button asChild>
          <Link href="/dashboard/users">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna agli Operatori
          </Link>
        </Button>
      </div>
    );
  }
  
  const SectionButton = ({ icon, label, href }: { icon: React.ReactNode, label: string, href: string }) => (
    <Link href={href} className="block">
        <Card className="text-center transition-all hover:bg-muted/50 hover:ring-2 hover:ring-primary">
            <CardHeader>
                <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-lg bg-muted text-primary">
                    {icon}
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <p className="font-semibold text-lg">{label}</p>
            </CardContent>
        </Card>
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
        <h2 className="text-3xl font-bold tracking-tight">Profilo Operatore</h2>
        
        <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start gap-4">
                 <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-2xl">{getAvatarFallback(user.username)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                    <CardTitle className="text-2xl">{user.username}</CardTitle>
                    <CardDescription className="text-base flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 gap-y-1">
                       <span>Password: {user.password}</span>
                       <span>Luogo: {user.location}</span>
                    </CardDescription>
                     <div className="flex items-center gap-2 mt-4">
                        <Label htmlFor="expected-hours" className="text-base shrink-0">Ore Previste:</Label>
                         <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleExpectedHoursChange(-1)}> <Minus className="h-4 w-4" /> </Button>
                            <span className="min-w-[32px] text-center font-bold text-lg">{user.expectedHours || 0}</span>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleExpectedHoursChange(1)}> <Plus className="h-4 w-4" /> </Button>
                        </div>
                     </div>
                </div>
            </CardHeader>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Gestione Dati</CardTitle>
                <CardDescription>Accedi allo storico delle attività di questo operatore.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <SectionButton 
                        label="Timbrature" 
                        href={`/dashboard/users/${userId}/shifts`} 
                        icon={<Briefcase className="h-6 w-6"/>} 
                    />
                    <SectionButton 
                        label="Ferie e Permessi" 
                        href={`/dashboard/users/${userId}/leaves`}
                        icon={<CheckCircle className="h-6 w-6"/>} 
                    />
                    <SectionButton 
                        label="Richieste Forniture" 
                        href={`/dashboard/users/${userId}/supplies`}
                        icon={<Package className="h-6 w-6"/>} 
                    />
                </div>
            </CardContent>
        </Card>

    </div>
  );
}
