"use client";
import React from 'react';
import { UserNav } from '@/components/user-nav';
import { usePathname } from 'next/navigation';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import Link from 'next/link';
import { Briefcase } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    // This check is to prevent errors during server-side rendering
    if (typeof window !== 'undefined') {
      const role = localStorage.getItem('userRole');
      setUserRole(role);
    }
  }, []);

  const isAdminDashboardPage = userRole === 'admin' && pathname === '/dashboard';

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <div className="flex flex-col sm:gap-4 sm:py-4">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <Link
                href="/dashboard"
                className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base"
              >
                <Briefcase className="h-4 w-4 transition-all group-hover:scale-110" />
                <span className="sr-only">WorkForce Hub</span>
          </Link>
          <div className="ml-auto">
             <UserNav />
          </div>
        </header>
        <main className="flex-1 p-4 sm:px-6 sm:py-0">
           {isAdminDashboardPage ? <AdminDashboard /> : children}
        </main>
      </div>
    </div>
  );
}

    