'use client';

import { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { RefreshCw, AlertTriangle } from 'lucide-react';

// Questa versione deve essere incrementata ad ogni build importante che richiede un refresh forzato
const CURRENT_APP_VERSION = 1715010000; 

export function UpdateNotifier() {
    const firestore = useFirestore();
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!firestore) return;

        // Ascolta il documento di configurazione globale
        const unsub = onSnapshot(doc(firestore, 'system', 'config'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const minVersion = data.minVersion || 0;
                
                // Se la versione minima richiesta è maggiore della versione attuale dell'app
                if (minVersion > CURRENT_APP_VERSION) {
                    setMessage(data.updateMessage || "È disponibile un nuovo aggiornamento importante. L'applicazione deve essere riavviata per continuare.");
                    setUpdateAvailable(true);
                } else {
                    setUpdateAvailable(false);
                }
            }
        });

        return () => unsub();
    }, [firestore]);

    const handleUpdate = () => {
        // Pulisce la cache e ricarica
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (const registration of registrations) {
                    registration.update();
                }
            });
        }
        window.location.reload();
    };

    return (
        <AlertDialog open={updateAvailable}>
            <AlertDialogContent className="max-w-[90vw] sm:max-w-[400px] border-primary/20 bg-card">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-3 text-xl">
                        <div className="p-2 bg-primary/10 rounded-full">
                            <RefreshCw className="h-6 w-6 text-primary animate-spin-slow" />
                        </div>
                        Aggiornamento App
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-base py-4 text-foreground/80 leading-relaxed">
                        {message}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction 
                        onClick={handleUpdate} 
                        className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
                    >
                        Aggiorna e Riavvia
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
