'use client';
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

type Operator = {
  id: string;
  name: string;
};

const getAvatarFallback = (name: string) => {
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export function AdminDashboard() {
    const [operators, setOperators] = React.useState<Operator[]>([]);

    React.useEffect(() => {
        const storedUsers = localStorage.getItem('app-users');
        if (storedUsers) {
            const parsedUsers = JSON.parse(storedUsers);
            // We only want operators, not the admin
            const operatorUsers = parsedUsers.filter((user: any) => user.role !== 'admin');
            setOperators(operatorUsers);
        }
    }, []);


  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {operators.map((operator) => (
          <Card key={operator.id} className="hover:bg-muted/50 transition-colors text-center">
            <CardContent className="p-6 flex flex-col items-center justify-center gap-4">
               <Avatar className="h-24 w-24">
                <AvatarFallback className="text-4xl">
                  {getAvatarFallback(operator.name)}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-xl font-semibold">{operator.name}</h3>
              <Button asChild className="w-full">
                <Link href={`/dashboard/users/${operator.id}`}>Gestisci</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
         <Card className="hover:bg-muted/50 transition-colors text-center border-dashed">
             <CardContent className="p-6 flex flex-col items-center justify-center gap-4 h-full">
                <Users className="h-12 w-12 text-muted-foreground"/>
                <h3 className="text-xl font-semibold text-muted-foreground">Aggiungi Operatore</h3>
                 <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard/users">Vai a Utenti</Link>
                </Button>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
