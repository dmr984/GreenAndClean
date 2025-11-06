'use client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Clock, Users, Calendar, Plane, ShoppingBasket } from 'lucide-react';
import Link from 'next/link';

const teamClockStatus = [
  { name: 'Mario Rossi', status: 'In turno', time: '04:15:32' },
  { name: 'Anna Bianchi', status: 'In turno', time: '02:30:11' },
  { name: 'Luca Verdi', status: 'Non in turno', time: '00:00:00' },
  { name: 'Giulia Neri', status: 'In turno', time: '06:45:50' },
];

const pendingRequests = [
    { type: 'Ferie', user: 'Mario Rossi', details: '01/09 - 07/09' },
    { type: 'Forniture', user: 'Anna Bianchi', details: 'Panni in Microfibra (50)' },
]

export function AdminDashboard() {
  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/users">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Operatori in Turno</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3 / 4</div>
              <p className="text-xs text-muted-foreground">Stato timbrature in tempo reale</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/requests?tab=leave">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Richieste Ferie in Attesa</CardTitle>
              <Plane className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+1</div>
              <p className="text-xs text-muted-foreground">1 in attesa di approvazione</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/requests?tab=supply">
         <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Richieste Forniture</CardTitle>
              <ShoppingBasket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+1</div>
              <p className="text-xs text-muted-foreground">1 in attesa di approvazione</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/calendar">
            <Card className="hover:bg-muted/50 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Eventi Calendario Oggi</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">2</div>
                    <p className="text-xs text-muted-foreground">Turni di mattina</p>
                </CardContent>
            </Card>
        </Link>
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
             <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-primary" />
                <CardTitle>Stato Timbrature Team</CardTitle>
            </div>
            <CardDescription>Visualizza chi è attualmente in turno.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamClockStatus.map((member) => (
                <div key={member.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-2.5 w-2.5 rounded-full ${member.status === 'In turno' ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="font-medium">{member.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className={`text-sm ${member.status === 'In turno' ? 'text-foreground' : 'text-muted-foreground'}`}>{member.status}</span>
                     {member.status === 'In turno' && <span className="font-mono text-sm text-muted-foreground">{member.time}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Richieste Recenti</CardTitle>
            <CardDescription>Richieste di ferie e forniture in attesa di approvazione.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
             {pendingRequests.map((request, index) => (
                <div key={index} className="flex items-center justify-between">
                    <div className="grid gap-1">
                        <div className="font-medium">{request.user}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {request.type === 'Ferie' ? <Plane className="h-4 w-4"/> : <ShoppingBasket className="h-4 w-4"/>}
                            <span>{request.details}</span>
                        </div>
                    </div>
                    <div className="text-sm text-muted-foreground">{request.type}</div>
                </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
