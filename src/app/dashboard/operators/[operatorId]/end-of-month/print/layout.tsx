'use client';
import { Toaster } from '@/components/ui/toaster';

export default function PrintLayout({
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
      <body className="font-body antialiased bg-muted/40">
            {children}
            <Toaster />
      </body>
    </html>
  );
}
