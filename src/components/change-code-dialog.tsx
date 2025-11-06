"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: string;
  name: string;
  code: string;
  role: string;
  location: string;
};

// Function to get users from localStorage
const getUsersFromStorage = (): User[] => {
  if (typeof window === 'undefined') return [];
  const storedUsers = localStorage.getItem('app-users');
  return storedUsers ? JSON.parse(storedUsers) : [];
};

// Function to save users to localStorage
const saveUsersToStorage = (users: User[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('app-users', JSON.stringify(users));
  window.dispatchEvent(new Event('storage'));
};

const adminUser: User = { id: "admin", name: "Amministratore", code: "070380", role: "admin", location: "Sede" };

interface ChangeCodeDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    userId: string | null;
}

export function ChangeCodeDialog({ isOpen, onOpenChange, userId }: ChangeCodeDialogProps) {
    const { toast } = useToast();
    const [newCode, setNewCode] = React.useState("");
    const [confirmCode, setConfirmCode] = React.useState("");

    const handleCodeChange = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (newCode !== confirmCode) {
            toast({
                variant: "destructive",
                title: "Errore",
                description: "I codici non corrispondono. Riprova."
            });
            return;
        }

        if (!userId) {
             toast({ variant: "destructive", title: "Errore", description: "Utente non trovato." });
             return;
        }

        if(userId === 'admin') {
            // Admin is not in app-users, so handle separately if needed, but for this app it's not stored.
            // For this implementation, we will assume we can't change admin code this way as it's hardcoded.
            // A real app would have a backend.
            toast({ title: "Info", description: "La modifica del codice admin non è supportata in questa demo."});
            onOpenChange(false);
            return;
        }

        const users = getUsersFromStorage();
        const userIndex = users.findIndex(u => u.id === userId);

        if (userIndex === -1) {
             toast({ variant: "destructive", title: "Errore", description: "Impossibile aggiornare il codice." });
             return;
        }
        
        const updatedUsers = [...users];
        updatedUsers[userIndex].code = newCode;
        saveUsersToStorage(updatedUsers);

        toast({
            title: "Codice Aggiornato",
            description: "Il tuo codice di accesso è stato modificato con successo."
        });
        
        setNewCode("");
        setConfirmCode("");
        onOpenChange(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Cambia Codice di Accesso</DialogTitle>
                    <DialogDescription>
                        Inserisci un nuovo codice di accesso e confermalo.
                    </DialogDescription>
                </DialogHeader>
                <form id="change-code-form" onSubmit={handleCodeChange} className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="new-code" className="text-right">Nuovo Codice</Label>
                        <Input 
                            id="new-code" 
                            name="new-code" 
                            type="password" 
                            className="col-span-3"
                            value={newCode}
                            onChange={(e) => setNewCode(e.target.value)}
                            required 
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="confirm-code" className="text-right">Conferma Codice</Label>
                        <Input 
                            id="confirm-code" 
                            name="confirm-code" 
                            type="password" 
                            className="col-span-3"
                            value={confirmCode}
                            onChange={(e) => setConfirmCode(e.target.value)}
                            required 
                        />
                    </div>
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
                    <Button type="submit" form="change-code-form">Salva Modifiche</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
