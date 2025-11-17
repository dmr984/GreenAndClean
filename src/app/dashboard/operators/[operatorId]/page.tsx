'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction, deleteDoc, writeBatch } from 'firebase/firestore';
import { Loader2, User, ClipboardList, PackageSearch, ListChecks, Calendar, CheckCircle, XCircle, MapPin, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Trash2, Eye, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter, ResponsiveDialogClose } from '@/components/ui/responsive-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, differenceInDays, parse, set } from 'date-fns';
import { it } from 'date-fns/locale';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';


type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata';
    latitude: number;
    longitude: number;
};

type Shift = {
    events: Timbratura[];
    status: 'in_sospeso' | 'in_corso' | 'confermato';
};


type Request = {
    id: string; // Document ID of the request
    userId: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'in_attesa' | 'approvato' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    reason?: string;
    createdAt: Timestamp;
};

type SupplyRequest = {
    id: string;
    userId: string;
    username: string;
    productId: string;
    productName: string;
    requestedQuantity: number;
    approvedQuantity?: number;
    status: 'in_attesa' | 'approvata' | 'rifiutata';
    createdAt: any;
};

type DetailView = {
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    title: string;
    items: Request[];
} | null;

const ShiftApproval = ({ operatorId }: { operatorId: string }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Dialog states
    const [detailShift, setDetailShift] = useState<Shift | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    
    const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    
    const [editingTimbratura, setEditingTimbratura] = useState<Timbratura | null>(null);
    const [newTime, setNewTime] = useState('');
    const [newType, setNewType] = useState<'entrata' | 'pausa' | 'fine_pausa' | 'uscita'>('entrata');
    const [isEditTimbraturaDialogOpen, setIsEditTimbraturaDialogOpen] = useState(false);

    const [deletingTimbratura, setDeletingTimbratura] = useState<Timbratura | null>(null);
    const [isDeleteTimbraturaDialogOpen, setIsDeleteTimbraturaDialogOpen] = useState(false);

    useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, `app-users/${operatorId}/timbrature`), orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, snapshot => {
            const allClockings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));

            const groupedShifts: Shift[] = [];
            let currentShiftEvents: Timbratura[] = [];

            for (const event of allClockings) {
                if (event.type === 'entrata' && currentShiftEvents.length > 0) {
                    const hasPending = currentShiftEvents.some(e => e.status === 'sospesa');
                    const isComplete = currentShiftEvents.some(e => e.type === 'uscita');
                    groupedShifts.push({
                        events: currentShiftEvents,
                        status: !isComplete ? 'in_corso' : hasPending ? 'in_sospeso' : 'confermato',
                    });
                    currentShiftEvents = [event];
                } else {
                    currentShiftEvents.push(event);
                    if (event.type === 'uscita') {
                         const hasPending = currentShiftEvents.some(e => e.status === 'sospesa');
                        groupedShifts.push({
                            events: currentShiftEvents,
                            status: hasPending ? 'in_sospeso' : 'confermato',
                        });
                        currentShiftEvents = [];
                    }
                }
            }

            if (currentShiftEvents.length > 0) {
                 const hasPending = currentShiftEvents.some(e => e.status === 'sospesa');
                 const isComplete = currentShiftEvents.some(e => e.type === 'uscita');
                 groupedShifts.push({
                    events: currentShiftEvents,
                    status: !isComplete ? 'in_corso' : hasPending ? 'in_sospeso' : 'confermato',
                });
            }
            
            setShifts(groupedShifts.reverse());
            setIsLoading(false);
        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le timbrature.', variant: 'destructive' });
            setIsLoading(false);
        });
        return unsubscribe;
    }, [firestore, operatorId, toast]);

    const handleApproveShift = async (shiftToApprove: Shift) => {
        if (!firestore) return;
        const batch = writeBatch(firestore);
        shiftToApprove.events.forEach(event => {
            if (event.status === 'sospesa') {
                const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, event.id);
                batch.update(docRef, { status: 'confermata' });
            }
        });
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno approvato.' });
            setIsDetailOpen(false);
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile approvare il turno.', variant: 'destructive' });
        });
    };

    const handleDeleteShift = async () => {
        if (!firestore || !shiftToDelete) return;
        const batch = writeBatch(firestore);
        shiftToDelete.events.forEach(event => {
            const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, event.id);
            batch.delete(docRef);
        });
        await batch.commit().then(() => {
            toast({ title: 'Successo', description: 'Turno eliminato.' });
            setIsDetailOpen(false); // Close the detail dialog as well
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile eliminare il turno.', variant: 'destructive' });
        });
        setIsConfirmingDelete(false);
        setShiftToDelete(null);
    };

    const handleOpenEditDialog = (timbratura: Timbratura) => {
        setEditingTimbratura(timbratura);
        setNewTime(format(timbratura.timestamp.toDate(), 'HH:mm:ss'));
        setNewType(timbratura.type);
        setIsEditTimbraturaDialogOpen(true);
    };

    const handleEditTimbratura = async () => {
        if (!firestore || !editingTimbratura) return;

        const originalDate = editingTimbratura.timestamp.toDate();
        const [hours, minutes, seconds] = newTime.split(':').map(Number);
        const newDate = set(originalDate, { hours, minutes, seconds });

        const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, editingTimbratura.id);
        const updatePayload = {
            timestamp: Timestamp.fromDate(newDate),
            type: newType,
        };

        await updateDoc(docRef, updatePayload).then(() => {
            toast({ title: 'Successo', description: 'Timbratura aggiornata.' });
            setIsEditTimbraturaDialogOpen(false);
            setEditingTimbratura(null);
            setIsDetailOpen(false); // Close the main dialog to force a data refresh
        }).catch(err => {
            toast({ title: 'Errore', description: 'Impossibile aggiornare la timbratura.', variant: 'destructive' });
        });
    };
    
    const handleConfirmDeleteTimbratura = async () => {
        if (!firestore || !deletingTimbratura) return;
        const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, deletingTimbratura.id);
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Timbratura eliminata.' });
            setIsDeleteTimbraturaDialogOpen(false);
            setDeletingTimbratura(null);
            setIsDetailOpen(false); // Close main dialog to refresh
        }).catch(err => {
            toast({ title: 'Errore', description: 'Impossibile eliminare la timbratura.', variant: 'destructive' });
        });
    };
    
    const handleOpenDetailDialog = (shift: Shift) => {
        setDetailShift(shift);
        setIsDetailOpen(true);
    }

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    if (shifts.length === 0) return <p className="text-sm text-muted-foreground">Nessun turno trovato.</p>;
    
    const formatTime = (date: Timestamp | undefined) => date ? format(date.toDate(), 'p', { locale: it }) : '--:--';
    const formatDate = (date: Timestamp | undefined) => date ? format(date.toDate(), 'PPP', { locale: it }) : 'N/D';

    return (
        <>
            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data Turno</TableHead>
                            <TableHead>Inizio</TableHead>
                            <TableHead>Fine</TableHead>
                            <TableHead>Stato</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {shifts.map((shift, index) => {
                             const startTime = shift.events[0]?.timestamp;
                             const endTime = shift.events.find(e => e.type === 'uscita')?.timestamp;
                            return (
                                <TableRow key={index}>
                                    <TableCell>{formatDate(startTime)}</TableCell>
                                    <TableCell>{formatTime(startTime)}</TableCell>
                                    <TableCell>{formatTime(endTime)}</TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            shift.status === 'in_sospeso' ? 'default'
                                            : shift.status === 'confermato' ? 'secondary'
                                            : 'outline'
                                        } className={cn(shift.status === 'in_sospeso' && 'bg-yellow-500 text-white')}>
                                          {shift.status.replace('_', ' ')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenDetailDialog(shift)}>
                                            <Eye className="h-5 w-5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Shift Delete Confirmation Dialog */}
            <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà tutte le timbrature di questo turno in modo permanente. L'azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShiftToDelete(null)}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteShift}>
                            Elimina Turno
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
             {/* Edit/View Details Dialog */}
             <ResponsiveDialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <ResponsiveDialogContent className="sm:max-w-3xl">
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Dettaglio Turno</ResponsiveDialogTitle>
                         {detailShift?.events[0]?.timestamp && <ResponsiveDialogDescription>
                           Turno del {formatDate(detailShift.events[0].timestamp)}
                         </ResponsiveDialogDescription>}
                    </ResponsiveDialogHeader>
                    <div className="overflow-x-auto my-4 max-h-96 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="whitespace-nowrap">Orario</TableHead>
                                    <TableHead className="whitespace-nowrap">Evento</TableHead>
                                    <TableHead className="whitespace-nowrap">Stato</TableHead>
                                    <TableHead className="whitespace-nowrap">Posizione</TableHead>
                                    <TableHead className="text-right whitespace-nowrap w-[120px]">Azioni</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detailShift?.events.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell className="whitespace-nowrap">{formatTime(t.timestamp)}</TableCell>
                                        <TableCell className="capitalize whitespace-nowrap">{t.type.replace('_', ' ')}</TableCell>
                                        <TableCell className="whitespace-nowrap"><Badge variant={t.status === 'confermata' ? 'secondary' : 'default'}>{t.status}</Badge></TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <a href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                                <MapPin className="h-4 w-4"/> Mappa
                                            </a>
                                        </TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(t)}><Pencil className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => { setDeletingTimbratura(t); setIsDeleteTimbraturaDialogOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <ResponsiveDialogFooter className="flex-col sm:flex-row sm:justify-end gap-2">
                        <ResponsiveDialogClose asChild>
                           <Button variant="outline">Chiudi</Button>
                        </ResponsiveDialogClose>
                        {detailShift?.status === 'in_sospeso' && (
                            <>
                                <Button variant="destructive" onClick={() => { setShiftToDelete(detailShift); setIsConfirmingDelete(true); }}>
                                    <Trash2 className="mr-2 h-4 w-4"/> Elimina Turno
                                </Button>
                                <Button onClick={() => handleApproveShift(detailShift)}>
                                    <CheckCircle className="mr-2 h-4 w-4" /> Approva Turno
                                </Button>
                            </>
                        )}
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

             {/* Edit Timbratura Dialog */}
            <ResponsiveDialog open={isEditTimbraturaDialogOpen} onOpenChange={setIsEditTimbraturaDialogOpen}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Modifica Timbratura</ResponsiveDialogTitle>
                    </ResponsiveDialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-type" className="text-right">Tipo</Label>
                            <Select value={newType} onValueChange={(value) => setNewType(value as any)}>
                                <SelectTrigger id="edit-type" className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="entrata">Entrata</SelectItem>
                                    <SelectItem value="pausa">Pausa</SelectItem>
                                    <SelectItem value="fine_pausa">Fine Pausa</SelectItem>
                                    <SelectItem value="uscita">Uscita</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-time" className="text-right">Orario (HH:mm:ss)</Label>
                            <Input id="edit-time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="col-span-3" />
                        </div>
                    </div>
                    <ResponsiveDialogFooter>
                        <Button variant="outline" onClick={() => setIsEditTimbraturaDialogOpen(false)}>Annulla</Button>
                        <Button onClick={handleEditTimbratura}>Salva Modifiche</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>

            {/* Delete Single Timbratura Confirmation */}
            <AlertDialog open={isDeleteTimbraturaDialogOpen} onOpenChange={setIsDeleteTimbraturaDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare questa timbratura?</AlertDialogTitle>
                        <AlertDialogDescription>
                            L'azione è permanente e non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingTimbratura(null)}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDeleteTimbratura}>Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};


const LeaveRequests = ({ operatorId }: { operatorId: string }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [itemToDelete, setItemToDelete] = useState<Request | null>(null);

    useEffect(() => {
        if (!firestore) return;
        const q = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            const allRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request));
            const pendingRequests = allRequests.filter(r => r.status === 'in_attesa');
            setRequests(pendingRequests);
            setIsLoading(false);
        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le richieste.', variant: 'destructive' });
            setIsLoading(false);
        });
        return unsubscribe;
    }, [firestore, operatorId, toast]);


    const handleUpdateRequestStatus = (requestId: string, newStatus: 'approvato' | 'rifiutato') => {
        if (!firestore) return;
        const docRef = doc(firestore, `app-users/${operatorId}/requests`, requestId);
        updateDoc(docRef, { status: newStatus }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile aggiornare la richiesta.', variant: 'destructive' });
        });
    };
    
    const handleDelete = async () => {
        if (!firestore || !itemToDelete) return;
        const docRef = doc(firestore, `app-users/${operatorId}/requests`, itemToDelete.id);
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Richiesta eliminata.' });
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile eliminare la richiesta.', variant: 'destructive' });
        });
        setItemToDelete(null);
    };

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    if (requests.length === 0) return <p className="text-sm text-muted-foreground">Nessuna richiesta in attesa.</p>;

    return (
        <>
        <Table>
            <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Dal</TableHead><TableHead>Al</TableHead><TableHead>Ore</TableHead><TableHead className='text-right'>Azioni</TableHead></TableRow></TableHeader>
            <TableBody>
                {requests.map(req => (
                    <TableRow key={req.id}>
                        <TableCell className="capitalize">{req.type.replace('_', ' ')}</TableCell>
                        <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{req.hours || '-'}</TableCell>
                        <TableCell className='text-right'>
                            <div className="flex gap-2 justify-end">
                                <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req.id, 'approvato')}><CheckCircle className="h-5 w-5 text-green-500" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req.id, 'rifiutato')}><XCircle className="h-5 w-5 text-red-500" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setItemToDelete(req)}><Trash2 className="h-5 w-5 text-destructive" /></Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
         <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione eliminerà la richiesta in modo permanente. L'azione non può essere annullata.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
};

const SupplyRequests = ({ operatorId, operatorUsername }: { operatorId: string, operatorUsername: string }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<SupplyRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<SupplyRequest | null>(null);
    const [approvedQuantity, setApprovedQuantity] = useState('');
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<SupplyRequest | null>(null);

     useEffect(() => {
        if (!firestore) return;
        const q = query(
            collection(firestore, 'supply-requests'),
            where('userId', '==', operatorId)
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            const allRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SupplyRequest));
            
            const pendingRequests = allRequests
                .filter(req => req.status === 'in_attesa');

            // Sort client-side
            pendingRequests.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

            setRequests(pendingRequests);
            setIsLoading(false);
        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le richieste di fornitura.', variant: 'destructive' });
            setIsLoading(false);
        });
        return unsubscribe;
    }, [firestore, operatorId, toast]);
    
    const openApproveDialog = (request: SupplyRequest) => {
        setSelectedRequest(request);
        setApprovedQuantity(String(request.requestedQuantity));
        setIsApproveDialogOpen(true);
    };

    const handleApproveRequest = async () => {
        if (!firestore || !selectedRequest) return;
        const finalQuantity = parseInt(approvedQuantity, 10);
        if (isNaN(finalQuantity) || finalQuantity < 0) {
            toast({ title: "Quantità Invalida", variant: "destructive"});
            return;
        }

        const requestRef = doc(firestore, 'supply-requests', selectedRequest.id);
        const productRef = doc(firestore, 'products', selectedRequest.productId);
        const updatePayload = { status: 'approvata' as const, approvedQuantity: finalQuantity };

        try {
            await runTransaction(firestore, async (transaction) => {
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) throw new Error("Prodotto non trovato.");
                const currentStock = productDoc.data().quantity;
                if (currentStock < finalQuantity) throw new Error(`Scorte insufficienti: ${currentStock}.`);
                transaction.update(productRef, { quantity: currentStock - finalQuantity });
                transaction.update(requestRef, updatePayload);
            });
            toast({ title: "Successo", description: "Richiesta approvata e magazzino aggiornato." });
        } catch (error: any) {
             toast({ title: "Errore", description: error.message || "Impossibile approvare la richiesta.", variant: "destructive"});
        } finally {
            setIsApproveDialogOpen(false);
        }
    };
    
    const handleRejectRequest = async (request: SupplyRequest) => {
        if (!firestore) return;
        const requestRef = doc(firestore, 'supply-requests', request.id);
        updateDoc(requestRef, { status: 'rifiutata' as const }).catch(err => toast({ title: 'Errore', description: 'Impossibile rifiutare la richiesta.', variant: 'destructive'}));
    };

    const handleDelete = async () => {
        if (!firestore || !itemToDelete) return;
        const docRef = doc(firestore, `supply-requests`, itemToDelete.id);
        await deleteDoc(docRef).then(() => {
            toast({ title: 'Successo', description: 'Richiesta di fornitura eliminata.' });
        }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile eliminare la richiesta.', variant: 'destructive' });
        });
        setItemToDelete(null);
    };

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    if (requests.length === 0) return <p className="text-sm text-muted-foreground">Nessuna richiesta di fornitura in attesa.</p>;

    return (
        <>
            <Table>
                <TableHeader><TableRow><TableHead>Prodotto</TableHead><TableHead>Qtà Rich.</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Azioni</TableHead></TableRow></TableHeader>
                <TableBody>
                    {requests.map(req => (
                        <TableRow key={req.id}>
                            <TableCell>{req.productName}</TableCell>
                            <TableCell>{req.requestedQuantity}</TableCell>
                            <TableCell>{req.createdAt?.toDate().toLocaleDateString('it-IT')}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" size="icon" onClick={() => openApproveDialog(req)}><CheckCircle className="h-5 w-5 text-green-500" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleRejectRequest(req)}><XCircle className="h-5 w-5 text-red-500" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => setItemToDelete(req)}><Trash2 className="h-5 w-5 text-destructive" /></Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Approva Richiesta</AlertDialogTitle></AlertDialogHeader>
                    <div className="grid gap-4 py-4"><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="approved-quantity" className="text-right">Quantità</Label><Input id="approved-quantity" type="number" value={approvedQuantity} onChange={(e) => setApprovedQuantity(e.target.value)} className="col-span-3"/></div></div>
                    <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleApproveRequest}>Approva</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà la richiesta di fornitura in modo permanente. L'azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

const MonthlySummary = ({ operatorId }: { operatorId: string }) => {
    const firestore = useFirestore();
    const router = useRouter();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [detailView, setDetailView] = useState<DetailView>(null);


    const { startOfMonth, endOfMonth } = useMemo(() => {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
        return { startOfMonth: Timestamp.fromDate(start), endOfMonth: Timestamp.fromDate(end) };
    }, [currentDate]);

    useEffect(() => {
        if (!firestore || !operatorId) return;
        setIsLoading(true);
        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('startDate', '>=', startOfMonth), where('startDate', '<=', endOfMonth));
        const timbratureQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('timestamp', '>=', startOfMonth), where('timestamp', '<=', endOfMonth));
        
        const unsubRequests = onSnapshot(requestsQuery, s => setRequests(s.docs.map(d => ({id: d.id, ...d.data()} as Request))));
        const unsubTimbrature = onSnapshot(timbratureQuery, s => {
            setTimbrature(s.docs.map(d => d.data() as Timbratura));
            setIsLoading(false);
        });

        return () => { unsubRequests(); unsubTimbrature(); };
    }, [firestore, operatorId, startOfMonth, endOfMonth]);

    const summary = useMemo(() => {
        const dailyTimbrature = timbrature.reduce((acc, t) => {
            const day = t.timestamp.toDate().toDateString();
            if (!acc[day]) acc[day] = [];
            acc[day].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);

        let workedDaysCount = 0;
        Object.values(dailyTimbrature).forEach(dayEvents => {
            if (dayEvents.length > 0) workedDaysCount++;
        });

        const approvedRequests = requests.filter(r => r.status === 'approvato');
        return {
            workedDays: workedDaysCount,
            overtimeHours: approvedRequests.filter(r => r.type === 'straordinario').reduce((sum, r) => sum + (r.hours || 0), 0),
            ferieDays: approvedRequests.filter(r => r.type === 'ferie').reduce((sum, r) => sum + differenceInDays(r.endDate.toDate(), r.startDate.toDate()) + 1, 0),
            permessoHours: approvedRequests.filter(r => r.type === 'permesso').reduce((sum, r) => sum + (r.hours || 0), 0),
            malattiaDays: approvedRequests.filter(r => r.type === 'malattia').reduce((sum, r) => sum + differenceInDays(r.endDate.toDate(), r.startDate.toDate()) + 1, 0),
        };
    }, [timbrature, requests]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const handleWorkedDaysClick = () => {
        const month = currentDate.getMonth() + 1;
        const year = currentDate.getFullYear();
        router.push(`/dashboard/daily-summary?month=${month}&year=${year}&operatorId=${operatorId}`);
    };
    
    const handleSummaryCardClick = (type: DetailView['type'], title: string) => {
        if (!type) return;
        const approvedRequests = requests.filter(r => r.status === 'approvato' && r.type === type);
        setDetailView({ type, title, items: approvedRequests });
    };

    const renderDetailTable = () => {
        if (!detailView || detailView.items.length === 0) {
            return <p className="text-center text-muted-foreground py-4">Nessun dato per questo mese.</p>;
        }

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Dal</TableHead>
                        <TableHead>Al</TableHead>
                        {(detailView.type === 'permesso' || detailView.type === 'straordinario') && <TableHead>Ore</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {detailView.items.map(item => (
                         <TableRow key={item.id}>
                            <TableCell>{format(item.startDate.toDate(), 'PPP', { locale: it })}</TableCell>
                            <TableCell>{format(item.endDate.toDate(), 'PPP', { locale: it })}</TableCell>
                            {(detailView.type === 'permesso' || detailView.type === 'straordinario') && <TableCell>{item.hours}</TableCell>}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    };


    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    
    return (
        <>
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                <h4 className="text-lg font-semibold">{format(currentDate, 'MMMM yyyy', { locale: it })}</h4>
                <Button variant="outline" onClick={() => handleMonthChange(1)}>Succ.</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card
                  onClick={handleWorkedDaysClick}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                >
                    <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle><Briefcase className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedDays}</div></CardContent>
                </Card>
                <Card
                  onClick={() => handleSummaryCardClick('straordinario', 'Dettaglio Straordinari')}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Straordinari (ore)</CardTitle><Plus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.overtimeHours}</div></CardContent></Card>
                <Card
                  onClick={() => handleSummaryCardClick('ferie', 'Dettaglio Ferie')}
                  className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle><Plane className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.ferieDays}</div></CardContent></Card>
                <Card
                    onClick={() => handleSummaryCardClick('permesso', 'Dettaglio Permessi')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle><UserCheck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.permessoHours}</div></CardContent></Card>
                <Card
                    onClick={() => handleSummaryCardClick('malattia', 'Dettaglio Malattia')}
                    className="cursor-pointer transition-all hover:bg-muted/50"
                ><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle><Stethoscope className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.malattiaDays}</div></CardContent></Card>
            </div>
        </div>
        <ResponsiveDialog open={!!detailView} onOpenChange={() => setDetailView(null)}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>{detailView?.title}</ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        Riepilogo delle richieste approvate per {format(currentDate, 'MMMM yyyy', { locale: it })}.
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                 <div className="py-4">
                    {renderDetailTable()}
                </div>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
        </>
    );
};

export default function OperatorDetailPage() {
    const params = useParams();
    const operatorId = Array.isArray(params.operatorId) ? params.operatorId[0] : params.operatorId;
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const operatorDocRef = useMemoFirebase(() => {
        if (!firestore || !operatorId) return null;
        return doc(firestore, 'app-users', operatorId);
    }, [firestore, operatorId]);
    
    useEffect(() => {
        if (!operatorDocRef) return;
        getDoc(operatorDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            }
            setIsLoading(false);
        });
    }, [operatorDocRef]);


    if (isLoading || isUserLoading) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground">Accesso Negato.</div>;
    }

    if (!operator) {
        return <div className="text-center text-muted-foreground">Operatore non trovato.</div>;
    }

    const getAvatarFallback = (username: string) => {
        const parts = username.split(' ');
        if (parts.length > 1 && parts[0] && parts[1]) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return username.substring(0, 2).toUpperCase();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-xl">{getAvatarFallback(operator.username)}</AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{operator.username}</h1>
                    <p className="text-muted-foreground">ID Operatore: {operator.id}</p>
                </div>
            </div>

            <Accordion type="multiple" className="w-full space-y-4" defaultValue={['item-1']}>
                 <Card>
                    <AccordionItem value="item-1" className="border-b-0">
                        <AccordionTrigger className="p-6">
                            <div className="flex items-center gap-3">
                                <ListChecks className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Approvazione Turni</h3>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                            <ShiftApproval operatorId={operator.id} />
                        </AccordionContent>
                    </AccordionItem>
                </Card>
                 <Card>
                    <AccordionItem value="item-2" className="border-b-0">
                        <AccordionTrigger className="p-6">
                            <div className="flex items-center gap-3">
                                <ClipboardList className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Gestione Richieste Ferie/Permessi</h3>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                           <LeaveRequests operatorId={operator.id} />
                        </AccordionContent>
                    </AccordionItem>
                </Card>
                 <Card>
                    <AccordionItem value="item-3" className="border-b-0">
                        <AccordionTrigger className="p-6">
                             <div className="flex items-center gap-3">
                                <PackageSearch className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Gestione Richieste Forniture</h3>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                           <SupplyRequests operatorId={operator.id} operatorUsername={operator.username} />
                        </AccordionContent>
                    </AccordionItem>
                </Card>
                 <Card>
                    <AccordionItem value="item-4" className="border-b-0">
                        <AccordionTrigger className="p-6">
                             <div className="flex items-center gap-3">
                                <Calendar className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Riepilogo Mensile</h3>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                           <MonthlySummary operatorId={operator.id}/>
                        </AccordionContent>
                    </AccordionItem>
                </Card>
            </Accordion>
        </div>
    );
}

    
