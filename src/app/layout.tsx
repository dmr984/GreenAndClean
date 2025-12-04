import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { UserProvider } from '@/providers/user-provider';
import { InstallPWA } from '@/components/install-pwa';

export const metadata: Metadata = {
  title: 'SERVECO GREEN & CLEAN',
  description: 'Gestisci le tue operazioni con facilità.',
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning className="dark">
      <head>
        <link rel="icon" href="https://i.postimg.cc/GhwM2hg1/1764199658760.png" type="image/png" />
        <link rel="apple-touch-icon" href="https://i.postimg.cc/GhwM2hg1/1764199658760.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#1a1a1a" />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <UserProvider>
            {children}
            <InstallPWA />
          </UserProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
