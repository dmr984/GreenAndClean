'use client';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Settings, Warehouse, History, Package, CalendarCheck, Megaphone, ClipboardCheck, Clock, User, MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ChangeCodeDialog } from '@/components/change-code-dialog';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

const getFromStorage = <T,>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = localStorage.getItem(key);
    try {
        return stored ? JSON.parse(stored) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
};

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [user, setUser] = useState<UserData | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [isChangeCodeOpen, setIsChangeCodeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = getFromStorage<UserData | null>('user', null);
    if (!storedUser) {
      router.replace('/');
      return; 
    }
    
    setUser(storedUser);
    setIsLoading(false);

    const handleStorageChange = () => {
        const updatedUser = getFromStorage<UserData | null>('user', null);
        if (updatedUser) {
            setUser(updatedUser);
        } else {
            router.replace('/');
        }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [router]);

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

  const handleChangeCodeClick = () => {
      setIsSidebarOpen(false);
      setIsChangeCodeOpen(true);
  }

  const handleNavigation = (path: string) => {
    setIsSidebarOpen(false);
    router.push(path);
  }
  
  const NavButton = ({ path, icon, label }: { path: string, icon: React.ReactNode, label: string }) => (
    <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation(path)}>
        {icon}
        <span className="flex-1 text-left">{label}</span>
    </Button>
  );

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
                        <NavButton path="/dashboard/history" icon={<History className="h-5 w-5" />} label="Storico Attività"/>
                        <NavButton path="/dashboard/warehouse" icon={<Warehouse className="h-5 w-5" />} label="Gestione Magazzino" />
                        <NavButton path="/dashboard/users" icon={<Users className="h-5 w-5" />} label="Gestione Operatori" />
                      </>
                    ) : (
                      <>
                         <NavButton path="/dashboard/leave-requests" icon={<CalendarCheck className="h-5 w-5" />} label="Le mie Ferie" />
                         <NavButton path="/dashboard/supply-requests" icon={<Package className="h-5 w-5" />} label="Richieste Forniture" />
                         <NavButton path="/dashboard/messages" icon={<MessageSquare className="h-5 w-5" />} label="Comunicazioni" />
                      </>
                    )}
                    <NavButton path="/dashboard/announcements" icon={<Megaphone className="h-5 w-5" />} label="Annunci"/>
                    
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
