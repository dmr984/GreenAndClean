'use client';

import { useEffect } from 'react';

export function PWAManager() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          // Disinstalliamo TUTTI i service worker registrati per pulire localhost.
          // Questo forzerà la registrazione di quello corretto di GreenAndClean.
          registration.unregister().then(() => {
            console.log('Vecchi Service Worker rimossi per evitare conflitti.');
          });
        }
      });

      // Registriamo il nostro sw.js specifico
      navigator.serviceWorker.register('/sw.js').then((registration) => {
          console.log('GreenAndClean Service Worker registrato.');
      }).catch((err) => {
          console.warn('GreenAndClean Service Worker non registrato:', err);
      });
    }
  }, []);

  return null;
}
