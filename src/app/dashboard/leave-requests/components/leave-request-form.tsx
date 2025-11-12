'use client';

import * as React from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeaveRequest } from '../page';
import { getFromStorage, saveToStorage } from '../page';

interface LeaveRequestFormProps {
    userName: string;
    onNewRequest: (request: LeaveRequest) => void;
}

export function LeaveRequestForm({ userName, onNewRequest }: LeaveRequestFormProps) {
    const { toast } = useToast();
    const [draft, setDraft] = React.useState<Partial<LeaveRequest>>({});

    React.useEffect(() => {
        const savedDraft = getFromStorage<Partial<LeaveRequest>>('leave-request-draft', {});
        setDraft(savedDraft);
    }, []);

    React.useEffect(() => {
        saveToStorage('leave-request-draft', draft);
    }, [draft]);

    const handleDraftChange = (field: keyof LeaveRequest, value: string) => {
        setDraft(prev => ({ ...prev, [field]: value }));
    };

    const handleNewRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (!draft.type || !draft.from || !draft.to) {
            toast({ title: "Campi mancanti", description: "Per favore compila tutti i campi richiesti.", variant: "destructive" });
            return;
        }

        if (draft.type === 'Permesso' && (!draft.timeFrom || !draft.timeTo)) {
            toast({ title: "Orario mancante", description: "Per i permessi, specifica l'orario di inizio e fine.", variant: "destructive" });
            return;
        }

        const newRequest: LeaveRequest = {
            id: `LR${Date.now()}`,
            user: userName,
            type: draft.type,
            from: draft.from,
            to: draft.to,
            timeFrom: draft.type === 'Permesso' ? draft.timeFrom : undefined,
            timeTo: draft.type === 'Permesso' ? draft.timeTo : undefined,
            reason: draft.reason || '',
            status: 'In attesa'
        };
        
        onNewRequest(newRequest);
        setDraft({}); // Clear draft
    };

    return (
        <form onSubmit={handleNewRequestSubmit} className="p-4 border rounded-lg space-y-4">
            <h3 className="text-lg font-semibold">Crea Nuova Richiesta</h3>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Select name="type" required value={draft.type || ""} onValueChange={(value) => handleDraftChange('type', value)}>
                    <SelectTrigger><SelectValue placeholder="Seleziona tipo" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Ferie">Ferie</SelectItem>
                        <SelectItem value="Malattia">Malattia</SelectItem>
                        <SelectItem value="Permesso">Permesso</SelectItem>
                    </SelectContent>
                </Select>
                <Input name="from-date" type="date" value={draft.from || ""} onChange={(e) => handleDraftChange('from', e.target.value)} required placeholder="Dal"/>
                <Input name="to-date" type="date" value={draft.to || ""} onChange={(e) => handleDraftChange('to', e.target.value)} required placeholder="Al"/>
            </div>
            {draft.type === 'Permesso' && (
                <div className="grid sm:grid-cols-2 gap-4 animate-in fade-in">
                        <Input name="time-from" type="time" value={draft.timeFrom || ""} onChange={(e) => handleDraftChange('timeFrom', e.target.value)} required />
                        <Input name="time-to" type="time" value={draft.timeTo || ""} onChange={(e) => handleDraftChange('timeTo', e.target.value)} required />
                </div>
            )}
            <Textarea name="reason" placeholder="Opzionale: fornisci un motivo per la richiesta." value={draft.reason || ""} onChange={(e) => handleDraftChange('reason', e.target.value)} />
            <Button type="submit" className="w-full sm:w-auto">Invia Richiesta</Button>
        </form>
    );
}
