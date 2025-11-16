'use client';
import React from 'react';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NotificationBellProps {
  notificationCount: number;
}

export function NotificationBell({ notificationCount }: NotificationBellProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative focus:outline-none">
          <Bell className="h-6 w-6 text-foreground" />
          {notificationCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs"
            >
              {notificationCount}
            </Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Notifiche</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notificationCount > 0 ? (
          <DropdownMenuItem>
            Hai {notificationCount} nuove richieste in attesa.
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem>Nessuna nuova notifica.</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
