'use client';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Menu, LogOut, Settings, Users, Home, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ChangeCodeDialog } from '@/components/change-code-dialog';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';
import { useAuth } from '@/firebase';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore }from '@/firebase';


type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [user, setUser] = useState<UserData | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isChangeCodeOpen, setIsChangeCodeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!auth || !firestore) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        // User is signed in, get custom data from Firestore
        const userDocRef = doc(firestore, 'app-users', firebaseUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const appUser = { id: docSnap.id, ...docSnap.data() } as UserData;
          setUser(appUser);
          localStorage.setItem('user', JSON.stringify(appUser)); // For legacy access if needed, but primary auth is now state
        } else {
          // User exists in Auth but not in Firestore, something is wrong
          signOut(auth); // Log them out
        }
      } else {
        // User is signed out
        setUser(null);
        localStorage.removeItem('user');
        router.replace('/');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [auth, firestore, router]);


  const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
    // The onAuthStateChanged listener will handle the redirect
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

    if (pathname !== '/dashboard') {
        // For sub-pages like /operators, pass user to children
        return React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { user }) : children;
    }

    if (user?.role === 'admin') {
      return <AdminDashboard user={user} />;
    }

    if (user?.role === 'operator') {
      return <OperatorDashboard user={user} />;
    }
    
    // If no user, show loading or redirect. The listener should handle redirect.
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Verifica autenticazione...</p>
        </div>
      </div>
    );
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
