"use client";
import React from 'react';
import { UserNav } from '@/components/user-nav';
import { usePathname, useRouter } from 'next/navigation';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import Link from 'next/link';
import { Briefcase, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const role = localStorage.getItem('userRole');
      setUserRole(role);
    }
  }, []);

  const isAdmin = userRole === 'admin';
  const isAdminDashboardPage = isAdmin && pathname === '/dashboard';
  const isBaseDashboard = pathname === '/dashboard';

  return (
    <div className="flex flex-col min-h-screen w-full">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
           {!isBaseDashboard && (
             <Button variant="outline" size="icon" className="shrink-0" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Torna indietro</span>
             </Button>
            )}
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <Briefcase className="h-6 w-6 text-primary" />
              <span className="">Serveco Cleaning</span>
            </Link>

          <div className="w-full flex-1">
            {/* You can add a search bar here if needed */}
          </div>
          <UserNav />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
           {isAdminDashboardPage ? <AdminDashboard /> : children}
        </main>
    </div>
  );
}
