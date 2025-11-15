'use client';

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, FirestorePermissionError, errorEmitter } from "@/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";


interface ChangeCodeDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    userId: string | null;
}

export function ChangeCodeDialog({ isOpen, onOpenChange, userId }: ChangeCodeDialogProps) {
    const { toast } = useToast();
    const [username, setUsername] = React.useState("");
    const [currentPassword, setCurrentPassword] = React.useState("");
    const [newPassword, setNewPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const firestore = useFirestore();

    React.useEffect(() => {
        if (isOpen && userId && firestore) {
            const fetchUser = async () => {
                const userDocRef = doc(firestore, 'app-users', userId);
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    setUsername(docSnap.data().username);
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
        
        if (newPassword && newPassword !== confirmPassword) {
            toast({ variant: "destructive", title: "Errore", description: "I nuovi codici non corrispondono." });
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
            
            // Allow changing username without password check, but changing password requires the current one
            const updates: { username?: string, password?: string } = {};

            if (username && username !== userData.username) {
                updates.username = username;
            }
            
            if (newPassword) {
                if (userData.password !== currentPassword) {
                    toast({ variant: "destructive", title: "Errore", description: "Il codice attuale non è corretto." });
                    return;
                }
                updates.password = newPassword;
            }
            

            if (Object.keys(updates).length > 0) {
                 await updateDoc(userDocRef, updates);
                 // Update local storage for immediate UI feedback
                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                const updatedUser = { ...storedUser, username: username };
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
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
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
                        Modifica il tuo nome utente o imposta un nuovo codice di accesso.
                    </DialogDescription>
                </DialogHeader>
                <form id="change-settings-form" onSubmit={handleSettingsChange} className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="username" className="text-left sm:text-right">Nome Utente</Label>
                        <Input 
                            id="username" 
                            name="username" 
                            type="text" 
                            className="col-span-1 sm:col-span-3"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required 
                        />
                    </div>
                     <hr className="my-2"/>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="current-password" className="text-left sm:text-right">Codice Attuale</Label>
                        <Input 
                            id="current-password" 
                            name="current-password" 
                            type="password" 
                            className="col-span-1 sm:col-span-3"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="new-password" className="text-left sm:text-right">Nuovo Codice</Label>
                        <Input 
                            id="new-password" 
                            name="new-password" 
                            type="password" 
                            className="col-span-1 sm:col-span-3"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="confirm-password" className="text-left sm:text-right">Conferma Codice</Label>
                        <Input 
                            id="confirm-password" 
                            name="confirm-password" 
                            type="password" 
                            className="col-span-1 sm:col-span-3"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
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

    