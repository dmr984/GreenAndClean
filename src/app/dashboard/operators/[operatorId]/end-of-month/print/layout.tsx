import React from 'react';

// This is a special layout that overrides the main dashboard layout.
// Its purpose is to provide a completely blank "canvas" for the print page,
// ensuring that no navigation bars, sidebars, or other UI elements
// from the main app appear on the printed document.

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className='dark'>
        <head>
            <title>Stampa Riepilogo Mensile</title>
        </head>
        <body>
            {children}
        </body>
    </html>
  );
}
