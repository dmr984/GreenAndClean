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
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { OperatorDashboard } from './operator-dashboard';

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [userName, setUserName] = React.useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [isChangeCodeOpen, setIsChangeCodeOpen] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const auth = useAuth();
  const { user: authUser, isUserLoading } = useUser();
  const firestore = useFirestore();

  React.useEffect(() => {
    const fetchUserData = async () => {
      if (isUserLoading) return;
      if (!authUser) {
        router.replace('/');
        return;
      }
      
      const userId = authUser.email === 'admin@serveco.it' ? 'admin_user' : authUser.uid;
      const userDocRef = doc(firestore, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const role = userData.role;
        setUserRole(role);
        setUserName(userData.name);

        // Privacy enforcement
        const isOperator = role === 'operator';
        const isAdminPage = pathname.startsWith('/dashboard/users') || 
                              pathname === '/dashboard/warehouse' || 
                              pathname === '/dashboard/announcements';

        if (isOperator && isAdminPage) {
            router.replace('/dashboard');
        }
      } else {
        // Doc not found, maybe a stale auth session. Log out.
        await handleLogout();
      }
    };
    
    fetchUserData();

  }, [pathname, router, authUser, isUserLoading, firestore]);

  const handleLogout = async () => {
    try {
        await signOut(auth);
        setUserRole(null);
        setUserName(null);
        router.push('/');
        setIsSidebarOpen(false);
    } catch (error) {
        console.error("Error signing out: ", error);
    }
  }


  const getEmail = () => {
    return authUser?.email || 'utente@serveco.it';
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
    if (userRole === 'operator' && authUser) {
      router.push(`/dashboard/users/${authUser.uid}`);
    } else if (userRole === 'admin') {
      router.push(`/dashboard/users/admin_user`);
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

  const isAdmin = userRole === 'admin';
  const isBaseDashboard = pathname === '/dashboard';
  
  if(isUserLoading || !userRole) {
      return <div className="flex items-center justify-center min-h-screen">Caricamento...</div>;
  }

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
           {isBaseDashboard ? (isAdmin ? <AdminDashboard /> : <OperatorDashboard />) : children}
        </main>
    </div>
    <ChangeCodeDialog 
        isOpen={isChangeCodeOpen}
        onOpenChange={setIsChangeCodeOpen}
        userId={authUser?.email === 'admin@serveco.it' ? 'admin_user' : authUser?.uid}
      />
    </>
  );
}
