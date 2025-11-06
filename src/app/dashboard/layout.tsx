"use client";
import React from 'react';
import { UserNav } from '@/components/user-nav';
import { usePathname } from 'next/navigation';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import Link from 'next/link';
import { Briefcase, Calendar, CheckCircle, Package, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

const navLinks = [
  { href: '/dashboard/users', label: 'Operatori', icon: Users },
  { href: '/dashboard/calendar', label: 'Calendario', icon: Calendar },
  { href: '/dashboard/leave-requests', label: 'Richieste Ferie', icon: CheckCircle },
  { href: '/dashboard/supply-requests', label: 'Richieste Forniture', icon: Package },
];

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const role = localStorage.getItem('userRole');
      setUserRole(role);
    }
  }, []);

  const isAdmin = userRole === 'admin';
  const isAdminDashboardPage = isAdmin && pathname === '/dashboard';

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-muted/40 md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <Briefcase className="h-6 w-6 text-primary" />
              <span className="">WorkForce Hub</span>
            </Link>
          </div>
          <div className="flex-1">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
              {isAdmin && navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary ${pathname === link.href ? 'bg-muted text-primary' : ''}`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 md:hidden"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col">
              <nav className="grid gap-2 text-lg font-medium">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-lg font-semibold mb-4"
                >
                  <Briefcase className="h-6 w-6 text-primary" />
                  <span >WorkForce Hub</span>
                </Link>
                 {isAdmin && navLinks.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground ${pathname === link.href ? 'bg-muted text-foreground' : ''}`}
                    >
                      <link.icon className="h-5 w-5" />
                      {link.label}
                    </Link>
                  ))}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="w-full flex-1">
            {/* You can add a search bar here if needed */}
          </div>
          <UserNav />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
           {isAdminDashboardPage ? <AdminDashboard /> : children}
        </main>
      </div>
    </div>
  );
}
