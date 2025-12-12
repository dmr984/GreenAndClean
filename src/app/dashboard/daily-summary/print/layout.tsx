'use client';
import { Toaster } from '@/components/ui/toaster';

export default function PrintLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <div className="font-body antialiased bg-muted/40">
            {children}
            <Toaster />
      </div>
  );
}
