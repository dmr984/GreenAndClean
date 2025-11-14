'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Package, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { ClockWidget } from '@/components/dashboard/clock-widget';
import { Skeleton } from '@/components/ui/skeleton';

export function OperatorDashboard() {
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const operatorFeatures = [
    { title: "Le mie Ferie", href: "/dashboard/leave-requests", icon: Calendar },
    { title: "Richieste Forniture", href: "/dashboard/supply-requests", icon: Package },
    { title: "Comunicazioni", href: "/dashboard/messages", icon: MessageSquare },
  ];

  return (
    <>
      <div className="flex items-center justify-between space-y-2 mb-4">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          {isLoading || !user ? (
             <Card>
                <CardHeader className="pb-4">
                  <Skeleton className="h-8 w-4/5" />
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-6">
                   <Skeleton className="h-[72px] w-4/5" />
                   <Skeleton className="h-12 w-full" />
                   <Skeleton className="h-4 w-3/5" />
                </CardContent>
             </Card>
          ) : (
             <ClockWidget userId={user.id} userName={user.username} />
          )}
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {operatorFeatures.map((feature) => (
            <Link href={feature.href} key={feature.title}>
              <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                  <CardHeader>
                      <feature.icon className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                      <CardTitle className="text-xl sm:text-2xl">{feature.title}</CardTitle>
                  </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
