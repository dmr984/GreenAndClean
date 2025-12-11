'use client';
import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Users, Home, Loader2, Calendar, Plane, Settings, ListChecks, Circle, Calculator, Video, CalendarDays } from 'lucide-react';
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
  
  const handleLogout = async () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  }

  const getAvatarFallback = () => {
     if (user?.firstName && user?.lastName) {
        return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
     }
     if (user?.username) {
        return user.username.substring(0, 2).toUpperCase();
     }
     return "U";
  }
  
  const showBackButton = pathname !== '/dashboard';
  
  if (isLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
    <div className="flex flex-col min-h-screen w-full">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6 no-print">
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
                        <p className="text-base font-semibold leading-none">{`${user?.firstName} ${user?.lastName}`}</p>
                        <p className="text-xs leading-tight text-muted-foreground mt-1">Codice: {user?.username}</p>
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
                        </>
                    )}
                    {user?.role === 'admin' && (
                        <>
                           <Link href="/dashboard/operators" passHref>
                            <Button variant={pathname.startsWith('/dashboard/operators') ? 'secondary': 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                                <Users className="h-5 w-5" /> Gestione Operatori
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
                <Image src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" width={32} height={32} className="h-8 w-8 rounded-full"/>
            </Link>
          </div>

          <div className="flex justify-end items-center gap-4 w-10">
             {/* Notification Bell removed */}
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 lg:gap-6 p-4 lg:p-6">
            {children}
        </main>
    </div>
    <ChangeCodeDialog isOpen={isSettingsOpen} onOpenChange={setIsSettingsOpen} userId={user?.id || null} />
    </>
  );
}
