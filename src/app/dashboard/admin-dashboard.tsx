'use client';
import Link from 'next/link';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, CalendarCheck, Package, Warehouse, History, MessageSquare, Megaphone } from 'lucide-react';

export function AdminDashboard() {
  const adminFeatures = [
    { title: "Gestione Operatori", href: "/dashboard/users", icon: Users },
    { title: "Gestione Timbrature", href: "/dashboard/clockings", icon: Clock },
    { title: "Richieste Ferie", href: "/dashboard/leave-requests", icon: CalendarCheck },
    { title: "Richieste Forniture", href: "/dashboard/supply-requests", icon: Package },
    { title: "Gestione Magazzino", href: "/dashboard/warehouse", icon: Warehouse },
    { title: "Storico Attività", href: "/dashboard/history", icon: History },
    { title: "Comunicazioni", href: "/dashboard/messages", icon: MessageSquare },
    { title: "Annunci", href: "/dashboard/announcements", icon: Megaphone },
  ];

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {adminFeatures.map((feature) => (
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
    </>
  );
}
