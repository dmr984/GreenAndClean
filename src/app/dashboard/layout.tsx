'use client';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Users, Home, Loader2, Calendar, Plane, Settings, ListChecks, Warehouse, PackageSearch, ClipboardList, Circle } from 'lucide-react';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingSupplyRequests, setPendingSupplyRequests] = useState(0);

  useEffect(() => {
    // This is the single "gatekeeper" for the dashboard.
    // If the state is done loading and there's no user, redirect to login.
    if (!isLoading && !user) {
        router.replace('/');
    }
  }, [user, isLoading, router]);

  // Listener for supply request notifications, only for admins
  useEffect(() => {
    if (!firestore || user?.role !== 'admin') {
      setPendingSupplyRequests(0);
      return;
    }

    const supplyRequestsQuery = query(collection(firestore, 'supply-requests'), where('status', '==', 'in_attesa'));
    const unsubscribe = onSnapshot(supplyRequestsQuery, (snapshot) => {
        setPendingSupplyRequests(snapshot.size);
    }, (error) => {
        console.error("Error fetching supply request notifications:", error);
    });

    return () => unsubscribe();
  }, [firestore, user]);

  const handleLogout = async () => {
    localStorage.removeItem('user');
    // Force a full page reload to clear all state and go to the login page.
    // This is more robust than router.replace for ensuring a clean state.
    window.location.href = '/';
  }

  const getAvatarFallback = () => {
     if (user?.username) {
        const parts = user.username.split(' ');
        if (parts.length > 1 && parts[0] && parts[1]) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return user.username.substring(0, 2).toUpperCase();
     }
     return "U";
  }
  
  const showBackButton = pathname !== '/dashboard';

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
    <div className="flex flex-col min-h-screen w-full">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
           <div className="flex items-center gap-2">
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0 relative">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Apri menu di navigazione</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex flex-col">
                 <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center gap-3">
                     <Avatar>
                        <AvatarFallback>{getAvatarFallback()}</AvatarFallback>
                      </Avatar>
                     <div>
                        <p className="text-base font-medium leading-none">{user?.username}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user?.role}</p>
                     </div>
                  </SheetTitle>
                 </SheetHeader>
                 <Separator className="my-2"/>
                 <nav className="grid gap-2 text-lg font-medium">
                    <Link href="/dashboard" passHref>
                        <Button variant={pathname === '/dashboard' ? 'secondary': 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                            <Home className="h-5 w-5" /> Dashboard
                        </Button>
                    </Link>
                     {user?.role === 'operator' && (
                        <>
                        <Link href="/dashboard/monthly-summary" passHref>
                            <Button variant={pathname === '/dashboard/monthly-summary' ? 'secondary' : 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                                <Calendar className="h-5 w-5" /> Riepilogo Mensile
                            </Button>
                        </Link>
                        <Link href="/dashboard/requests" passHref>
                            <Button variant={pathname === '/dashboard/requests' ? 'secondary' : 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                                <Plane className="h-5 w-5" /> Ferie e Permessi
                            </Button>
                        </Link>
                         <Link href="/dashboard/supply-request" passHref>
                            <Button variant={pathname === '/dashboard/supply-request' ? 'secondary' : 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                                <PackageSearch className="h-5 w-5" /> Richiesta Forniture
                            </Button>
                        </Link>
                        </>
                    )}
                    {user?.role === 'admin' && (
                        <>
                           <Link href="/dashboard/operators" passHref>
                            <Button variant={pathname.startsWith('/dashboard/operators') ? 'secondary': 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                                <Users className="h-5 w-5" /> Gestione Operatori
                            </Button>
                          </Link>
                           <Link href="/dashboard/supply-requests" passHref>
                            <Button variant={pathname === '/dashboard/supply-requests' ? 'secondary': 'ghost'} className="justify-start gap-2 w-full relative" onClick={() => setIsSidebarOpen(false)}>
                                <ClipboardList className="h-5 w-5" /> 
                                Richieste Forniture
                                {pendingSupplyRequests > 0 && (
                                   <Circle fill="red" className="h-2.5 w-2.5 text-red-500 absolute right-3 top-1/2 -translate-y-1/2" />
                                )}
                            </Button>
                          </Link>
                           <Link href="/dashboard/warehouse" passHref>
                            <Button variant={pathname === '/dashboard/warehouse' ? 'secondary': 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                                <Warehouse className="h-5 w-5" /> Gestione Magazzino
                            </Button>
                          </Link>
                        </>
                    )}
                 </nav>
                 <div className="mt-auto">
                    <Separator className="my-2"/>
                     <Button variant="ghost" className="justify-start gap-2 w-full" onClick={() => { setIsSettingsOpen(true); setIsSidebarOpen(false); } }>
                      <Settings className="h-5 w-5" /> Impostazioni
                   </Button>
                    <Button variant="ghost" className="justify-start gap-2 w-full" onClick={handleLogout}>
                      <LogOut className="h-5 w-5" /> Esci
                   </Button>
                 </div>
              </SheetContent>
            </Sheet>

             {showBackButton && (
               <Button variant="outline" size="icon" className="shrink-0" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Torna indietro</span>
               </Button>
              )}
           </div>

          <div className="flex-1 flex justify-center">
            <Link href="/dashboard" className="flex items-center gap-3 font-semibold text-lg">
                <span className="uppercase tracking-wider whitespace-nowrap">SERVECO SRL</span>
                <Image src="https://i.ibb.co/cKq6nWLR/1762432288621.png" alt="Serveco Logo" width={32} height={32} className="h-8 w-8 rounded-full"/>
            </Link>
          </div>

          <div className="flex justify-end items-center gap-4 w-10">
             {/* Notification Bell removed */}
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
            {renderDashboardContent()}
        </main>
    </div>
    <ChangeCodeDialog isOpen={isSettingsOpen} onOpenChange={setIsSettingsOpen} userId={user?.id || null} />
    </>
  );
}
