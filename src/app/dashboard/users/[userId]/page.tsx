'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

// Mock users data, in a real app this would come from a database/API
const users = [
  { id: "USR001", name: "Mario Rossi", role: "Operatore" },
  { id: "USR002", name: "Anna Bianchi", role: "Operatore" },
  { id: "USR003", name: "Luca Verdi", role: "Operatore" },
  { id: "USR004", name: "Giulia Neri", role: "Supervisore" },
];

const getAvatarFallback = (name: string) => {
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};


export default function UserProfilePage() {
  const params = useParams();
  const userId = params.userId as string;

  const user = users.find(u => u.id === userId);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h2 className="text-2xl font-bold mb-4">Utente non trovato</h2>
        <p className="text-muted-foreground mb-4">L'utente che stai cercando non esiste.</p>
         <Button asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alla Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
        <div className="flex items-center gap-4 mb-4">
            <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard">
                    <ArrowLeft className="h-4 w-4" />
                </Link>
            </Button>
            <h2 className="text-3xl font-bold tracking-tight">Profilo Operatore</h2>
        </div>
        <Card>
            <CardHeader className="flex flex-row items-center gap-4">
                <Avatar className="h-20 w-20">
                    <AvatarFallback className="text-3xl">
                    {getAvatarFallback(user.name)}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <CardTitle className="text-3xl">{user.name}</CardTitle>
                    <CardDescription className="text-lg">{user.role}</CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                <p>Questa è la pagina del profilo di {user.name}. A breve qui potrai visualizzare timbrature, calendario, richieste e altro ancora.</p>
            </CardContent>
        </Card>
    </>
  );
}
