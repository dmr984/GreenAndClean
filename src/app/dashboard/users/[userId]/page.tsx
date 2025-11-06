'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, CheckCircle, Package, Fingerprint } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Mock users data, in a real app this would come from a database/API
const getUsersFromStorage = (): any[] => {
  if (typeof window === 'undefined') return [];
  const storedUsers = localStorage.getItem('app-users');
  return storedUsers ? JSON.parse(storedUsers) : [];
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
  const router = useRouter();

  const users = getUsersFromStorage();
  const user = users.find(u => u.id === userId);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold mb-4">Utente non trovato</h2>
        <p className="text-muted-foreground mb-4">L'utente che stai cercando non esiste.</p>
         <Button asChild>
          <Link href="/dashboard/users">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna agli Operatori
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
        <div className="flex items-center gap-4 mb-4">
            <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/users">
                    <ArrowLeft className="h-4 w-4" />
                </Link>
            </Button>
            <h2 className="text-3xl font-bold tracking-tight">Profilo Operatore</h2>
        </div>
        <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Avatar className="h-20 w-20">
                    <AvatarFallback className="text-3xl">
                    {getAvatarFallback(user.name)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                    <CardTitle className="text-3xl">{user.name}</CardTitle>
                    <CardDescription className="text-lg">Codice: {user.code} | Luogo: {user.location}</CardDescription>
                </div>
            </CardHeader>
            <CardContent>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Button variant="outline" size="lg" className="h-24 text-lg" onClick={() => alert("Funzione Timbrature non ancora implementata.")}>
                      <Fingerprint className="mr-4 h-8 w-8 text-primary"/>
                      Timbrature
                  </Button>
                  <Button variant="outline" size="lg" className="h-24 text-lg" onClick={() => router.push('/dashboard/calendar')}>
                      <Calendar className="mr-4 h-8 w-8 text-primary"/>
                      Calendario
                  </Button>
                  <Button variant="outline" size="lg" className="h-24 text-lg" onClick={() => router.push('/dashboard/requests?tab=leave')}>
                      <CheckCircle className="mr-4 h-8 w-8 text-primary"/>
                      Richieste
                  </Button>
                  <Button variant="outline" size="lg" className="h-24 text-lg" onClick={() => router.push('/dashboard/requests?tab=supply')}>
                      <Package className="mr-4 h-8 w-8 text-primary"/>
                      Prodotti
                  </Button>
               </div>
            </CardContent>
        </Card>
    </>
  );
}

    