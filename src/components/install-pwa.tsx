"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Bell, Share, PlusSquare } from 'lucide-react';
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
import Image from 'next/image';

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
  const [isIOS, setIsIOS] = useState(false);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  const { toast } = useToast();

   useEffect(() => {
    // Check if running in standalone mode (PWA)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsPwaInstalled(true);
      return; // Don't show any prompts if already installed
    }
    
    // Detect iOS
    const isIOSDevice = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    if (isIOSDevice) {
       // On iOS, we don't get the 'beforeinstallprompt' event. We just show the dialog.
       const alreadyShown = localStorage.getItem('iosInstallPromptShown');
       if (!alreadyShown) {
         setIsDialogVisible(true);
       }
    } else {
      // For other devices, listen for the event
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      toast({
        title: "App Installata!",
        description: "L'app è stata aggiunta alla tua schermata principale.",
      });
    }
    setInstallPrompt(null);
    setIsDialogVisible(false);
  };
  
  const handleIOSInstructionsClose = () => {
    localStorage.setItem('iosInstallPromptShown', 'true');
    setIsDialogVisible(false);
  };

  const showInstallPrompt = !isPwaInstalled && (installPrompt || isIOS) && isDialogVisible;

  if (!showInstallPrompt) {
      return null;
  }
  
  if (isIOS) {
    return (
        <AlertDialog open={isDialogVisible} onOpenChange={setIsDialogVisible}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className='flex items-center gap-3 mb-2'>
                  <Download className='h-6 w-6 text-primary' />
                  <AlertDialogTitle className='text-xl'>Installa l'App su iPhone</AlertDialogTitle>
              </div>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-foreground/90">
                    <p>Per la migliore esperienza, aggiungi questa app alla tua schermata Home.</p>
                    <div className="flex items-center gap-2">
                        <span>1. Tocca l'icona di condivisione</span>
                        <Share className="h-5 w-5 inline-block" />
                        <span>nel menu del browser.</span>
                    </div>
                     <div className="flex items-center gap-2">
                        <span>2. Scorri e seleziona</span>
                        <PlusSquare className="h-5 w-5 inline-block" />
                        <span className="font-semibold">'Aggiungi a Home'.</span>
                    </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleIOSInstructionsClose}>Ho capito</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    )
  }

  return (
      <AlertDialog open={isDialogVisible} onOpenChange={setIsDialogVisible}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className='flex items-center gap-3 mb-2'>
                <Download className='h-6 w-6 text-primary' />
                <AlertDialogTitle className='text-xl'>Installa l'App</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Aggiungi l'app alla tua schermata principale per un accesso rapido e un'esperienza migliore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDialogVisible(false)}>Più Tardi</AlertDialogCancel>
            <AlertDialogAction onClick={handleInstall}>Installa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  );
}
