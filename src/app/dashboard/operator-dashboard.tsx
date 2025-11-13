'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Calendar, Package, Megaphone, MessageSquare } from 'lucide-react';
import { ClockWidget } from '@/components/dashboard/clock-widget';

export function OperatorDashboard() {
  const [user, setUser] = React.useState<{id: string, username: string} | null>(null);

  React.useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <>
      <div className="flex items-center justify-between space-y-2 mb-4">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          {user && <ClockWidget userId={user.id} userName={user.username} />}
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/dashboard/leave-requests" className="h-full">
              <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                  <CardHeader>
                      <Calendar className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                      <CardTitle className="text-xl sm:text-2xl">Le mie Ferie</CardTitle>
                  </CardContent>
              </Card>
          </Link>
          <Link href="/dashboard/supply-requests" className="h-full">
              <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                  <CardHeader>
                      <Package className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                      <CardTitle className="text-xl sm:text-2xl">Richieste Forniture</CardTitle>
                  </CardContent>
              </Card>
          </Link>
          <Link href="/dashboard/announcements" className="h-full">
              <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                  <CardHeader>
                      <Megaphone className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                      <CardTitle className="text-xl sm:text-2xl">Annunci</CardTitle>
                  </CardContent>
              </Card>
          </Link>
           <Link href="/dashboard/messages" className="h-full">
              <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                  <CardHeader>
                      <MessageSquare className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                      <CardTitle className="text-xl sm:text-2xl">Comunicazioni</CardTitle>
                  </CardContent>
              </Card>
          </Link>
        </div>
      </div>
    </>
  );
}
