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
    const [oldCode, setOldCode] = React.useState("");
    const [newCode, setNewCode] = React.useState("");
    const [confirmCode, setConfirmCode] = React.useState("");

    const handleCodeChange = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (newCode !== confirmCode) {
            toast({
                variant: "destructive",
                title: "Errore",
                description: "I nuovi codici non corrispondono. Riprova."
            });
            return;
        }

        if (!userId) {
             toast({ variant: "destructive", title: "Errore", description: "Utente non trovato." });
             return;
        }

        let users: User[] = [];
        
        if (userId === 'admin') {
            // In a real app, admin user data would also be in a DB. 
            // We can't update it in localStorage if it's hardcoded elsewhere.
            // Let's assume we can update it if it's also in the 'app-users' list for consistency
        }
        
        users = getUsersFromStorage();
        const userToUpdate = users.find(u => u.id === userId);
            
        if (!userToUpdate && userId !== 'admin') {
             toast({ variant: "destructive", title: "Errore", description: "Utente non trovato." });
             return;
        }
        
        const effectiveUser = userId === 'admin' ? adminUser : userToUpdate;

        if(effectiveUser!.code !== oldCode) {
            toast({ variant: "destructive", title: "Codice Errato", description: "Il vecchio codice non è corretto." });
            return;
        }
        
        if (userId === 'admin') {
            // This is a demo limitation. A real app would have a backend mechanism for this.
            toast({ title: "Info", description: "La modifica del codice admin non è completamente supportata in questa demo se non è gestito via DB."});
            // Let's proceed assuming we can update a local list for demo consistency
        }

        const updatedUsers = users.map(u => u.id === userId ? { ...u, code: newCode } : u);
        saveUsersToStorage(updatedUsers);


        toast({
            title: "Codice Aggiornato",
            description: "Il tuo codice di accesso è stato modificato con successo."
        });
        
        setOldCode("");
        setNewCode("");
        setConfirmCode("");
        onOpenChange(false);
    }
    
    // Reset state when dialog closes
    const handleOpenChange = (open: boolean) => {
        if(!open) {
            setOldCode("");
            setNewCode("");
            setConfirmCode("");
        }
        onOpenChange(open);
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Cambia Codice di Accesso</DialogTitle>
                    <DialogDescription>
                        Inserisci il tuo codice attuale e poi scegli un nuovo codice.
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