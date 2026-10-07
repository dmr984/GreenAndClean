'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, updateDoc, serverTimestamp, doc, getDoc, getDocs, Timestamp, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bell, BellRing, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';

const VAPID_PUBLIC_KEY = 'BNpjt10Qajh1JTCFZfe2fJtfNBG1SKFoxBnowhfvW0o0oOMLZjLrIvjsyr5RWBAZ8Qr79NfiZav1QTGFVUPWotA';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function syncPushSubscription(userId: string, firestore: any) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
    }
    if (subscription) {
      const subJson = subscription.toJSON();
      const endpointHash = btoa(subscription.endpoint).slice(-30).replace(/[^a-zA-Z0-9]/g, '_');
      const subDocRef = doc(firestore, `app-users/${userId}/push-subscriptions`, endpointHash);
      await setDoc(subDocRef, {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log('Push subscription sincronizzata con successo per operatore:', userId);
    }
  } catch (err) {
    console.warn('Errore sincronizzazione push subscription:', err);
  }
}

interface OperatorNotificationListenerProps {
  userId: string;
}

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// Generatore di tono acustico sintetico per notifica
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  } catch (e) {
    // Ignora errori di riproduzione audio se il browser lo blocca
  }
}

export function OperatorNotificationListener({ userId }: OperatorNotificationListenerProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const isRequestingRef = useRef(false);

  // Dati operatore per promemoria turni
  const [operatorSettings, setOperatorSettings] = useState<any>(null);

  // Funzione per richiedere il permesso di notifica
  const triggerPermissionRequest = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (isRequestingRef.current) return;

    try {
      isRequestingRef.current = true;
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        setIsPermissionModalOpen(false);
        playNotificationChime();
        toast({
          title: 'Notifiche Attivate! 🔔',
          description: 'Riceverai promemoria e avvisi sui tuoi turni direttamente sul tuo telefono.',
        });

        // Sincronizza sottoscrizione Web Push per ricevere le notifiche anche ad app chiusa
        if (firestore && userId) {
          syncPushSubscription(userId, firestore);
        }

        // Invia notifica di benvenuto per registrare il canale
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification('Serveco - Notifiche Attive ✅', {
              body: 'Tutte le comunicazioni sui tuoi turni arriveranno direttamente qui.',
              icon: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
              badge: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
            });
          }).catch(() => {
            new Notification('Serveco - Notifiche Attive ✅', {
              body: 'Tutte le comunicazioni sui tuoi turni arriveranno direttamente qui.',
              icon: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
            });
          });
        }
      }
    } catch (error) {
      console.error('Errore durante la richiesta permesso notifiche:', error);
    } finally {
      isRequestingRef.current = false;
    }
  };

  // 1. Controllo supporto e stato permessi all'avvio dell'app
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const currentPerm = Notification.permission;
    setPermission(currentPerm);

    // Se già concesse, assicurati che la sottoscrizione push sia registrata
    if (currentPerm === 'granted' && firestore && userId) {
      syncPushSubscription(userId, firestore);
    }

    // Se le notifiche non sono ancora concesse (o sono state rifiutate), mostra il popup all'apertura dell'app
    if (currentPerm !== 'granted') {
      setIsPermissionModalOpen(true);

      // Tenta anche la richiesta nativa diretta se in stato default
      if (currentPerm === 'default') {
        triggerPermissionRequest();

        // Listener al primo tocco sullo schermo se il browser mobile blocca la richiesta a freddo
        const handleFirstInteraction = () => {
          triggerPermissionRequest();
          window.removeEventListener('click', handleFirstInteraction);
          window.removeEventListener('touchstart', handleFirstInteraction);
        };

        window.addEventListener('click', handleFirstInteraction, { once: true, passive: true });
        window.addEventListener('touchstart', handleFirstInteraction, { once: true, passive: true });

        return () => {
          window.removeEventListener('click', handleFirstInteraction);
          window.removeEventListener('touchstart', handleFirstInteraction);
        };
      }
    }
  }, [firestore, userId]);

  // 2. Caricamento impostazioni operatore per promemoria turni
  useEffect(() => {
    if (!firestore || !userId) return;

    const opRef = doc(firestore, 'app-users', userId);
    const unsubscribe = onSnapshot(opRef, (snapshot) => {
      if (snapshot.exists()) {
        setOperatorSettings(snapshot.data());
      }
    });

    return () => unsubscribe();
  }, [firestore, userId]);

  // 3. Listener in tempo reale per le notifiche inviate dall'amministratore
  useEffect(() => {
    if (!firestore || !userId) return;

    const notifQuery = query(
      collection(firestore, `app-users/${userId}/user-notifications`),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(notifQuery, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const title = data.title || 'Aggiornamento Turno';
          const body = data.body || 'Hai una nuova notifica da Serveco';
          const targetUrl = data.url || '/dashboard';

          // Suono acustico e vibrazione
          playNotificationChime();
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([200, 100, 200]);
            } catch (e) {
              // Ignore vibrate errors
            }
          }

          // Notifica nativa di sistema se concessa
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(title, {
                  body,
                  icon: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
                  badge: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
                  vibrate: [200, 100, 200],
                  data: { url: targetUrl },
                } as any);
              }).catch(() => {
                try {
                  new Notification(title, {
                    body,
                    icon: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
                  });
                } catch (e) {
                  console.error(e);
                }
              });
            } else {
              try {
                new Notification(title, {
                  body,
                  icon: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
                });
              } catch (e) {
                console.error(e);
              }
            }
          }

          // Toast visibile nell'applicazione
          toast({
            title,
            description: body,
          });

          // Segna come letta per non duplicarla
          try {
            await updateDoc(change.doc.ref, {
              read: true,
              deliveredAt: serverTimestamp(),
            });
          } catch (err) {
            console.error('Errore nell\'aggiornare lo stato della notifica:', err);
          }
        }
      });
    });

    return () => unsubscribe();
  }, [firestore, userId, toast]);

  // 4. Timer automatico per Promemoria Timbrature (Entrata / Uscita) personalizzabili
  useEffect(() => {
    if (!firestore || !userId || !operatorSettings) return;
    if (!operatorSettings.shiftRemindersEnabled) return;

    const checkReminders = async () => {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTotalMin = currentHours * 60 + currentMinutes;

      const daysOfWeekMap: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayDay = daysOfWeekMap[now.getDay()];

      let targetEntryTimeStr = '';
      let targetExitTimeStr = '';

      if (operatorSettings.useWorkScheduleReminders) {
        const schedule = operatorSettings.workSchedule?.[todayDay];
        if (schedule?.startTime) {
          const [sh, sm] = schedule.startTime.split(':').map(Number);
          const advance = Number(operatorSettings.reminderAdvanceMinutes) || 10;
          let entryMin = sh * 60 + sm - advance;
          if (entryMin < 0) entryMin += 24 * 60;
          const eh = Math.floor(entryMin / 60);
          const em = entryMin % 60;
          targetEntryTimeStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
        }
        if (schedule?.endTime) {
          targetExitTimeStr = schedule.endTime;
        }
      } else {
        targetEntryTimeStr = operatorSettings.entryReminderTime || '';
        targetExitTimeStr = operatorSettings.exitReminderTime || '';
      }

      // Controlla promemoria entrata
      if (targetEntryTimeStr) {
        const [th, tm] = targetEntryTimeStr.split(':').map(Number);
        const targetTotalMin = th * 60 + tm;
        const diff = currentTotalMin - targetTotalMin;

        // Se siamo nella finestra di 3 minuti dall'orario previsto
        if (diff >= 0 && diff <= 3) {
          const alreadySent = localStorage.getItem(`entry_reminder_${todayStr}`);
          if (!alreadySent) {
            // Verifica se l'operatore ha già timbrato l'entrata oggi
            try {
              const startToday = startOfDay(now);
              const endToday = endOfDay(now);
              const qTimbrature = query(
                collection(firestore, `app-users/${userId}/timbrature`),
                where('timestamp', '>=', startToday),
                where('timestamp', '<=', endToday)
              );
              const snap = await getDocs(qTimbrature);
              const hasEntry = snap.docs.some(d => d.data().type === 'entrata');

              if (!hasEntry) {
                // Invia promemoria entrata
                playNotificationChime();
                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                  try { navigator.vibrate([250, 100, 250]); } catch (e) {}
                }

                const notifTitle = '⏰ Promemoria Inizio Turno';
                const notifBody = 'Ricordati di registrare la timbratura di entrata!';

                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then((reg) => {
                      reg.showNotification(notifTitle, {
                        body: notifBody,
                        icon: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
                        badge: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
                        vibrate: [250, 100, 250],
                      } as any);
                    }).catch(() => {});
                  }
                }

                toast({ title: notifTitle, description: notifBody });
                localStorage.setItem(`entry_reminder_${todayStr}`, 'true');
              } else {
                localStorage.setItem(`entry_reminder_${todayStr}`, 'true');
              }
            } catch (err) {
              console.error('Errore controllo timbratura entrata:', err);
            }
          }
        }
      }

      // Controlla promemoria uscita
      if (targetExitTimeStr) {
        const [th, tm] = targetExitTimeStr.split(':').map(Number);
        const targetTotalMin = th * 60 + tm;
        const diff = currentTotalMin - targetTotalMin;

        if (diff >= 0 && diff <= 3) {
          const alreadySent = localStorage.getItem(`exit_reminder_${todayStr}`);
          if (!alreadySent) {
            try {
              const startToday = startOfDay(now);
              const endToday = endOfDay(now);
              const qTimbrature = query(
                collection(firestore, `app-users/${userId}/timbrature`),
                where('timestamp', '>=', startToday),
                where('timestamp', '<=', endToday)
              );
              const snap = await getDocs(qTimbrature);
              const hasEntry = snap.docs.some(d => d.data().type === 'entrata');
              const hasExit = snap.docs.some(d => d.data().type === 'uscita');

              // Se ha timbrato l'entrata ma non ancora l'uscita
              if (hasEntry && !hasExit) {
                playNotificationChime();
                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                  try { navigator.vibrate([250, 100, 250]); } catch (e) {}
                }

                const notifTitle = '⏰ Promemoria Fine Turno';
                const notifBody = 'Ricordati di registrare la timbratura di uscita!';

                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then((reg) => {
                      reg.showNotification(notifTitle, {
                        body: notifBody,
                        icon: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
                        badge: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
                        vibrate: [250, 100, 250],
                      } as any);
                    }).catch(() => {});
                  }
                }

                toast({ title: notifTitle, description: notifBody });
                localStorage.setItem(`exit_reminder_${todayStr}`, 'true');
              } else if (hasExit) {
                localStorage.setItem(`exit_reminder_${todayStr}`, 'true');
              }
            } catch (err) {
              console.error('Errore controllo timbratura uscita:', err);
            }
          }
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 40000); // Controlla ogni 40 secondi
    return () => clearInterval(interval);
  }, [firestore, userId, operatorSettings, toast]);

  if (!isSupported) return null;

  return (
    <>
      {/* Finestra modale all'apertura dell'app per richiedere le notifiche se non autorizzate */}
      <Dialog open={isPermissionModalOpen} onOpenChange={setIsPermissionModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary text-lg">
              <BellRing className="h-5 w-5 text-amber-500" />
              {permission === 'denied' ? 'Notifiche Bloccate sul Telefono' : 'Attiva Notifiche Turno'}
            </DialogTitle>
            <DialogDescription className="text-left pt-2 space-y-3">
              {permission === 'denied' ? (
                <>
                  <p className="text-foreground text-sm font-medium">
                    Le notifiche sono attualmente disattivate o rifiutate su questo browser.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    L'amministratore ha impostato promemoria per i tuoi turni (orari di entrata/uscita) e conferme dei turni.
                  </p>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-foreground space-y-1.5">
                    <p className="font-semibold text-amber-700 dark:text-amber-400">Come riabilitarle facilmente:</p>
                    <p>1. Tocca l'icona del <strong>lucchetto 🔒</strong> o delle <strong>impostazioni sito</strong> in alto nella barra del browser.</p>
                    <p>2. Imposta l'opzione <strong>Notifiche</strong> su <strong>Consenti</strong>.</p>
                    <p>3. Ricarica la pagina.</p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-foreground text-sm">
                    Ricevi i promemoria quando devi timbrare l'entrata e l'uscita, e gli avvisi quando i tuoi turni vengono approvati.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Premi il tasto qui sotto per consentire le notifiche sul tuo dispositivo.
                  </p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsPermissionModalOpen(false)}>
              Più tardi
            </Button>
            <Button onClick={triggerPermissionRequest} className="gap-1.5">
              <Bell className="h-4 w-4" />
              {permission === 'denied' ? 'Riprova ad Attivare' : 'Consenti Notifiche'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Banner persistente in cima se ancora non concesse */}
      {permission === 'default' && (
        <div 
          onClick={triggerPermissionRequest} 
          className="cursor-pointer bg-primary/10 hover:bg-primary/15 transition-all border border-primary/25 rounded-xl p-3.5 sm:p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg text-primary shrink-0">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">Attiva Notifiche sul Telefono</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tocca qui o premi "Consenti" per ricevere subito promemoria timbrature e approvazioni.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); triggerPermissionRequest(); }} className="shrink-0 gap-1.5 w-full sm:w-auto">
            <Bell className="h-4 w-4" /> Consenti Notifiche
          </Button>
        </div>
      )}

      {permission === 'denied' && (
        <div className="bg-muted/60 border border-border rounded-xl p-3 mb-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <span>
              Notifiche disattivate sul dispositivo. Tocca il lucchetto 🔒 nel browser per consentirle.
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setIsPermissionModalOpen(true)}>
            Istruzioni
          </Button>
        </div>
      )}
    </>
  );
}
