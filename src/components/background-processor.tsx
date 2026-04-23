'use client';
import { useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Questo componente funge da 'cron job' lato client.
 * Ogni volta che un utente apre l'app, controlla se è passato abbastanza tempo
 * dall'ultima esecuzione delle notifiche programmate. Se sì, le attiva.
 */
export function BackgroundProcessor() {
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) return;

    const triggerScheduledNotifications = async () => {
      try {
        const syncRef = doc(firestore, 'app-settings', 'notification-sync');
        const syncDoc = await getDoc(syncRef);
        
        const now = Date.now();
        const lastRun = syncDoc.exists() ? syncDoc.data().lastRun?.toMillis() || 0 : 0;

        // Se l'ultima esecuzione è stata più di 1 minuto fa (60000 ms)
        if (now - lastRun > 60000) {
          // Aggiorniamo subito il timestamp per evitare che altri client facciano la stessa chiamata
          await setDoc(syncRef, { lastRun: serverTimestamp() }, { merge: true });

          console.log('Attivazione automatica notifiche programmate...');
          
          // Chiamiamo l'endpoint API che abbiamo creato
          const response = await fetch('/api/cron/send-scheduled-notifications');
          if (response.ok) {
            const data = await response.json();
            console.log('Risultato motore notifiche:', data);
          } else {
            console.warn('Il motore notifiche non ha risposto correttamente:', response.status);
          }
        }
      } catch (error) {
        console.error('Errore nel processore in background:', error);
      }
    };

    // Eseguiamo il controllo all'avvio
    triggerScheduledNotifications();

    // E poi ogni 5 minuti finché la tab è aperta
    const interval = setInterval(triggerScheduledNotifications, 5 * 60000);
    return () => clearInterval(interval);
  }, [firestore]);

  return null; // Componente invisibile
}
