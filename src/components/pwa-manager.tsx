'use client';

import { useEffect } from 'react';

export function PWAManager() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Registriamo il nostro sw.js specifico
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        console.log('GreenAndClean Service Worker registrato:', registration.scope);
      }).catch((err) => {
        console.warn('GreenAndClean Service Worker non registrato:', err);
      });
    }
  }, []);

  return null;
}
