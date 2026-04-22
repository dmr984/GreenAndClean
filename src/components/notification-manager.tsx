'use client';
import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useMessaging, useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from './ui/button';

export function NotificationManager() {
  const messaging = useMessaging();
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
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
      
      if (status === 'granted') {
        // Recupera il token FCM
        // Nota: Qui andrebbe la chiave VAPID pubblica se configurata nella console Firebase
        const token = await getToken(messaging, {
          vapidKey: undefined // Inserire qui la chiave VAPID se disponibile
        });

        if (token) {
          console.log('FCM Token:', token);
          // Salva il token nel profilo dell'utente su Firestore
          const userRef = doc(firestore, 'app-users', user.id);
          await updateDoc(userRef, {
            notificationTokens: arrayUnion(token)
          });
          
          toast({
            title: 'Notifiche Attivate',
            description: 'Riceverai un avviso quando il tuo turno sta per scadere.',
          });
        }
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

  if (permission === 'denied') {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2 text-muted-foreground">
        <BellOff className="h-4 w-4" /> Notifiche Bloccate
      </Button>
    );
  }

  if (permission === 'granted') {
    return (
      <Button variant="ghost" size="sm" className="gap-2 text-primary">
        <BellRing className="h-4 w-4" /> Notifiche Attive
      </Button>
    );
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={requestPermission} 
      disabled={isRegistering}
      className="gap-2 animate-pulse hover:animate-none"
    >
      <Bell className="h-4 w-4" /> Attiva Notifiche Test
    </Button>
  );
}
