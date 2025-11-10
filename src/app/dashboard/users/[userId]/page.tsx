'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, CheckCircle, Package, Fingerprint, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';


type User = {
  id: string;
  name: string;
  code: string;
  location: string;
  role: string;
};

const adminUser: User = { id: "admin", name: "Amministratore", code: "070380", role: "admin", location: "Sede" };

// Mock users data, in a real app this would come from a database/API
const getUsersFromStorage = (): User[] => {
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

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [isCurrentUser, setIsCurrentUser] = useState(false);
  const [isViewingAdmin, setIsViewingAdmin] = useState(false);

  useEffect(() => {
    let foundUser: User | undefined;
    if (userId === 'admin') {
      foundUser = adminUser;
      setIsViewingAdmin(true);
    } else {
      const users = getUsersFromStorage();
      foundUser = users.find(u => u.id === userId);
      setIsViewingAdmin(false);
    }
    
    setUser(foundUser || null);
    setLoading(false);

    if (typeof window !== 'undefined') {
        const currentUserId = localStorage.getItem('userId');
        setIsCurrentUser(userId === currentUserId);
    }
  }, [userId]);


  if (loading) {
    return (
        <>
            <div className="flex items-center gap-4 mb-4">
                <Skeleton className="h-10 w-64" />
            </div>
            <div className="grid gap-8">
                <Card>
                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <Skeleton className="h-20 w-20 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-6 w-64" />
                        </div>
                    </CardHeader>
                    <CardContent>
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <Skeleton className="h-24 w-full" />
                          <Skeleton className="h-24 w-full" />
                          <Skeleton className="h-24 w-full" />
                          <Skeleton className="h-24 w-full" />
                       </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
  }

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
            <h2 className="text-3xl font-bold tracking-tight">
              {isViewingAdmin ? "Profilo Amministratore" : "Profilo Operatore"}
            </h2>
        </div>
        <div className="grid gap-8">
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
                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <Button variant="outline" size="lg" className="h-24 text-base sm:text-lg flex-col sm:flex-row" onClick={() => alert("Funzione Timbrature non ancora implementata.")}>
                          <Fingerprint className="mr-0 mb-2 sm:mb-0 sm:mr-4 h-6 w-6 sm:h-8 sm:w-8 text-primary"/>
                          Timbrature
                      </Button>
                      <Button variant="outline" size="lg" className="h-24 text-base sm:text-lg flex-col sm:flex-row" onClick={() => router.push('/dashboard/calendar')}>
                          <Calendar className="mr-0 mb-2 sm:mb-0 sm:mr-4 h-6 w-6 sm:h-8 sm:w-8 text-primary"/>
                          Calendario
                      </Button>
                      <Button variant="outline" size="lg" className="h-24 text-base sm:text-lg flex-col sm:flex-row" onClick={() => router.push('/dashboard/leave-requests')}>
                          <CheckCircle className="mr-0 mb-2 sm:mb-0 sm:mr-4 h-6 w-6 sm:h-8 sm:w-8 text-primary"/>
                          Richieste Ferie
                      </Button>
                       <Button variant="outline" size="lg" className="h-24 text-base sm:text-lg flex-col sm:flex-row" onClick={() => router.push('/dashboard/supply-requests')}>
                          <Package className="mr-0 mb-2 sm:mb-0 sm:mr-4 h-6 w-6 sm:h-8 sm:w-8 text-primary"/>
                          Richieste Prodotti
                      </Button>
                      {isCurrentUser && (
                          <Button variant="outline" size="lg" className="h-24 text-base sm:text-lg relative flex-col sm:flex-row" onClick={() => router.push('/dashboard/messages')}>
                              <MessageSquare className="mr-0 mb-2 sm:mb-0 sm:mr-4 h-6 w-6 sm:h-8 sm:w-8 text-primary"/>
                              Comunicazioni
                          </Button>
                      )}
                   </div>
                </CardContent>
            </Card>

            {!isViewingAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                  <CardHeader>
                    <CardTitle>Riepilogo Attività Recenti</CardTitle>
                    <CardDescription>Ultime timbrature, richieste e note.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center text-muted-foreground py-8">
                      <p>Nessuna attività recente da mostrare.</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Note Amministrative</CardTitle>
                    <CardDescription>Note private visibili solo agli amministratori.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center text-muted-foreground py-8">
                      <p>Nessuna nota presente.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
        </div>


    </>
  );
}
