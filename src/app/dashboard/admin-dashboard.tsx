'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CalendarCheck, Warehouse, Megaphone, Package, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

// Mock types to match the request pages
type LeaveRequest = {
  id: string;
  status: string;
};
type SupplyRequest = {
  id: string;
  status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale';
};
type Communication = {
  id: string;
  read: boolean;
};


export function AdminDashboard() {
  const [pendingLeaveRequests, setPendingLeaveRequests] = React.useState(0);
  const [pendingSupplyRequests, setPendingSupplyRequests] = React.useState(0);
  const [unreadCommunications, setUnreadCommunications] = React.useState(0);

  React.useEffect(() => {
    // This component will now rely on real-time listeners in the individual pages
    // to show updated data. We keep the state for badges but they will be updated
    // via a different mechanism if we implement a global state or context.
    // For now, we will remove direct localStorage dependency here.
    // The badges will be updated based on other components triggering storage events if needed.
    const updateBadges = () => {
      if (typeof window !== 'undefined') {
        const storedLeave = getFromStorage<LeaveRequest[]>('leave-requests', []);
        setPendingLeaveRequests(storedLeave.filter(r => r.status === 'In attesa').length);

        const storedSupply = getFromStorage<SupplyRequest[]>('supply-requests', []);
        setPendingSupplyRequests(storedSupply.filter(r => r.status === 'In attesa').length);
        
        const storedCommunications = getFromStorage<Communication[]>('communications', []);
        setUnreadCommunications(storedCommunications.filter(c => !c.read).length);
      }
    };

    updateBadges();
    window.addEventListener('storage', updateBadges);
    return () => window.removeEventListener('storage', updateBadges);

  }, []);

  const getFromStorage = <T,>(key: string, defaultValue: T): T => {
      if (typeof window === 'undefined') return defaultValue;
      const stored = localStorage.getItem(key);
      try {
        return stored ? JSON.parse(stored) : defaultValue;
      } catch (e) {
        return defaultValue;
      }
  };


  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <Link href="/dashboard/users" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Users className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Gestione Operatori</CardTitle>
                </CardContent>
            </Card>
        </Link>
         <Link href="/dashboard/leave-requests" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                {pendingLeaveRequests > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {pendingLeaveRequests}
                  </Badge>
                }
                <CardHeader>
                    <CalendarCheck className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Richieste Ferie</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/supply-requests" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                {pendingSupplyRequests > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {pendingSupplyRequests}
                  </Badge>
                }
                <CardHeader>
                    <Package className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Richieste Forniture</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/warehouse" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Warehouse className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Gestione Magazzino</CardTitle>
                </CardContent>
            </Card>
        </Link>
         <Link href="/dashboard/announcements" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Megaphone className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Invia Annunci</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/messages" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                 {unreadCommunications > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {unreadCommunications}
                  </Badge>
                }
                <CardHeader>
                    <MessageSquare className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Comunicazioni</CardTitle>
                </CardContent>
            </Card>
        </Link>
      </div>
    </>
  );
}
