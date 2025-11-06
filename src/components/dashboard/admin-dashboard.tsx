'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CheckCircle, Package } from 'lucide-react';
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


export function AdminDashboard() {
  const [pendingLeaveRequests, setPendingLeaveRequests] = React.useState(0);
  const [pendingSupplyRequests, setPendingSupplyRequests] = React.useState(0);

  React.useEffect(() => {
    // Function to check for new requests from localStorage
    const checkForNewRequests = () => {
       if (typeof window !== 'undefined') {
        const storedLeaveRequests = localStorage.getItem('leave-requests');
        const leaveRequests: LeaveRequest[] = storedLeaveRequests ? JSON.parse(storedLeaveRequests) : [];
        const pendingLeave = leaveRequests.filter(r => r.status === 'In attesa').length;
        setPendingLeaveRequests(pendingLeave);

        const storedSupplyRequests = localStorage.getItem('supply-requests');
        const supplyRequests: SupplyRequest[] = storedSupplyRequests ? JSON.parse(storedSupplyRequests) : [];
        const pendingSupply = supplyRequests.filter(r => r.status === 'In attesa').length;
        setPendingSupplyRequests(pendingSupply);
      }
    };

    checkForNewRequests();

    // Listen for storage changes to update in real-time
    window.addEventListener('storage', checkForNewRequests);

    return () => {
      window.removeEventListener('storage', checkForNewRequests);
    };

  }, []);


  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <Link href="/dashboard/users" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Users className="h-16 w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <CardTitle className="text-2xl">Gestione Operatori</CardTitle>
                </CardContent>
            </Card>
        </Link>
         <Link href="/dashboard/leave-requests" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                {pendingLeaveRequests > 0 && 
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-base h-8 w-8 flex items-center justify-center rounded-full">
                    {pendingLeaveRequests}
                  </Badge>
                }
                <CardHeader>
                    <CheckCircle className="h-16 w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <CardTitle className="text-2xl">Gestisci Richieste Ferie</CardTitle>
                </CardContent>
            </Card>
        </Link>
         <Link href="/dashboard/supply-requests" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
               {pendingSupplyRequests > 0 && 
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-base h-8 w-8 flex items-center justify-center rounded-full">
                    {pendingSupplyRequests}
                  </Badge>
                }
                <CardHeader>
                    <Package className="h-16 w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <CardTitle className="text-2xl">Gestisci Richieste Forniture</CardTitle>
                </CardContent>
            </Card>
        </Link>
      </div>
    </>
  );
}
