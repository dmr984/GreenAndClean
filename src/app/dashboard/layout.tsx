'use client';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Settings, Users, Home, Loader2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ChangeCodeDialog } from '@/components/change-code-dialog';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [user, setUser] = useState<UserData | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [isChangeCodeOpen, setIsChangeCodeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = () => {
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
        } else {
          router.replace('/');
        }
      } catch (e) {
          router.replace('/');
      } finally {
          setIsLoading(false);
      }
    };
    
    checkUser();
    
    const handleStorageChange = () => {
        checkUser();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
        window.removeEventListener('storage', handleStorageChange);
    };

  }, [router]);


  const handleLogout = () => {
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('storage')); // Notify self and other tabs
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

  const handleChangeCodeClick = () => {
      setIsSidebarOpen(false);
      setIsChangeCodeOpen(true);
  }
  
  const showBackButton = pathname !== '/dashboard';

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Caricamento...</p>
          </div>
        </div>
      );
    }
    
    if (!user) {
         return (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-muted-foreground">Verifica autenticazione...</p>
            </div>
          </div>
        );
    }

    // Pass user to children for sub-pages, or render dashboards for the main page
    if (pathname !== '/dashboard') {
        return React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { user }) : children;
    }

    if (user.role === 'admin') {
      return <AdminDashboard user={user} />;
    }

    if (user.role === 'operator') {
      return <OperatorDashboard user={user} />;
    }
    
    // Fallback if role is unknown
    return <div>Ruolo utente non riconosciuto.</div>;
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
                        <Link href="/dashboard/monthly-summary" passHref>
                            <Button variant={pathname === '/dashboard/monthly-summary' ? 'secondary' : 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                                <Calendar className="h-5 w-5" /> Riepilogo Mensile
                            </Button>
                        </Link>
                    )}
                    {user?.role === 'admin' && (
                        <Link href="/dashboard/operators" passHref>
                           <Button variant={pathname === '/dashboard/operators' ? 'secondary': 'ghost'} className="justify-start gap-2 w-full" onClick={() => setIsSidebarOpen(false)}>
                               <Users className="h-5 w-5" /> Gestione Operatori
                           </Button>
                        </Link>
                    )}
                    <Button variant="ghost" className="justify-start gap-2" onClick={handleChangeCodeClick}>
                        <Settings className="h-5 w-5" /> Impostazioni Profilo
                    </Button>
                 </nav>
                 <div className="mt-auto">
                    <Separator className="my-2"/>
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
             {/* Placeholder for potential future icons */}
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 overflow-x-hidden">
            {renderContent()}
        </main>
    </div>
    {user && <ChangeCodeDialog 
        isOpen={isChangeCodeOpen}
        onOpenChange={setIsChangeCodeOpen}
        userId={user.id}
      />}
    </>
  );
}
