'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Pencil } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, deleteDoc, updateDoc } from 'firebase/firestore';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';

type LeaveRequest = { id: string; operatorId: string; user: string; type: string; from: string; to: string; timeFrom?: string; timeTo?: string; status: 'In attesa' | 'Approvata' | 'Rifiutata'; reason?: string };

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case "Approvata": return "default";
        case "In attesa": return "secondary";
        case "Rifiutata": return "destructive";
        default: return "secondary";
    }
};

export default function UserLeavesPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.userId as string;
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [userName, setUserName] = useState<string | null>(null);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<LeaveRequest>>({});


    useEffect(() => {
        if (!userId || !firestore) return;
        setLoading(true);
        
        const userDocRef = doc(firestore, 'app-users', userId);
        getDoc(userDocRef).then(userDoc => {
            if (userDoc.exists()) {
                setUserName(userDoc.data().username);
            } else {
                setUserName(null);
            }
        }).catch(error => {
            console.error("Error fetching user data:", error);
            setUserName(null);
        });

        const q = query(collection(firestore, 'leave-requests'), where('operatorId', '==', userId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setLeaveRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest)).sort((a,b) => new Date(b.from).getTime() - new Date(a.from).getTime()));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching leave requests:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, firestore]);

    const openDeleteConfirmation = (request: LeaveRequest) => {
        setSelectedRequest(request);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteRequest = async () => {
        if (!selectedRequest || !firestore) return;
        
        try {
            await deleteDoc(doc(firestore, 'leave-requests', selectedRequest.id));
            toast({ title: "Richiesta eliminata", variant: "destructive"});
        } catch (error) {
             toast({ title: "Errore", description: "Impossibile eliminare la richiesta.", variant: "destructive"});
        } finally {
            setIsDeleteDialogOpen(false);
            setSelectedRequest(null);
        }
    };

    const openEditDialog = (request: LeaveRequest) => {
        setSelectedRequest(request);
        setEditDraft({ ...request });
        setIsEditDialogOpen(true);
    }
    
    const handleEditDraftChange = (field: keyof LeaveRequest, value: string) => {
        setEditDraft(prev => ({ ...prev, [field]: value }));
    };

    const handleEditRequestSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedRequest || !editDraft || !firestore) return;

        if (!editDraft.type || !editDraft.from || !editDraft.to) {
            toast({ title: "Campi mancanti", variant: "destructive" });
            return;
        }
        
        const updatedData: Partial<LeaveRequest> = {
            ...editDraft,
            status: 'In attesa',
            timeFrom: editDraft.type === 'Permesso' ? editDraft.timeFrom : undefined,
            timeTo: editDraft.type === 'Permesso' ? editDraft.timeTo : undefined,
        };

        try {
            await updateDoc(doc(firestore, 'leave-requests', selectedRequest.id), updatedData);
            toast({ title: "Richiesta Modificata" });
        } catch (error) {
             toast({ title: "Errore", description: "Impossibile modificare la richiesta.", variant: "destructive"});
        } finally {
            setIsEditDialogOpen(false);
            setSelectedRequest(null);
        }
    };


    if (loading) {
        return (
            <div className="p-4 md:p-6 space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    if (!userName) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <h2 className="text-2xl font-bold mb-4">Utente non trovato</h2>
            <Button onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
            </Button>
          </div>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-6">
                <h2 className="text-3xl font-bold tracking-tight">Storico Ferie e Permessi di {userName}</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Riepilogo Richieste</CardTitle>
                        <CardDescription>Visualizza e gestisci tutte le richieste di ferie e permessi.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {leaveRequests.length > 0 ? (
                            <>
                                {/* Mobile View - Cards */}
                                <div className="md:hidden space-y-4">
                                    {leaveRequests.map(req => {
                                        const fromDate = new Date(req.from).toLocaleDateString('it-IT');
                                        const toDate = new Date(req.to).toLocaleDateString('it-IT');
                                        let period = fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;
                                        if (req.type === 'Permesso' && req.timeFrom && req.timeTo) {
                                            period += ` (${req.timeFrom}-${req.timeTo})`;
                                        }
                                        return (
                                            <Card key={req.id} className="w-full">
                                                <CardHeader className="flex flex-row justify-between items-start pb-2">
                                                    <CardTitle className="text-base">{req.type}</CardTitle>
                                                    <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                                                </CardHeader>
                                                <CardContent className="space-y-1 text-sm pb-2">
                                                    <p><span className="font-medium">Periodo:</span> {period}</p>
                                                    <p><span className="font-medium">Motivo:</span> {req.reason || '-'}</p>
                                                </CardContent>
                                                <CardFooter className="pb-3 pt-1 flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(req)}>
                                                        <Pencil className="h-4 w-4" />
                                                        <span className="sr-only">Modifica</span>
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => openDeleteConfirmation(req)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                        <span className="sr-only">Elimina</span>
                                                    </Button>
                                                </CardFooter>
                                            </Card>
                                        );
                                    })}
                                </div>
                                {/* Desktop View - Table */}
                                <div className="hidden md:block">
                                    <ScrollArea className="h-[calc(100vh-22rem)]">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Periodo</th>
                                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
                                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Motivo</th>
                                                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Stato</th>
                                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Azioni</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {leaveRequests.map(req => {
                                                    const fromDate = new Date(req.from).toLocaleDateString('it-IT');
                                                    const toDate = new Date(req.to).toLocaleDateString('it-IT');
                                                    let period = fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;
                                                    if (req.type === 'Permesso' && req.timeFrom && req.timeTo) {
                                                        period += ` (${req.timeFrom}-${req.timeTo})`;
                                                    }
                                                    return (
                                                        <tr key={req.id} className="border-b">
                                                            <td className="p-4 align-middle font-medium">{period}</td>
                                                            <td className="p-4 align-middle">{req.type}</td>
                                                            <td className="p-4 align-middle text-muted-foreground truncate max-w-xs">{req.reason || '-'}</td>
                                                            <td className="p-4 align-middle text-center"><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></td>
                                                            <td className="p-4 align-middle text-right space-x-1">
                                                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(req)}>
                                                                    <Pencil className="h-4 w-4" />
                                                                    <span className="sr-only">Modifica</span>
                                                                </Button>
                                                                <Button variant="ghost" size="icon" onClick={() => openDeleteConfirmation(req)}>
                                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                                    <span className="sr-only">Elimina</span>
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </ScrollArea>
                                </div>
                            </>
                        ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di ferie o permesso trovata.</p>}
                    </CardContent>
                </Card>
            </div>
            
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione non può essere annullata. La richiesta verrà eliminata in modo permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSelectedRequest(null)}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteRequest}>Conferma Eliminazione</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifica Richiesta</DialogTitle>
                        <DialogDescription>
                        Aggiorna i dettagli della richiesta. Lo stato tornerà "In attesa".
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
        </>
    );
}
