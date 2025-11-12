'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, CalendarCheck, Warehouse, Package, ClipboardCheck, Megaphone, Clock } from 'lucide-react';
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
type Shift = {
  id: string;
  endTime: string | null;
  status: 'In attesa' | 'Approvato';
}
type ExtraShiftRequest = {
  id: string;
  status: 'pending' | 'approved';
}

export function AdminDashboard() {
  const [pendingLeaveRequests, setPendingLeaveRequests] = React.useState(0);
  const [pendingSupplyRequests, setPendingSupplyRequests] = React.useState(0);
  const [pendingShifts, setPendingShifts] = React.useState(0);
  const [pendingExtraShifts, setPendingExtraShifts] = React.useState(0);


  React.useEffect(() => {
    const updateBadges = () => {
      if (typeof window !== 'undefined') {
        const storedLeave = getFromStorage<LeaveRequest[]>('leave-requests', []);
        setPendingLeaveRequests(storedLeave.filter(r => r.status === 'In attesa').length);

        const storedSupply = getFromStorage<SupplyRequest[]>('supply-requests', []);
        setPendingSupplyRequests(storedSupply.filter(r => r.status === 'In attesa').length);
        
        const allShifts = getFromStorage<Shift[]>('shifts', []);
        // Filter for completed shifts that are pending approval client-side
        setPendingShifts(allShifts.filter(s => s.status === 'In attesa' && s.endTime).length);
        
        const allExtraShifts = getFromStorage<ExtraShiftRequest[]>('extra-shift-requests', []);
        setPendingExtraShifts(allExtraShifts.filter(r => r.status === 'pending').length);
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/dashboard/users" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Briefcase className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
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
        <Link href="/dashboard/shift-approval" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                 {pendingShifts > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {pendingShifts}
                  </Badge>
                }
                <CardHeader>
                    <ClipboardCheck className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Approvazione Turni</CardTitle>
                </CardContent>
            </Card>
        </Link>
         <Link href="/dashboard/extra-shifts" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                 {pendingExtraShifts > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {pendingExtraShifts}
                  </Badge>
                }
                <CardHeader>
                    <Clock className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Timbrature Extra</CardTitle>
                </CardContent>
            </Card>
        </Link>
      </div>
    </>
  );
}
