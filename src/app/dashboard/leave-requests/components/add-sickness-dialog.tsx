
'use client';

import * as React from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeaveRequest } from '../page';
import { getFromStorage, saveToStorage } from '../page';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot } from 'firebase/firestore';


type AppUser = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

interface AddSicknessDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onSicknessAdded: () => void;
}

export function AddSicknessDialog({ isOpen, onOpenChange, onSicknessAdded }: AddSicknessDialogProps) {
    const { toast } = useToast();
    const firestore = useFirestore();

    const [operators, setOperators] = React.useState<AppUser[]>([]);
    const [selectedOperator, setSelectedOperator] = React.useState('');
    const [fromDate, setFromDate] = React.useState('');
    const [toDate, setToDate] = React.useState('');
    
    React.useEffect(() => {
        if (!firestore) return;
        const usersCollection = collection(firestore, 'app-users');
        const unsubscribe = onSnapshot(usersCollection, (snapshot) => {
            const userList = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as AppUser))
                .filter(user => user.role === 'operator');
            setOperators(userList);
        });
        return () => unsubscribe();
    }, [firestore]);


    const handleAddSickness = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (!selectedOperator || !fromDate || !toDate) {
            toast({ title: "Campi mancanti", description: "Seleziona un operatore e le date.", variant: "destructive" });
            return;
        }

        const operatorName = operators.find(op => op.id === selectedOperator)?.username;
        if(!operatorName) {
            toast({ title: "Operatore non valido", variant: "destructive" });
            return;
        }

        const newSicknessRequest: LeaveRequest = {
            id: `LR${Date.now()}`,
            user: operatorName,
            type: 'Malattia',
            from: fromDate,
            to: toDate,
            reason: 'Inserito da admin',
            status: 'Approvata'
        };
        
        const existingRequests = getFromStorage<LeaveRequest[]>('leave-requests', []);
        saveToStorage('leave-requests', [newSicknessRequest, ...existingRequests]);
        
        toast({ title: "Malattia Registrata", description: `Periodo di malattia aggiunto per ${operatorName}.` });
        onSicknessAdded();
        resetAndClose();
    };
    
    const resetAndClose = () => {
        setSelectedOperator('');
        setFromDate('');
        setToDate('');
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
                    <DialogTitle>Aggiungi Periodo di Malattia</DialogTitle>
                    <DialogDescription>
                       Seleziona un operatore e inserisci le date di inizio e fine del periodo di malattia. Verrà creato e approvato automaticamente.
                    </DialogDescription>
                </DialogHeader>
                 <form id="sickness-form" onSubmit={handleAddSickness} className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="operator" className="text-left sm:text-right">Operatore</Label>
                        <Select onValueChange={setSelectedOperator} value={selectedOperator} required>
                            <SelectTrigger id="operator" className="col-span-1 sm:col-span-3">
                                <SelectValue placeholder="Seleziona un operatore..." />
                            </SelectTrigger>
                            <SelectContent>
                                {operators.map(user => (
                                <SelectItem key={user.id} value={user.id}>
                                    {user.username}
                                </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="from-date" className="text-left sm:text-right">Dal</Label>
                        <Input id="from-date" name="from-date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="col-span-1 sm:col-span-3" required />
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="to-date" className="text-left sm:text-right">Al</Label>
                        <Input id="to-date" name="to-date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="col-span-1 sm:col-span-3" required />
                    </div>
                 </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Annulla</Button>
                    <Button type="submit" form="sickness-form">Aggiungi Malattia</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

