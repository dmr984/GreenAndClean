"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useFirestore } from "@/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";

interface ChangeCodeDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    userId: string | null;
}

export function ChangeCodeDialog({ isOpen, onOpenChange, userId }: ChangeCodeDialogProps) {
    const { toast } = useToast();
    const [oldCode, setOldCode] = React.useState("");
    const [newCode, setNewCode] = React.useState("");
    const [confirmCode, setConfirmCode] = React.useState("");
    const auth = useAuth();
    const firestore = useFirestore();

    const handleCodeChange = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (newCode !== confirmCode) {
            toast({ variant: "destructive", title: "Errore", description: "I nuovi codici non corrispondono. Riprova." });
            return;
        }

        if (!userId || !auth.currentUser) {
             toast({ variant: "destructive", title: "Errore", description: "Utente non trovato o non autenticato." });
             return;
        }

        try {
            // Re-authenticate user
            const credential = EmailAuthProvider.credential(auth.currentUser.email!, oldCode);
            await reauthenticateWithCredential(auth.currentUser, credential);

            // Update password in Auth
            await updatePassword(auth.currentUser, newCode);

            // Update user document in Firestore
            const userDocRef = doc(firestore, 'users', userId);
            await updateDoc(userDocRef, { code: newCode });

            toast({ title: "Codice Aggiornato", description: "Il tuo codice di accesso è stato modificato con successo." });
            
            resetAndClose();

        } catch (error: any) {
            console.error("Error changing code:", error);
             toast({ 
                variant: "destructive", 
                title: "Codice Errato o Errore di Sistema", 
                description: error.code === 'auth/wrong-password' ? "Il vecchio codice non è corretto." : "Si è verificato un errore."
            });
        }
    }
    
    const resetAndClose = () => {
        setOldCode("");
        setNewCode("");
        setConfirmCode("");
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
                    <DialogTitle>Cambia Codice di Accesso</DialogTitle>
                    <DialogDescription>
                        Inserisci il tuo codice attuale e poi scegli un nuovo codice. Questo aggiornerà la tua password di accesso.
                    </DialogDescription>
                </DialogHeader>
                <form id="change-code-form" onSubmit={handleCodeChange} className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="old-code" className="text-left sm:text-right">Vecchio Codice</Label>
                        <Input 
                            id="old-code" 
                            name="old-code" 
                            type="password" 
                            className="col-span-1 sm:col-span-3"
                            value={oldCode}
                            onChange={(e) => setOldCode(e.target.value)}
                            required 
                        />
                    </div>
                     <hr className="my-2"/>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="new-code" className="text-left sm:text-right">Nuovo Codice</Label>
                        <Input 
                            id="new-code" 
                            name="new-code" 
                            type="password" 
                            className="col-span-1 sm:col-span-3"
                            value={newCode}
                            onChange={(e) => setNewCode(e.target.value)}
                            required 
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="confirm-code" className="text-left sm:text-right">Conferma Codice</Label>
                        <Input 
                            id="confirm-code" 
                            name="confirm-code" 
                            type="password" 
                            className="col-span-1 sm:col-span-3"
                            value={confirmCode}
                            onChange={(e) => setConfirmCode(e.target.value)}
                            required 
                        />
                    </div>
                </form>
                <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Annulla</Button>
                    <Button type="submit" form="change-code-form">Salva Modifiche</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}