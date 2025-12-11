'use client';
import React, { useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { ChangeCodeDialog } from '@/components/change-code-dialog';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const { user, isLoading } = useUser();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  if (isLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
        <main className="flex flex-1 flex-col gap-4 lg:gap-6 p-4 lg:p-6">
            {children}
        </main>
        <ChangeCodeDialog isOpen={isSettingsOpen} onOpenChange={setIsSettingsOpen} userId={user?.id || null} />
    </>
  );
}
