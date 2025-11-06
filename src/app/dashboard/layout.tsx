'use client';
import React from 'react';
import { UserNav } from '@/components/user-nav';
import { usePathname, useRouter } from 'next/navigation';
import { AdminDashboard } from '@/app/dashboard/admin-dashboard';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [unreadMessages, setUnreadMessages] = React.useState(0);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const role = localStorage.getItem('userRole');
      setUserRole(role);

      // Privacy enforcement
      if (role === 'operator') {
          if(pathname.startsWith('/dashboard/users') || pathname === '/dashboard/warehouse' || pathname === '/dashboard/announcements' || pathname === '/dashboard/leave-requests' || pathname === '/dashboard/supply-requests' || pathname === '/dashboard/messages') {
              const userId = localStorage.getItem('userId');
              // Operators can only access their own profile and messages
              if (pathname.startsWith('/dashboard/users/') && pathname.endsWith(userId ?? '')) {
                  // This is the operator's own profile, allow it
              } else if (pathname === '/dashboard/leave-requests' || pathname === '/dashboard/supply-requests' || pathname === '/dashboard/messages') {
                 // allow operator to create/view their own requests/messages
              }
              else {
                 router.replace('/dashboard');
              }
          }
      }
      
      // Check for unread messages (mock logic)
        const allMessages = JSON.parse(localStorage.getItem('private-messages') || '{}');
        const userId = localStorage.getItem('userId');
        let count = 0;
        if(role === 'admin') {
            Object.values(allMessages).forEach((convo: any) => {
                if(convo.some((msg: any) => !msg.read && msg.sender !== 'admin')) {
                    count++;
                }
            })
        } else if (userId && allMessages[userId]) {
            count = allMessages[userId].filter((msg:any) => !msg.read && msg.sender === 'admin').length;
        }
        setUnreadMessages(count);

    }
  }, [pathname, router]);

  const isAdmin = userRole === 'admin';
  const isAdminDashboardPage = isAdmin && pathname === '/dashboard';
  const isBaseDashboard = pathname === '/dashboard';

  return (
    <div className="flex flex-col min-h-screen w-full">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
           <div className="flex-none w-1/3 flex items-start">
             {!isBaseDashboard && (
               <Button variant="outline" size="icon" className="shrink-0" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Torna indietro</span>
               </Button>
              )}
           </div>

          <div className="flex-1 flex justify-center">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-lg">
              <Briefcase className="h-6 w-6 text-primary" />
              <span className="uppercase tracking-wider">Serveco Cleaning</span>
            </Link>
          </div>

          <div className="w-1/3 flex justify-end items-center gap-4">
             {userRole === 'admin' && (
                <Link href="/dashboard/messages">
                 <Button variant="ghost" size="icon" className="relative">
                    <MessageSquare className="h-5 w-5"/>
                    {unreadMessages > 0 && <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-destructive" />}
                    <span className="sr-only">Messaggi Privati</span>
                 </Button>
               </Link>
            )}
            <UserNav />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
           {isAdminDashboardPage ? <AdminDashboard /> : children}
        </main>
    </div>
  );
}
