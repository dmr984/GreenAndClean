'use client';
import React, { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { Loader2, CheckCircle, XCircle, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter } from '@/components/ui/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useParams } from 'next/navigation';

type Operator = {
    id: string;
    username: string;
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

const EditRequestDialog = ({ request, onSave, onClose }: { request: Request; onSave: (data: Partial<Request>) => void; onClose: () => void; }) => {
    const [type, setType] = useState(request.type);
    const [startDate, setStartDate] = useState(request.startDate.toDate());
    const [endDate, setEndDate] = useState(request.endDate.toDate());
    const [hours, setHours] = useState(request.hours?.toString() || '');
    const [reason, setReason] = useState(request.reason || '');

    const handleSave = () => {
        const editedData: Partial<Request> = {
            type,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(endDate),
            reason
        };
        if(type === 'permesso' || type === 'straordinario') {
            editedData.hours = parseFloat(hours) || 0;
        } else {
            delete editedData.hours;
        }
        onSave(editedData);
    };

    return (
        <ResponsiveDialog open={true} onOpenChange={onClose}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader><ResponsiveDialogTitle>Modifica Richiesta</ResponsiveDialogTitle></ResponsiveDialogHeader>
                <div className="space-y-4 py-4">
                     <div><Label>Tipo</Label><Select value={type} onValueChange={(v) => setType(v as any)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ferie">Ferie</SelectItem><SelectItem value="permesso">Permesso</SelectItem><SelectItem value="malattia">Malattia</SelectItem><SelectItem value="straordinario">Straordinario</SelectItem></SelectContent></Select></div>
                     <div><Label>Data Inizio</Label><Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} className="rounded-md border"/></div>
                     <div><Label>Data Fine</Label><Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} fromDate={startDate} className="rounded-md border"/></div>
                    {(type === 'permesso' || type === 'straordinario') && <div><Label>Ore</Label><Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} /></div>}
                    <div><Label>Motivazione</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                </div>
                <ResponsiveDialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button onClick={handleSave}>Salva Modifiche</Button></ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    );
};

export default function LeaveRequestsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const params = useParams();
    const operatorId = params.operatorId as string;
    const [operator, setOperator] = useState<Operator | null>(null);

    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [itemToDelete, setItemToDelete] = useState<Request | null>(null);
    const [editingRequest, setEditingRequest] = useState<Request | null>(null);
    
    useEffect(() => {
        if (!firestore || !operatorId) return;
        const operatorDocRef = doc(firestore, 'app-users', operatorId);
        getDoc(operatorDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            }
        });
    }, [firestore, operatorId]);

    useEffect(() => {
        if (!firestore || !operatorId) return;
        const q = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            const allRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request));
            setRequests(allRequests);
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
        updateDoc(docRef, { status: newStatus, viewedByOperator: false }).catch(err => {
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

    const handleEditRequest = (request: Request) => {
        setEditingRequest(request);
    };
    
    const handleSaveEdit = async (editedData: Partial<Request>) => {
        if(!firestore || !editingRequest) return;
        
        const docRef = doc(firestore, `app-users/${operatorId}/requests`, editingRequest.id);
        await updateDoc(docRef, {...editedData, viewedByOperator: false}).then(() => {
            toast({title: 'Successo', description: 'Richiesta aggiornata'});
            setEditingRequest(null);
        }).catch(err => {
            toast({title: 'Errore', description: 'Impossibile aggiornare la richiesta.', variant: 'destructive'});
        });
    };
    
    const pendingRequests = requests.filter(r => r.status === 'in_attesa');
    const historicalRequests = requests.filter(r => r.status !== 'in_attesa');

    if (isLoading || !operator) return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin"/></div>;

    const renderTable = (reqs: Request[], isHistory: boolean = false) => (
        <Table>
            <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Dal</TableHead><TableHead>Al</TableHead><TableHead>Ore</TableHead>{isHistory ? <TableHead>Stato</TableHead> : null}<TableHead className='text-right'>Azioni</TableHead></TableRow></TableHeader>
            <TableBody>
                {reqs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Nessuna richiesta trovata.</TableCell></TableRow>
                ) : reqs.map(req => (
                    <TableRow key={req.id}>
                        <TableCell className="capitalize font-medium">{req.type.replace('_', ' ')}</TableCell>
                        <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{req.hours || '-'}</TableCell>
                        {isHistory && 
                            <TableCell>
                                <Badge variant={req.status === 'approvato' ? 'secondary' : 'destructive'}>
                                    {req.status}
                                </Badge>
                            </TableCell>
                        }
                        <TableCell className='text-right'>
                            <div className="flex gap-2 justify-end">
                                {req.status === 'in_attesa' && 
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req.id, 'approvato')}><CheckCircle className="h-5 w-5 text-green-500" /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req.id, 'rifiutato')}><XCircle className="h-5 w-5 text-red-500" /></Button>
                                    </>
                                }
                                <Button variant="ghost" size="icon" onClick={() => handleEditRequest(req)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setItemToDelete(req)}><Trash2 className="h-5 w-5 text-destructive" /></Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Richieste in Attesa di {operator.username}</CardTitle>
                    <CardDescription>Approva o rifiuta le richieste di ferie, permessi, ecc.</CardDescription>
                </CardHeader>
                <CardContent>
                    {renderTable(pendingRequests)}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Storico Richieste</CardTitle>
                </CardHeader>
                <CardContent>
                    {renderTable(historicalRequests, true)}
                </CardContent>
            </Card>

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

            {editingRequest && (
                <EditRequestDialog 
                    request={editingRequest} 
                    onSave={handleSaveEdit}
                    onClose={() => setEditingRequest(null)}
                />
            )}
        </div>
    );
};
