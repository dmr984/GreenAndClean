"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useAuth, FirestorePermissionError, errorEmitter } from "@/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";


interface ChangeCodeDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    userId: string | null;
}

export function ChangeCodeDialog({ isOpen, onOpenChange, userId }: ChangeCodeDialogProps) {
    const { toast } = useToast();
    const [username, setUsername] = React.useState("");
    const [newPassword, setNewPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const firestore = useFirestore();
    const auth = useAuth();

    React.useEffect(() => {
        if (isOpen && userId) {
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            setUsername(storedUser.username || '');
        }
    }, [isOpen, userId]);


    const handleSettingsChange = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const currentUser = auth?.currentUser;

        if (!currentUser || !userId || !firestore) {
             toast({ variant: "destructive", title: "Errore", description: "Utente o database non trovato." });
             return;
        }
        
        if (newPassword && newPassword !== confirmPassword) {
            toast({ variant: "destructive", title: "Errore", description: "Le nuove password non corrispondono." });
            return;
        }

        try {
            // Update Firestore document (for username)
            const userDocRef = doc(firestore, 'app-users', userId);
            const updates: { username?: string } = {};
            if (username) {
                updates.username = username;
            }

            if (Object.keys(updates).length > 0) {
                 await updateDoc(userDocRef, updates);
                 // Update local storage for immediate UI feedback
                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                const updatedUser = { ...storedUser, username: username };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                window.dispatchEvent(new Event('storage')); // Trigger re-renders
            }

            // Update password in Firebase Auth
            if (newPassword) {
                await updatePassword(currentUser, newPassword);
            }

            toast({ title: "Profilo Aggiornato", description: "Le tue impostazioni sono state salvate." });
            resetAndClose();

        } catch (error: any) {
             console.error("Error updating profile:", error);
             if (error.code === 'auth/requires-recent-login') {
                  toast({ 
                        variant: "destructive", 
                        title: "Sessione Scaduta", 
                        description: "Per favore, effettua nuovamente il login per modificare la password."
                    });
             } else {
                 toast({ 
                    variant: "destructive", 
                    title: "Errore", 
                    description: "Si è verificato un errore durante il salvataggio."
                });
             }
        }
    }
    
    const resetAndClose = () => {
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
                        Modifica il tuo nome utente o imposta una nuova password. Lascia i campi password vuoti per non modificarla.
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
                        <Label htmlFor="new-password" className="text-left sm:text-right">Nuova Password</Label>
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
                        <Label htmlFor="confirm-password" className="text-left sm:text-right">Conferma Password</Label>
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
