'use client';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Users, Home, Loader2, Calendar, Plane, Settings, ListChecks, Circle, Calculator, Warehouse, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useUser } from '@/hooks/use-user';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';
import { ChangeCodeDialog } from '@/components/change-code-dialog';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';


export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const { user, isLoading } = useUser();
  const firestore = useFirestore();
  const pathname = usePathname();
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const renderDashboardContent = () => {
     if (isLoading || !user) { // Show loader while loading or if user is null (before redirect)
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Caricamento...</p>
          </div>
        </div>
      );
    }
    
    if (pathname === '/dashboard') {
        if (user.role === 'admin') {
          return <AdminDashboard />;
        }
        if (user.role === 'operator') {
          return <OperatorDashboard user={user} />;
        }
        return <div>Ruolo utente non riconosciuto.</div>;
    }
    
    return children;
  };
  
  return (
    <>
        <main className="flex flex-1 flex-col gap-4 lg:gap-6 p-4 lg:p-6">
            {renderDashboardContent()}
        </main>
        <ChangeCodeDialog isOpen={isSettingsOpen} onOpenChange={setIsSettingsOpen} userId={user?.id || null} />
    </>
  );
}
