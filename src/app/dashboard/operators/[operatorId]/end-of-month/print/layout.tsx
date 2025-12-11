import type { Metadata } from 'next';

// This layout ensures that the print page does not inherit the main dashboard layout,
// providing a clean, print-only view without any app navigation or headers.

export const metadata: Metadata = {
  title: 'Stampa Riepilogo Mensile',
  description: 'Pagina di stampa per il riepilogo mensile dell\'operatore.',
};

export default function PrintLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // We just render the children, no extra layout, wrappers, or components.
  return <>{children}</>;
}
