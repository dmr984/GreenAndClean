import Link from 'next/link';
import { Briefcase, Calendar, Home, Package, Settings, Users } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
      <nav className="flex flex-col items-center gap-4 px-2 py-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard"
                className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base"
              >
                <Briefcase className="h-4 w-4 transition-all group-hover:scale-110" />
                <span className="sr-only">WorkForce Hub</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">WorkForce Hub</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
              >
                <Home className="h-5 w-5" />
                <span className="sr-only">Pannello di Controllo</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Pannello di Controllo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard/users"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
              >
                <Users className="h-5 w-5" />
                <span className="sr-only">Utenti</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Utenti</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard/calendar"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
              >
                <Calendar className="h-5 w-5" />
                <span className="sr-only">Calendario</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Calendario</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard/requests"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
              >
                <Package className="h-5 w-5" />
                <span className="sr-only">Richieste</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Richieste</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </nav>
      <nav className="mt-auto flex flex-col items-center gap-4 px-2 py-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
              >
                <Settings className="h-5 w-5" />
                <span className="sr-only">Impostazioni</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Impostazioni</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </nav>
    </aside>
  );
}

export function MobileAppSidebar() {
    return (
        <nav className="grid gap-6 text-lg font-medium">
          <Link
            href="/dashboard"
            className="group flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base"
          >
            <Briefcase className="h-5 w-5 transition-all group-hover:scale-110" />
            <span className="sr-only">WorkForce Hub</span>
          </Link>
          <Link href="/dashboard" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
            <Home className="h-5 w-5" />
            Pannello di Controllo
          </Link>
          <Link href="/dashboard/users" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
            <Users className="h-5 w-5" />
            Utenti
          </Link>
          <Link href="/dashboard/calendar" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
            <Calendar className="h-5 w-5" />
            Calendario
          </Link>
          <Link href="/dashboard/requests" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
            <Package className="h-5 w-5" />
            Richieste
          </Link>
          <Link href="#" className="mt-auto flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
            <Settings className="h-5 w-5" />
            Impostazioni
          </Link>
        </nav>
    )
}
