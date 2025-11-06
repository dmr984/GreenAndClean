"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
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
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      // Show the alert dialog only if the app is not already installed
      if (window.matchMedia('(display-mode: standalone)').matches) {
          return;
      }
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);
  
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => console.log('Service Worker registered with scope:', registration.scope))
        .catch((error) => console.log('Service Worker registration failed:', error));
    }
  }, []);

  const handleInstall = async () => {
    setIsVisible(false);
    if (!prompt) {
      return;
    }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      toast({
        title: "App Installata!",
        description: "WorkForce Hub è stato aggiunto alla tua schermata principale.",
      });
    }
    setPrompt(null);
  };

  const handleCancel = () => {
    setIsVisible(false);
  }

  return (
      <AlertDialog open={isVisible} onOpenChange={setIsVisible}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className='flex items-center gap-3 mb-2'>
                <Download className='h-6 w-6 text-primary' />
                <AlertDialogTitle className='text-xl'>Installa WorkForce Hub</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Aggiungi questa applicazione alla tua schermata principale per un accesso rapido e per un'esperienza offline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Più Tardi</AlertDialogCancel>
            <AlertDialogAction onClick={handleInstall}>Installa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  );
}
