'use client';
import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useMessaging, useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from './ui/button';

import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from './ui/alert-dialog';

export function NotificationManager() {
  const messaging = useMessaging();
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const currentPermission = Notification.permission;
      setPermission(currentPermission);
      
      // Mostra il prompt solo se il permesso non è ancora stato deciso
      // E se l'utente non ha già cliccato "Non ora" recentemente
      const hasDismissed = localStorage.getItem('notifications-dismissed');
      if (currentPermission === 'default' && !hasDismissed) {
        // Un piccolo ritardo per non sovrapporsi ad altri caricamenti
        const timer = setTimeout(() => setShowPrompt(true), 2000);
        return () => clearTimeout(timer);
      }
    }

    if (messaging) {
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Messaggio ricevuto in primo piano:', payload);
        toast({
          title: payload.notification?.title || 'Nuova Notifica',
          description: payload.notification?.body || '',
          variant: 'default',
        });
      });
      return () => unsubscribe();
    }
  }, [messaging, toast]);

  const requestPermission = async () => {
    if (!messaging || !user || !firestore) return;
    
    setIsRegistering(true);
    try {
      const status = await Notification.requestPermission();
      setPermission(status);
      setShowPrompt(false);
      
      // Memorizziamo che l'utente ha interagito, così non lo richiediamo più ad ogni refresh
      localStorage.setItem('notifications-dismissed', 'true');
      
      if (status === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: undefined
        });

        if (token) {
          console.log('FCM Token:', token);
          const userRef = doc(firestore, 'app-users', user.id);
          await updateDoc(userRef, {
            notificationTokens: arrayUnion(token)
          });
          
          toast({
            title: 'Notifiche Attivate',
            description: 'Riceverai un avviso per i tuoi turni.',
          });
        }
      } else {
        // Se l'utente nega o chiude il popup di sistema, ricordiamo la scelta
        localStorage.setItem('notifications-dismissed', 'true');
      }
    } catch (error) {
      console.error('Errore nella registrazione delle notifiche:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile attivare le notifiche su questo dispositivo.',
        variant: 'destructive',
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('notifications-dismissed', 'true');
  };

  // Se i permessi sono già stati gestiti, non renderizziamo nulla nell'interfaccia
  return (
    <AlertDialog open={showPrompt} onOpenChange={setShowPrompt}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" /> Attiva Notifiche Push
          </AlertDialogTitle>
          <AlertDialogDescription>
            Vuoi ricevere notifiche per i promemoria dei turni e le comunicazioni dell'amministratore? 
            Potrai disattivarle in ogni momento dalle impostazioni del browser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDismiss}>Non ora</AlertDialogCancel>
          <AlertDialogAction onClick={requestPermission} disabled={isRegistering}>
            {isRegistering ? 'Attivazione...' : 'Attiva Notifiche'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
