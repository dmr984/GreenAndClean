'use client';
import React from 'react';
import { UserNav } from '@/components/user-nav';
import { usePathname, useRouter } from 'next/navigation';
import { AdminDashboard } from '@/app/dashboard/admin-dashboard';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';


export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [unreadMessages, setUnreadMessages] = React.useState(0);
  const [userId, setUserId] = React.useState<string|null>(null);

  React.useEffect(() => {
    const checkUserAndMessages = () => {
        if (typeof window !== 'undefined') {
        const role = localStorage.getItem('userRole');
        const id = localStorage.getItem('userId');
        setUserRole(role);
        setUserId(id);

        // Privacy enforcement
        if (role === 'operator') {
            if(pathname.startsWith('/dashboard/users') || pathname === '/dashboard/warehouse' || pathname === '/dashboard/announcements') {
                if (pathname.startsWith('/dashboard/users/') && pathname.endsWith(id ?? '')) {
                    // This is the operator's own profile, allow it
                } else {
                   router.replace('/dashboard');
                }
            }
        }
        
        // Check for unread messages
        const allMessages = JSON.parse(localStorage.getItem('private-messages') || '{}');
        let count = 0;
        if(role === 'admin') {
            // Count conversations with at least one unread message from an operator
            Object.values(allMessages).forEach((convo: any) => {
                if(convo.some((msg: any) => !msg.read && msg.sender !== 'admin')) {
                    count++;
                }
            });
        } else if (id && allMessages[id]) {
            // Count unread messages from admin for the current operator
            count = allMessages[id].filter((msg:any) => !msg.read && msg.sender === 'admin').length;
        }
        setUnreadMessages(count);

      }
    }
    
    checkUserAndMessages();
    window.addEventListener('storage', checkUserAndMessages);

    return () => {
      window.removeEventListener('storage', checkUserAndMessages);
    }
  }, [pathname, router]);

  const isAdmin = userRole === 'admin';
  const isOperator = userRole === 'operator';
  const isAdminDashboardPage = isAdmin && pathname === '/dashboard';
  const isBaseDashboard = pathname === '/dashboard';
  
  const getMessageRoute = () => {
      if (isAdmin) return '/dashboard/messages';
      if (isOperator) return `/dashboard/messages?userId=${userId}`;
      return '#';
  }

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
             {(isAdmin || isOperator) && (
                <Link href={getMessageRoute()}>
                 <Button variant="ghost" size="icon" className="relative">
                    <MessageSquare className="h-5 w-5"/>
                    {unreadMessages > 0 && <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 text-xs flex items-center justify-center rounded-full">{unreadMessages}</Badge>}
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
