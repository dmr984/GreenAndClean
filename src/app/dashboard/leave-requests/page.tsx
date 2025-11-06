"use client";

import * as React from "react";
import { MoreHorizontal, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";


// ==================================
// SHARED TYPES & UTILS
// ==================================

type LeaveRequest = { 
  id: string; 
  user: string;
  type: string; 
  from: string; 
  to: string; 
  status: 'In attesa' | 'Approvata' | 'Rifiutata'; 
  reason: string; 
  adminNotes?: string; 
};

// Generic function to get data from localStorage
const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    console.error(`Failed to parse ${key} from storage`, e);
    return defaultValue;
  }
};

// Generic function to save data to localStorage
const saveToStorage = <T,>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('storage')); 
};


// ==================================
// MAIN PAGE COMPONENT
// ==================================

export default function LeaveRequestsPage() {
    const [requests, setRequests] = React.useState<LeaveRequest[]>([]);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = React.useState(false);
    const [selectedRequest, setSelectedRequest] = React.useState<LeaveRequest | null>(null);
    const [rejectionReason, setRejectionReason] = React.useState("");
    const { toast } = useToast();
    const [userRole, setUserRole] = React.useState<string|null>(null);

    // Draft state for new request with auto-saving
    const [draft, setDraft] = React.useState<Partial<LeaveRequest>>({});

    React.useEffect(() => {
        setRequests(getFromStorage<LeaveRequest[]>('leave-requests', []));
        setUserRole(localStorage.getItem('userRole'));

        // Load draft from storage only for operators
        if (localStorage.getItem('userRole') === 'operator') {
            const savedDraft = getFromStorage<Partial<LeaveRequest>>('leave-request-draft', {});
            setDraft(savedDraft);
        }
    }, []);

    // Auto-save draft to localStorage whenever it changes (for operators)
    React.useEffect(() => {
        if(userRole === 'operator') {
            saveToStorage('leave-request-draft', draft);
        }
    }, [draft, userRole]);

    const updateAllRequests = (updatedRequests: LeaveRequest[]) => {
        setRequests(updatedRequests);
        saveToStorage('leave-requests', updatedRequests);
    };

    const handleDraftChange = (field: keyof LeaveRequest, value: string) => {
        setDraft(prev => ({ ...prev, [field]: value }));
    };

    const handleNewRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (!draft.type || !draft.from || !draft.to) {
            toast({ title: "Campi mancanti", description: "Per favore compila tutti i campi richiesti.", variant: "destructive" });
            return;
        }

        const newRequest: LeaveRequest = {
            id: `LR${Date.now()}`,
            user: localStorage.getItem('userName') || 'Operatore',
            type: draft.type,
            from: draft.from,
            to: draft.to,
            reason: draft.reason || '',
            status: 'In attesa'
        };
        
        updateAllRequests([newRequest, ...requests]);
        toast({ title: "Richiesta Inviata", description: "La tua richiesta è stata inviata per l'approvazione." });
        setDraft({}); // Clear draft
    }
  
    const handleApprove = (id: string) => {
        const updated = requests.map(r => r.id === id ? { ...r, status: "Approvata" as const } : r);
        updateAllRequests(updated);
        toast({ title: "Richiesta Approvata", variant: "default" });
    }

    const handleRejectSubmit = () => {
        if (!selectedRequest) return;
        const updated = requests.map(r => r.id === selectedRequest.id ? { ...r, status: "Rifiutata" as const, adminNotes: rejectionReason } : r);
        updateAllRequests(updated);
        toast({ title: "Richiesta Rifiutata", variant: "destructive" });
        setIsRejectDialogOpen(false);
        setSelectedRequest(null);
        setRejectionReason("");
    }

    const openRejectDialog = (request: LeaveRequest) => {
        setSelectedRequest(request);
        setIsRejectDialogOpen(true);
    }

    const getStatusVariant = (status: LeaveRequest['status']): "default" | "secondary" | "destructive" => {
        switch (status) {
            case "Approvata": return "default";
            case "In attesa": return "secondary";
            case "Rifiutata": return "destructive";
            default: return "secondary";
        }
    }

    const isAdmin = userRole === 'admin';
    const userRequests = isAdmin ? requests : requests.filter(r => r.user === localStorage.getItem('userName'));

    return (
        <div className="flex flex-col gap-8">
             <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">
                    {isAdmin ? "Gestione Richieste Ferie/Permessi" : "Le Tue Richieste di Ferie/Permessi"}
                </h2>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>{isAdmin ? "Richieste in Attesa e Storico" : "Crea e visualizza le tue richieste"}</CardTitle>
                    <CardDescription>
                        {isAdmin ? "Gestisci le richieste di ferie e permessi degli operatori." : "Crea e visualizza lo storico delle tue richieste di assenza."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    {!isAdmin && (
                        <form onSubmit={handleNewRequestSubmit} className="p-4 border rounded-lg space-y-4">
                            <h3 className="text-lg font-semibold">Crea Nuova Richiesta</h3>
                            <div className="grid sm:grid-cols-3 gap-4">
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
                            <Textarea name="reason" placeholder="Opzionale: fornisci un motivo per la richiesta." value={draft.reason || ""} onChange={(e) => handleDraftChange('reason', e.target.value)} />
                            <Button type="submit" className="w-full sm:w-auto">Invia Richiesta</Button>
                        </form>
                    )}

                    <div className="overflow-x-auto">
                        <h3 className="text-lg font-semibold mb-2">Storico Richieste</h3>
                        {userRequests.length === 0 ? (
                            <div className="text-center text-muted-foreground py-12">
                                <p>Non ci sono richieste da mostrare.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {isAdmin && <TableHead>Operatore</TableHead>}
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Periodo</TableHead>
                                        <TableHead className="hidden md:table-cell">Motivo</TableHead>
                                        <TableHead>Stato</TableHead>
                                        {isAdmin && <TableHead className="text-right">Azioni</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {userRequests.map((req) => (
                                        <TableRow key={req.id}>
                                            {isAdmin && <TableCell className="font-medium">{req.user}</TableCell>}
                                            <TableCell>{req.type}</TableCell>
                                            <TableCell className="whitespace-nowrap">{new Date(req.from).toLocaleDateString()} - {new Date(req.to).toLocaleDateString()}</TableCell>
                                            <TableCell className="hidden md:table-cell max-w-[200px] truncate">{req.reason || "-"}</TableCell>
                                            <TableCell><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button aria-haspopup="true" size="icon" variant="ghost" disabled={req.status !== 'In attesa'}>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                                <span className="sr-only">Apri menu</span>
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Azioni Admin</DropdownMenuLabel>
                                                            <DropdownMenuItem onSelect={() => handleApprove(req.id)}><Check className="mr-2 h-4 w-4" />Approva</DropdownMenuItem>
                                                            <DropdownMenuItem onSelect={() => openRejectDialog(req)} className="text-destructive"><X className="mr-2 h-4 w-4" />Rifiuta</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>

                    <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Motivo del Rifiuto</AlertDialogTitle>
                                <AlertDialogDescription>Si prega di fornire un motivo per il rifiuto. Sarà visibile all'operatore.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <Textarea placeholder="Es. Esigenze operative critiche..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => { setSelectedRequest(null); setRejectionReason(""); }}>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={handleRejectSubmit}>Conferma Rifiuto</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>
        </div>
    );
};
