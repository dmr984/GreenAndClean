'use client';

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, FirestorePermissionError, errorEmitter } from "@/firebase";
import { doc, getDoc, updateDoc, query, where, collection, getDocs } from "firebase/firestore";


interface ChangeCodeDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    userId: string | null;
}

export function ChangeCodeDialog({ isOpen, onOpenChange, userId }: ChangeCodeDialogProps) {
    const { toast } = useToast();
    const [operatorCode, setOperatorCode] = React.useState("");
    const firestore = useFirestore();

    React.useEffect(() => {
        if (isOpen && userId && firestore) {
            const fetchUser = async () => {
                const userDocRef = doc(firestore, 'app-users', userId);
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    setOperatorCode(docSnap.data().username);
                }
            };
            fetchUser();
        }
    }, [isOpen, userId, firestore]);


    const handleSettingsChange = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!userId || !firestore) {
             toast({ variant: "destructive", title: "Errore", description: "Utente o database non trovato." });
             return;
        }

        try {
            const userDocRef = doc(firestore, 'app-users', userId);
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                 toast({ variant: "destructive", title: "Errore", description: "Utente non trovato." });
                 return;
            }

            const userData = userDoc.data();
            const updates: { username?: string } = {};

            if (operatorCode && operatorCode !== userData.username) {
                // Check if new operator code is unique
                const usersRef = collection(firestore, 'app-users');
                const q = query(usersRef, where("username", "==", operatorCode.trim()));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    toast({ variant: "destructive", title: "Codice Esistente", description: "Questo codice operatore è già in uso." });
                    return;
                }

                updates.username = operatorCode;
            }
            

            if (Object.keys(updates).length > 0) {
                 await updateDoc(userDocRef, updates);
                 // Update local storage for immediate UI feedback
                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                const updatedUser = { ...storedUser, username: operatorCode };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                window.dispatchEvent(new Event('storage')); // Trigger re-renders
                 toast({ title: "Profilo Aggiornato", description: "Le tue impostazioni sono state salvate." });
            }

            resetAndClose();

        } catch (error: any) {
             console.error("Error updating profile:", error);
             toast({ 
                variant: "destructive", 
                title: "Errore", 
                description: "Si è verificato un errore durante il salvataggio."
            });
        }
    }
    
    const resetAndClose = () => {
        onOpenChange(false);
    }
    
    const handleOpenChange = (open: boolean) => {
        if(!open) {
            resetAndClose();
        }
        onOpenChange(open);
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Impostazioni Profilo</DialogTitle>
                    <DialogDescription>
                        Modifica il tuo codice operatore di accesso.
                    </DialogDescription>
                </DialogHeader>
                <form id="change-settings-form" onSubmit={handleSettingsChange} className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="username" className="text-left sm:text-right">Codice Operatore</Label>
                        <Input 
                            id="username" 
                            name="username" 
                            type="text" 
                            className="col-span-1 sm:col-span-3"
                            value={operatorCode}
                            onChange={(e) => setOperatorCode(e.target.value)}
                            required 
                        />
                    </div>
                </form>
                <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Annulla</Button>
                    <Button type="submit" form="change-settings-form">Salva Modifiche</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
