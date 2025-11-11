"use client";

import * as React from "react";
import { MoreHorizontal, Check, X, Trash2, Edit, Pencil } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";


// ==================================
// SHARED TYPES & UTILS
// ==================================

type LeaveRequest = { 
  id: string; 
  user: string;
  type: string; 
  from: string; 
  to: string; 
  timeFrom?: string;
  timeTo?: string;
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
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
    const [selectedRequest, setSelectedRequest] = React.useState<LeaveRequest | null>(null);
    const [rejectionReason, setRejectionReason] = React.useState("");
    const { toast } = useToast();
    const [userRole, setUserRole] = React.useState<string|null>(null);
    const [userName, setUserName] = React.useState<string|null>(null);


    // Draft state for new request with auto-saving
    const [draft, setDraft] = React.useState<Partial<LeaveRequest>>({});
    const [editDraft, setEditDraft] = React.useState<Partial<LeaveRequest>>({});


    React.useEffect(() => {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        setRequests(getFromStorage<LeaveRequest[]>('leave-requests', []));
        setUserRole(storedUser.role);
        setUserName(storedUser.username);

        // Load draft from storage only for operators
        if (storedUser.role === 'operator') {
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

        if (draft.type === 'Permesso' && (!draft.timeFrom || !draft.timeTo)) {
            toast({ title: "Orario mancante", description: "Per i permessi, specifica l'orario di inizio e fine.", variant: "destructive" });
            return;
        }

        const newRequest: LeaveRequest = {
            id: `LR${Date.now()}`,
            user: userName || 'Operatore',
            type: draft.type,
            from: draft.from,
            to: draft.to,
            timeFrom: draft.type === 'Permesso' ? draft.timeFrom : undefined,
            timeTo: draft.type === 'Permesso' ? draft.timeTo : undefined,
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
    
    const openRejectDialog = (request: LeaveRequest) => {
        setSelectedRequest(request);
        setIsRejectDialogOpen(true);
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

    const openDeleteDialog = (request: LeaveRequest) => {
        setSelectedRequest(request);
        setIsDeleteDialogOpen(true);
    }
    
    const handleDeleteRequest = () => {
        if (!selectedRequest) return;
        const updated = requests.filter(r => r.id !== selectedRequest.id);
        updateAllRequests(updated);
        toast({ title: "Richiesta Eliminata", variant: "destructive"});
        setIsDeleteDialogOpen(false);
        setSelectedRequest(null);
    }

    const openEditDialog = (request: LeaveRequest) => {
        setSelectedRequest(request);
        setEditDraft({ ...request });
        setIsEditDialogOpen(true);
    }

    const handleEditDraftChange = (field: keyof LeaveRequest, value: string) => {
        setEditDraft(prev => ({ ...prev, [field]: value }));
    };

    const handleEditRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedRequest || !editDraft) return;

        if (!editDraft.type || !editDraft.from || !editDraft.to) {
            toast({ title: "Campi mancanti", description: "Per favore compila tutti i campi richiesti.", variant: "destructive" });
            return;
        }

        if (editDraft.type === 'Permesso' && (!editDraft.timeFrom || !editDraft.timeTo)) {
            toast({ title: "Orario mancante", description: "Per i permessi, specifica l'orario di inizio e fine.", variant: "destructive" });
            return;
        }

        const updatedRequest: LeaveRequest = {
            ...selectedRequest,
            ...editDraft,
            timeFrom: editDraft.type === 'Permesso' ? editDraft.timeFrom : undefined,
            timeTo: editDraft.type === 'Permesso' ? editDraft.timeTo : undefined,
        };
        
        const updated = requests.map(r => r.id === selectedRequest.id ? updatedRequest : r);
        updateAllRequests(updated);
        
        toast({ title: "Richiesta Modificata", description: "La tua richiesta è stata aggiornata." });
        setIsEditDialogOpen(false);
        setSelectedRequest(null);
    }


    const getStatusVariant = (status: LeaveRequest['status']): "default" | "secondary" | "destructive" => {
        switch (status) {
            case "Approvata": return "default";
            case "In attesa": return "secondary";
            case "Rifiutata": return "destructive";
            default: return "secondary";
        }
    }
    
    const formatPeriod = (req: LeaveRequest) => {
        const fromDate = new Date(req.from).toLocaleDateString('it-IT');
        const toDate = new Date(req.to).toLocaleDateString('it-IT');
        let period = `${fromDate}`;
        if(fromDate !== toDate) period += ` - ${toDate}`;

        if(req.type === 'Permesso' && req.timeFrom && req.timeTo) {
            period += ` (dalle ${req.timeFrom} alle ${req.timeTo})`;
        }
        return period;
    }

    const isAdmin = userRole === 'admin';
    const userRequests = isAdmin ? requests : requests.filter(r => r.user === userName);

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
                    )}

                    <div className="overflow-x-auto">
                        <h3 className="text-lg font-semibold mb-2">Storico Richieste</h3>
                        {userRequests.length === 0 ? (
                            <div className="text-center text-muted-foreground py-12">
                                <p>Non ci sono richieste da mostrare.</p>
                            </div>
                        ) : (
                           <div className="relative w-full overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {isAdmin && <TableHead>Operatore</TableHead>}
                                            <TableHead>Tipo</TableHead>
                                            <TableHead>Periodo</TableHead>
                                            <TableHead className="hidden md:table-cell">Motivo</TableHead>
                                            <TableHead>Stato</TableHead>
                                            <TableHead className="text-right">Azioni</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {userRequests.map((req) => (
                                            <TableRow key={req.id}>
                                                {isAdmin && <TableCell className="font-medium">{req.user}</TableCell>}
                                                <TableCell>{req.type}</TableCell>
                                                <TableCell className="whitespace-nowrap">{formatPeriod(req)}</TableCell>
                                                <TableCell className="hidden md:table-cell max-w-[200px] truncate">{req.reason || "-"}</TableCell>
                                                <TableCell><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></TableCell>
                                                <TableCell className="text-right">
                                                    {isAdmin ? (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                    <span className="sr-only">Apri menu</span>
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Azioni Admin</DropdownMenuLabel>
                                                                {req.status === 'In attesa' && (
                                                                    <>
                                                                        <DropdownMenuItem onSelect={() => handleApprove(req.id)}><Check className="mr-2 h-4 w-4" />Approva</DropdownMenuItem>
                                                                        <DropdownMenuItem onSelect={() => openRejectDialog(req)}><X className="mr-2 h-4 w-4 text-red-500" />Rifiuta</DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                    </>
                                                                )}
                                                                <DropdownMenuItem onSelect={() => openDeleteDialog(req)} className="text-destructive">
                                                                    <Trash2 className="mr-2 h-4 w-4" />Elimina
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    ) : (
                                                         <div className="flex justify-end gap-1">
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                disabled={req.status !== 'In attesa'}
                                                                onClick={() => openEditDialog(req)}
                                                            >
                                                                <Pencil className="h-4 w-4 text-blue-500"/>
                                                                <span className="sr-only">Modifica richiesta</span>
                                                            </Button>
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                disabled={req.status !== 'In attesa'}
                                                                onClick={() => openDeleteDialog(req)}
                                                            >
                                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                                                <span className="sr-only">Elimina richiesta</span>
                                                            </Button>
                                                         </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                           </div>
                        )}
                    </div>
                    
                    {/* Admin Reject Dialog */}
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

                    {/* Operator/Admin Delete Dialog */}
                    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Vuoi davvero eliminare questa richiesta? L'azione non può essere annullata.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedRequest(null)}>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteRequest}>Conferma Eliminazione</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                     {/* Operator Edit Dialog */}
                    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Modifica Richiesta</DialogTitle>
                                <DialogDescription>
                                Aggiorna i dettagli della tua richiesta di ferie/permesso.
                                </DialogDescription>
                            </DialogHeader>
                            <form id="edit-request-form" onSubmit={handleEditRequestSubmit}>
                                <div className="p-4 space-y-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-type">Tipo</Label>
                                        <Select name="type" required value={editDraft.type || ""} onValueChange={(value) => handleEditDraftChange('type', value)}>
                                            <SelectTrigger id="edit-type"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Ferie">Ferie</SelectItem>
                                                <SelectItem value="Malattia">Malattia</SelectItem>
                                                <SelectItem value="Permesso">Permesso</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="edit-from-date">Dal</Label>
                                            <Input id="edit-from-date" name="from-date" type="date" value={editDraft.from || ""} onChange={(e) => handleEditDraftChange('from', e.target.value)} required />
                                        </div>
                                        <div>
                                            <Label htmlFor="edit-to-date">Al</Label>
                                            <Input id="edit-to-date" name="to-date" type="date" value={editDraft.to || ""} onChange={(e) => handleEditDraftChange('to', e.target.value)} required />
                                        </div>
                                    </div>
                                    {editDraft.type === 'Permesso' && (
                                        <div className="grid grid-cols-2 gap-4 animate-in fade-in">
                                            <div>
                                                <Label htmlFor="edit-time-from">Dalle ore</Label>
                                                <Input id="edit-time-from" name="time-from" type="time" value={editDraft.timeFrom || ""} onChange={(e) => handleEditDraftChange('timeFrom', e.target.value)} required />
                                            </div>
                                            <div>
                                                <Label htmlFor="edit-time-to">Alle ore</Label>
                                                <Input id="edit-time-to" name="time-to" type="time" value={editDraft.timeTo || ""} onChange={(e) => handleEditDraftChange('timeTo', e.target.value)} required />
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <Label htmlFor="edit-reason">Motivo (opzionale)</Label>
                                        <Textarea id="edit-reason" name="reason" placeholder="Fornisci un motivo per la richiesta..." value={editDraft.reason || ""} onChange={(e) => handleEditDraftChange('reason', e.target.value)} />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Annulla</Button>
                                    <Button type="submit">Salva Modifiche</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>
        </div>
    );
};
