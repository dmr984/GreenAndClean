'use client';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminDashboard } from '@/app/dashboard/admin-dashboard';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Settings, User, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ChangeCodeDialog } from '@/components/change-code-dialog';

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [userName, setUserName] = React.useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = React.useState<string|null>(null);
  const [isChangeCodeOpen, setIsChangeCodeOpen] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    const checkUserAndData = () => {
        if (typeof window !== 'undefined') {
          const role = localStorage.getItem('userRole');
          const id = localStorage.getItem('userId');
          const name = localStorage.getItem('userName');
          setUserRole(role);
          setUserId(id);
          setUserName(name);

          // Privacy enforcement
          if (role === 'operator') {
              if(pathname.startsWith('/dashboard/users') || pathname === '/dashboard/warehouse' || pathname === '/dashboard/announcements' || pathname === '/dashboard/messages') {
                  if (pathname.startsWith('/dashboard/users/') && pathname.endsWith(id ?? '')) {
                      // This is the operator's own profile, allow it
                  } else {
                     router.replace('/dashboard');
                  }
              }
          }
        }
    }
    
    checkUserAndData();
    window.addEventListener('storage', checkUserAndData);

    return () => {
      window.removeEventListener('storage', checkUserAndData);
    }
  }, [pathname, router]);

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    router.push('/');
    setIsSidebarOpen(false);
  }

  const getEmail = () => {
    if (userRole === 'admin') return 'admin@serveco.it';
    if (userName) return `${userName.toLowerCase().replace(' ', '.')}@serveco.it`;
    return 'utente@serveco.it';
  }

  const getAvatarFallback = () => {
     if (userName) {
        const parts = userName.split(' ');
        if (parts.length > 1) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return userName.substring(0, 2).toUpperCase();
     }
     return "U";
  }
  
  const handleProfileClick = () => {
    setIsSidebarOpen(false);
    if (userRole === 'operator' && userId) {
      router.push(`/dashboard/users/${userId}`);
    } else if (userRole === 'admin') {
      router.push(`/dashboard/users/admin`);
    }
  };

  const handleChangeCodeClick = () => {
      setIsSidebarOpen(false);
      setIsChangeCodeOpen(true);
  }

  const isAdmin = userRole === 'admin';
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
                        <p className="text-base font-medium leading-none">{userName || 'Utente'}</p>
                        <p className="text-xs leading-none text-muted-foreground">{getEmail()}</p>
                     </div>
                  </SheetTitle>
                 </SheetHeader>
                 <Separator className="my-2"/>
                 <nav className="grid gap-2 text-lg font-medium">
                   <Button variant="ghost" className="justify-start gap-2" onClick={handleProfileClick}>
                      <User className="h-5 w-5" /> Profilo
                   </Button>
                   <Button variant="ghost" className="justify-start gap-2" onClick={handleChangeCodeClick}>
                      <Lock className="h-5 w-5" /> Cambia Codice
                   </Button>
                   <Button variant="ghost" className="justify-start gap-2" disabled>
                      <Settings className="h-5 w-5" /> Impostazioni
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
           {isAdmin && isBaseDashboard ? <AdminDashboard /> : children}
        </main>
    </div>
    <ChangeCodeDialog 
        isOpen={isChangeCodeOpen}
        onOpenChange={setIsChangeCodeOpen}
        userId={userId}
      />
    </>
  );
}
