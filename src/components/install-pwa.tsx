"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Bell } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallPWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isInstallDialogVisible, setIsInstallDialogVisible] = useState(false);
  const [isNotificationDialogVisible, setIsNotificationDialogVisible] = useState(false);

  const { toast } = useToast();

  const handleBeforeInstallPrompt = useCallback((e: Event) => {
    e.preventDefault();
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return; // Don't show prompt if already in standalone mode
    }
    setInstallPrompt(e as BeforeInstallPromptEvent);
    setIsInstallDialogVisible(true);
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window) {
       const permission = await Notification.requestPermission();
       setNotificationPermission(permission);
       if (permission === 'granted') {
          console.log('Notification permission granted.');
          // Here you would typically subscribe the user to push notifications.
       } else {
          console.log('Notification permission denied.');
       }
    }
  }, []);


  useEffect(() => {
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
            console.log('Service Worker registered with scope:', registration.scope);
            // After successful registration, check notification permission
             if ('Notification' in window) {
                setNotificationPermission(Notification.permission);
                if (Notification.permission === 'default') {
                    // We can choose to prompt for notifications after a short delay
                    setTimeout(() => {
                        setIsNotificationDialogVisible(true);
                    }, 5000); // 5-second delay
                }
            }
        })
        .catch((error) => console.log('Service Worker registration failed:', error));
    }
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [handleBeforeInstallPrompt]);


  const handleInstall = async () => {
    setIsInstallDialogVisible(false);
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      toast({
        title: "App Installata!",
        description: "SERVECO GREEN & CLEAN è stato aggiunto alla tua schermata principale.",
      });
    }
    setInstallPrompt(null);
  };
  
  const handleNotificationRequest = () => {
      setIsNotificationDialogVisible(false);
      requestNotificationPermission();
  };


  return (
      <>
        <AlertDialog open={isInstallDialogVisible} onOpenChange={setIsInstallDialogVisible}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className='flex items-center gap-3 mb-2'>
                  <Download className='h-6 w-6 text-primary' />
                  <AlertDialogTitle className='text-xl'>Installa l'App</AlertDialogTitle>
              </div>
              <AlertDialogDescription>
                Aggiungi SERVECO GREEN & CLEAN alla tua schermata principale per un accesso rapido e un'esperienza offline.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsInstallDialogVisible(false)}>Più Tardi</AlertDialogCancel>
              <AlertDialogAction onClick={handleInstall}>Installa</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
         <AlertDialog open={isNotificationDialogVisible} onOpenChange={setIsNotificationDialogVisible}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className='flex items-center gap-3 mb-2'>
                        <Bell className='h-6 w-6 text-primary' />
                        <AlertDialogTitle className='text-xl'>Abilita Notifiche</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription>
                        Consenti all'app di inviarti notifiche per rimanere aggiornato su richieste e turni.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setIsNotificationDialogVisible(false)}>Più Tardi</AlertDialogCancel>
                    <AlertDialogAction onClick={handleNotificationRequest}>Abilita</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </>
  );
}
