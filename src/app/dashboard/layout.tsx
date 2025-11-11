'use client';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminDashboard } from '@/app/dashboard/admin-dashboard';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Settings, User, Lock, CalendarCheck, Package, Warehouse, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ChangeCodeDialog } from '@/components/change-code-dialog';
import { OperatorDashboard } from './operator-dashboard';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [user, setUser] = React.useState<UserData | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [isChangeCodeOpen, setIsChangeCodeOpen] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.replace('/');
      return;
    }
    
    const userData: UserData = JSON.parse(storedUser);
    setUser(userData);

    // Privacy enforcement
    const isAdminPage = pathname.startsWith('/dashboard/users') || 
                          pathname === '/dashboard/warehouse' || 
                          pathname === '/dashboard/announcements';

    if (userData.role === 'operator' && isAdminPage) {
        router.replace('/dashboard');
    }

  }, [pathname, router]);

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

  if(!user) {
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
                <Button variant="outline" size="icon" className="shrink-0">
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
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/users')}>
                            <User className="h-5 w-5" /> Gestione Operatori
                        </Button>
                         <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/leave-requests')}>
                            <CalendarCheck className="h-5 w-5" /> Richieste Ferie
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/supply-requests')}>
                            <Package className="h-5 w-5" /> Richieste Forniture
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/warehouse')}>
                            <Warehouse className="h-5 w-5" /> Gestione Magazzino
                        </Button>
                         <Button variant="ghost" className="justify-start gap-2" onClick={() => handleNavigation('/dashboard/announcements')}>
                            <Megaphone className="h-5 w-5" /> Annunci
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
           {isBaseDashboard ? (isAdmin ? <AdminDashboard /> : <OperatorDashboard />) : children}
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
