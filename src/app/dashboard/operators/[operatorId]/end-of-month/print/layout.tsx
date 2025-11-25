'use client';
import React from 'react';

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  // This layout is intentionally minimal. It doesn't include the main dashboard
  // header, sidebar, or any other global UI components, ensuring that only
  // the content of the print page itself is rendered.
  return (
    <html>
      <body className="bg-gray-200">
        {children}
      </body>
    </html>
  );
}
