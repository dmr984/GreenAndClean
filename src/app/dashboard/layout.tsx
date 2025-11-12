'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Settings, User, Lock, CalendarCheck, Package, Warehouse, Megaphone, ClipboardCheck, Clock, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ChangeCodeDialog } from '@/components/change-code-dialog';
import { Badge } from '@/components/ui/badge';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

// Generic function to get data from localStorage, now outside the component
const getFromStorage = <T,>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = localStorage.getItem(key);
    try {
        return stored ? JSON.parse(stored) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
};

// Mock types to match the request pages
type LeaveRequest = { id: string; status: string; };
type SupplyRequest = { id: string; status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale'; };
type Shift = { id: string; endTime: string | null; status: 'In attesa' | 'Approvato'; }
type ExtraShiftRequest = { id: string; status: 'pending' | 'approved'; }
type Announcement = { id: string, readBy: string[], hiddenFor: string[], recipients: string[] };

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [user, setUser] = useState<UserData | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [isChangeCodeOpen, setIsChangeCodeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notificationCount, setNotificationCount] = useState(0);

  const calculateNotifications = useCallback(() => {
    if (typeof window === 'undefined' || !user) return 0;
    
    let count = 0;
    
    if (user.role === 'admin') {
      const storedLeave = getFromStorage<LeaveRequest[]>('leave-requests', []);
      count += storedLeave.filter(r => r.status === 'In attesa').length;

      const storedSupply = getFromStorage<SupplyRequest[]>('supply-requests', []);
      count += storedSupply.filter(r => r.status === 'In attesa').length;
      
      const allShifts = getFromStorage<Shift[]>('shifts', []);
      count += allShifts.filter(s => s.endTime && s.status === 'In attesa').length;
      
      const allExtraShifts = getFromStorage<ExtraShiftRequest[]>('extra-shift-requests', []);
      count += allExtraShifts.filter(r => r.status === 'pending').length;
    }

    const allAnnouncements = getFromStorage<Announcement[]>('announcements', []);
    const userAnnouncements = allAnnouncements.filter(a => {
        const isRecipient = a.recipients?.includes('all') || a.recipients?.includes(user.id);
        const isHidden = a.hiddenFor?.includes(user.id);
        return isRecipient && !isHidden;
    });
    const unreadAnnouncements = userAnnouncements.filter(a => !a.readBy?.includes(user.id)).length;
    count += unreadAnnouncements;
    
    return count;
  }, [user]);

  useEffect(() => {
    const handleStorageChange = () => {
      setNotificationCount(calculateNotifications());
    };

    handleStorageChange(); // Initial calculation
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [calculateNotifications]);
  

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.replace('/');
      return; 
    }
    
    const userData: UserData = JSON.parse(storedUser);
    setUser(userData);
    
    // Logic to check permissions is now in a separate effect
    // to avoid re-running this on every render.
    setIsLoading(false);

  }, [router]);

  useEffect(() => {
    if (user) {
        const isAdminPage = pathname.startsWith('/dashboard/users') ||
                            pathname.startsWith('/dashboard/warehouse') ||
                            pathname.startsWith('/dashboard/shift-approval') ||
                            pathname.startsWith('/dashboard/extra-shifts');

        if (user.role === 'operator' && isAdminPage) {
            router.replace('/dashboard');
        }
    }
  }, [user, pathname, router]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/');
    setIsSidebarOpen(false);
  }

  const getAvatarFallback = () => {
     if (user?.username) {
        const parts = user.username.split(' ');
        if (parts.length > 1) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return user.username.substring(0, 2).toUpperCase();
     }
     return "U";
  }
  
  const handleProfileClick = () => {
    setIsSidebarOpen(false);
    if(user) {
        router.push(`/dashboard/users/${user.id}`);
    }
  };

  const handleChangeCodeClick = () => {
      setIsSidebarOpen(false);
      setIsChangeCodeOpen(true);
  }

  const handleNavigation = (path: string) => {
    setIsSidebarOpen(false);
    router.push(path);
  }

  if (isLoading || !user) {
    return <div className="flex items-center justify-center min-h-screen">Caricamento...</div>;
  }
  
  const isAdmin = user.role === 'admin';
  const isBaseDashboard = pathname === '/dashboard';
  
  return (
    <>
    <div className="flex flex-col min-h-screen w-full">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
           <div className="flex items-center gap-2">
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0 relative">
                  <Menu className="h-5 w-5" />
                  {notificationCount > 0 && (
                     <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center rounded-full p-1 text-xs">
                        {notificationCount}
                     </Badge>
                  )}
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
                        <p className="text-base font-medium leading-none">{user.username}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user.role}</p>
                     </div>
                  </SheetTitle>
                 </SheetHeader>
                 <Separator className="my-2"/>
                 <nav className="grid gap-2 text-lg font-medium">
                    {isAdmin ? (
                      <>
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/users')}>
                            <User className="h-5 w-5" /> Gestione Operatori
                        </Button>
                         <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/leave-requests')}>
                            <CalendarCheck className="h-5 w-5" /> Richieste Ferie
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/supply-requests')}>
                            <Package className="h-5 w-5" /> Richieste Forniture
                        </Button>
                         <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/shift-approval')}>
                            <ClipboardCheck className="h-5 w-5" /> Approvazione Turni
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/extra-shifts')}>
                            <Clock className="h-5 w-5" /> Timbrature Extra
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/warehouse')}>
                            <Warehouse className="h-5 w-5" /> Gestione Magazzino
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/leave-requests')}>
                            <CalendarCheck className="h-5 w-5" /> Le mie Ferie
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/supply-requests')}>
                            <Package className="h-5 w-5" /> Richieste Forniture
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/announcements')}>
                        <Megaphone className="h-5 w-5" /> Annunci
                    </Button>
                    <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/history')}>
                        <History className="h-5 w-5" /> Storico Attività
                    </Button>
                    <Separator className="my-2"/>
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

             {!isBaseDashboard && (
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
           {children}
        </main>
    </div>
    <ChangeCodeDialog 
        isOpen={isChangeCodeOpen}
        onOpenChange={setIsChangeCodeOpen}
        userId={user.id}
      />
    </>
  );
}
