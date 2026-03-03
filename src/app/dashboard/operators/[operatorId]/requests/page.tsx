'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Loader2, CheckCircle, XCircle, Trash2, Pencil, PlusCircle, Calendar as CalendarIcon, Info } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RequestForm } from '@/components/request-form';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, formatISO, getDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';


type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
};
type WorkSchedule = {
    [key in DayOfWeek]?: DailySchedule;
};

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    hourlyRate?: number;
    sickLeaveRate?: number;
    workSchedule: WorkSchedule;
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
    dailyCosts?: { [date: string]: number };
};

const EditRequestDialog = ({ request, onSave, onClose }: { request: Request; onSave: (data: Partial<Request>) => void; onClose: () => void; }) => {
    const [type, setType] = useState(request.type);
    const [startDate, setStartDate] = useState(request.startDate.toDate());
    const [endDate, setEndDate] = useState(request.endDate.toDate());
    const [hours, setHours] = useState(request.hours?.toString() || '');
    const [reason, setReason] = useState(request.reason || '');

    const [isStartPickerOpen, setIsStartPickerOpen] = useState(false);
    const [isEndPickerOpen, setIsEndPickerOpen] = useState(false);
    
    const currentYear = new Date().getFullYear();

    const handleSave = () => {
        const editedData: Partial<Request> = {
            type,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(endDate),
            reason,
            status: 'in_attesa', // Force re-approval
            viewedByOperator: false,
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
                     
                     <div className='grid grid-cols-2 gap-4'>
                        <div>
                            <Label>Data Inizio</Label>
                             <Dialog open={isStartPickerOpen} onOpenChange={setIsStartPickerOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {startDate ? format(startDate, "PPP", { locale: it }) : <span>Scegli una data</span>}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-auto p-0">
                                     <DialogHeader className="p-4 pb-0">
                                       <DialogTitle>Seleziona data di inizio</DialogTitle>
                                     </DialogHeader>
                                    <Calendar
                                        mode="single"
                                        selected={startDate}
                                        onSelect={(date) => {
                                            if (date) {
                                                setStartDate(date);
                                                if (date > endDate) setEndDate(date);
                                            }
                                            setIsStartPickerOpen(false);
                                        }}
                                        captionLayout="dropdown-buttons"
                                        fromYear={currentYear - 1}
                                        toYear={currentYear + 5}
                                        initialFocus
                                        locale={it}
                                    />
                                </DialogContent>
                            </Dialog>
                        </div>
                        <div>
                            <Label>Data Fine</Label>
                            <Dialog open={isEndPickerOpen} onOpenChange={setIsEndPickerOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {endDate ? format(endDate, "PPP", { locale: it }) : <span>Scegli una data</span>}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-auto p-0">
                                    <DialogHeader className="p-4 pb-0">
                                        <DialogTitle>Seleziona data di fine</DialogTitle>
                                    </DialogHeader>
                                    <Calendar
                                        mode="single"
                                        selected={endDate}
                                        onSelect={(date) => {
                                            if(date) setEndDate(date);
                                            setIsEndPickerOpen(false);
                                        }}
                                        disabled={{ before: startDate }}
                                        captionLayout="dropdown-buttons"
                                        fromYear={currentYear - 1}
                                        toYear={currentYear + 5}
                                        initialFocus
                                        locale={it}
                                    />
                                </DialogContent>
                            </Dialog>
                        </div>
                     </div>

                    {(type === 'permesso' || type === 'straordinario') && <div><Label>Ore</Label><Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} /></div>}
                    <div><Label>Motivazione</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                </div>
                <ResponsiveDialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button onClick={handleSave}>Salva Modifiche</Button></ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    );
};

const ApprovalDialog = ({ request, operator, onConfirm, onClose }: { request: Request; operator: Operator; onConfirm: (costs: Record<string, number>) => void; onClose: () => void; }) => {
    const days = eachDayOfInterval({ start: request.startDate.toDate(), end: request.endDate.toDate() });
    const [costs, setCosts] = useState<Record<string, number>>({});

    const handleApplyContractualRate = (checked: boolean) => {
        if (checked) {
            const newCosts: Record<string, number> = {};
            days.forEach(day => {
                const dateKey = formatISO(day, { representation: 'date' });
                let cost = 0;
                if (request.type === 'permesso') {
                    const permissionHours = request.hours || 0;
                    const rate = operator.hourlyRate || 0;
                    cost = permissionHours * rate;
                } else {
                    const dayName = dayIndexToName[getDay(day)];
                    const contractualHours = operator.workSchedule[dayName]?.totalHours || 0;
                    let rate = 0;
                    if (request.type === 'ferie') {
                        rate = operator.hourlyRate || 0;
                    } else if (request.type === 'malattia') {
                        rate = operator.sickLeaveRate || 0;
                    }
                    cost = contractualHours * rate;
                }
                newCosts[dateKey] = cost;
            });
            setCosts(newCosts);
        } else {
            const resetCosts: Record<string, number> = {};
            days.forEach(day => {
                resetCosts[formatISO(day, { representation: 'date' })] = 0;
            });
            setCosts(resetCosts);
        }
    };
    
    const handleCostChange = (date: string, value: string) => {
        setCosts(prev => ({...prev, [date]: parseFloat(value) || 0 }));
    };

    return (
        <ResponsiveDialog open={true} onOpenChange={onClose}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>Approva e Definisci Costi</ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        Imposta il costo per ogni giorno di {request.type}. Questo valore verrà usato nel calcolo finale.
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                 <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="apply-contractual" onCheckedChange={handleApplyContractualRate} />
                        <Label htmlFor="apply-contractual">Applica tariffa contrattuale</Label>
                    </div>
                    <Separator />
                    {days.map(day => {
                        const dateKey = formatISO(day, { representation: 'date' });
                        return (
                            <div key={dateKey} className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor={`cost-${dateKey}`} className="capitalize">
                                    {format(day, "eeee, dd/MM/yy", { locale: it })}
                                </Label>
                                <Input
                                    id={`cost-${dateKey}`}
                                    type="number"
                                    className="col-span-2"
                                    placeholder="Costo per il giorno"
                                    value={costs[dateKey] ?? 0}
                                    onChange={(e) => handleCostChange(dateKey, e.target.value)}
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        )
                    })}
                </div>
                <ResponsiveDialogFooter>
                    <Button variant="outline" onClick={onClose}>Annulla</Button>
                    <Button onClick={() => onConfirm(costs)}>Conferma Approvazione</Button>
                </ResponsiveDialogFooter>
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
    const [requestToApprove, setRequestToApprove] = useState<Request | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isCleanHistoryConfirmOpen, setIsCleanHistoryConfirmOpen] = useState(false);

    const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
    const [isBatchApproving, setIsBatchApproving] = useState(false);
    const [isBatchConfirmOpen, setIsBatchConfirmOpen] = useState(false);
    const [batchApplyContractual, setBatchApplyContractual] = useState(true);
    
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

    const handleConfirmApproval = (costs: Record<string, number>) => {
        if (!firestore || !requestToApprove) return;
        const docRef = doc(firestore, `app-users/${operatorId}/requests`, requestToApprove.id);
        updateDoc(docRef, { status: 'approvato', viewedByOperator: false, dailyCosts: costs })
        .then(() => {
            toast({ title: 'Successo', description: 'Richiesta approvata con costi salvati.' });
        })
        .catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile approvare la richiesta.', variant: 'destructive' });
        }).finally(() => {
            setRequestToApprove(null);
        });
    };
    
    const handleUpdateRequestStatus = (requestId: string, newStatus: 'approvato' | 'rifiutato') => {
        if (newStatus === 'rifiutato' && firestore) {
            const docRef = doc(firestore, `app-users/${operatorId}/requests`, requestId);
            updateDoc(docRef, { status: newStatus, viewedByOperator: false }).catch(err => {
                console.error(err);
                toast({ title: 'Errore', description: 'Impossibile aggiornare la richiesta.', variant: 'destructive' });
            });
        } else {
             const req = requests.find(r => r.id === requestId);
             if (req) setRequestToApprove(req);
        }
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
        await updateDoc(docRef, editedData).then(() => {
            toast({title: 'Successo', description: 'Richiesta aggiornata e impostata come "in attesa". Richiede una nuova approvazione.'});
            setEditingRequest(null);
        }).catch(err => {
            toast({title: 'Errore', description: 'Impossibile aggiornare la richiesta.', variant: 'destructive'});
        });
    };

    const handleCleanHistory = async () => {
        if (!firestore || !operatorId) return;
        
        const historicalRequests = requests.filter(r => r.status !== 'in_attesa');
        if (historicalRequests.length === 0) {
            toast({ title: "Nessuna richiesta da eliminare", description: "Lo storico è già vuoto."});
            setIsCleanHistoryConfirmOpen(false);
            return;
        }

        const batch = writeBatch(firestore);
        historicalRequests.forEach(req => {
            const docRef = doc(firestore, `app-users/${operatorId}/requests`, req.id);
            batch.delete(docRef);
        });

        try {
            await batch.commit();
            toast({ title: "Successo!", description: "Lo storico delle richieste è stato pulito."});
        } catch (error) {
            console.error("Error cleaning request history:", error);
            toast({ title: "Errore", description: "Impossibile pulire lo storico.", variant: "destructive"});
        } finally {
            setIsCleanHistoryConfirmOpen(false);
        }
    };

    const handleApproveSelected = async () => {
        if (!firestore || !operator || selectedRequests.size === 0) return;

        setIsBatchApproving(true);

        const batch = writeBatch(firestore);
        const requestsToApprove = requests.filter(r => selectedRequests.has(r.id));

        for (const request of requestsToApprove) {
            const docRef = doc(firestore, `app-users/${operatorId}/requests`, request.id);
            const dailyCosts: Record<string, number> = {};
            
            if (batchApplyContractual) {
                const days = eachDayOfInterval({ start: request.startDate.toDate(), end: request.endDate.toDate() });

                if (request.type === 'permesso') {
                    const cost = (request.hours || 0) * (operator.hourlyRate || 0);
                    if (days.length > 0) {
                        const dateKey = formatISO(days[0], { representation: 'date' });
                        dailyCosts[dateKey] = cost;
                    }
                } else if (request.type === 'ferie' || request.type === 'malattia') {
                    days.forEach(day => {
                        const dateKey = formatISO(day, { representation: 'date' });
                        const dayName = dayIndexToName[getDay(day)];
                        const contractualHours = operator.workSchedule?.[dayName]?.totalHours || 0;
                        let rate = 0;
                        if (request.type === 'ferie') {
                            rate = operator.hourlyRate || 0;
                        } else if (request.type === 'malattia') {
                            rate = operator.sickLeaveRate || 0;
                        }
                        dailyCosts[dateKey] = contractualHours * rate;
                    });
                }
            }
            
            batch.update(docRef, { status: 'approvato', viewedByOperator: false, dailyCosts });
        }

        try {
            await batch.commit();
            toast({ title: 'Successo', description: `${selectedRequests.size} richieste approvate ${batchApplyContractual ? 'con costo contrattuale' : ''}.` });
            setSelectedRequests(new Set());
            setIsBatchConfirmOpen(false);
        } catch (error) {
            console.error("Error approving selected requests:", error);
            toast({ title: 'Errore', description: 'Impossibile approvare le richieste selezionate.', variant: 'destructive' });
        } finally {
            setIsBatchApproving(false);
        }
    };
    
    const pendingRequests = requests.filter(r => r.status === 'in_attesa');
    const historicalRequests = requests.filter(r => r.status !== 'in_attesa');

    if (isLoading || !operator) return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin"/></div>;

    const renderTable = (reqs: Request[], isPending: boolean) => {

        const handleSelectAll = (checked: boolean) => {
            if (checked) {
                setSelectedRequests(new Set(reqs.map(r => r.id)));
            } else {
                setSelectedRequests(new Set());
            }
        };

        const handleSelectOne = (reqId: string, checked: boolean) => {
            const newSet = new Set(selectedRequests);
            if (checked) {
                newSet.add(reqId);
            } else {
                newSet.delete(reqId);
            }
            setSelectedRequests(newSet);
        };

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        {isPending && (
                            <TableHead className="w-12">
                                <Checkbox
                                    checked={reqs.length > 0 && selectedRequests.size === reqs.length}
                                    onCheckedChange={handleSelectAll}
                                />
                            </TableHead>
                        )}
                        <TableHead>Tipo</TableHead>
                        <TableHead>Dal</TableHead>
                        <TableHead>Al</TableHead>
                        <TableHead>Ore</TableHead>
                        { !isPending && <TableHead>Stato</TableHead> }
                        <TableHead className='text-right'>Azioni</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {reqs.length === 0 ? (
                        <TableRow><TableCell colSpan={isPending ? 6 : 5} className="h-24 text-center">Nessuna richiesta trovata.</TableCell></TableRow>
                    ) : reqs.map(req => (
                        <TableRow key={req.id}>
                            {isPending && (
                                <TableCell>
                                    <Checkbox 
                                        checked={selectedRequests.has(req.id)}
                                        onCheckedChange={(checked) => handleSelectOne(req.id, !!checked)}
                                    />
                                </TableCell>
                            )}
                            <TableCell className="capitalize font-medium">{req.type.replace('_', ' ')}</TableCell>
                            <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                            <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                            <TableCell>{req.hours || '-'}</TableCell>
                            {!isPending && 
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
        );
    }

    return (
        <>
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className='flex items-center gap-2'>
                           <h1 className="text-3xl font-bold tracking-tight">{operator.firstName} {operator.lastName}</h1>
                           <Button variant="ghost" size="icon" onClick={() => setIsHelpOpen(true)}><Info className="h-5 w-5"/></Button>
                        </div>
                        <p className="text-muted-foreground">Gestione Richieste (Codice: {operator.username})</p>
                    </div>
                     <div className="flex items-center gap-2">
                        {selectedRequests.size > 0 && (
                            <Button onClick={() => setIsBatchConfirmOpen(true)} disabled={isBatchApproving}>
                                {isBatchApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Approva Selezionate ({selectedRequests.size})
                            </Button>
                        )}
                         <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi Richiesta
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-xl">
                                 <DialogHeader>
                                    <DialogTitle>Crea Nuova Richiesta per {operator.username}</DialogTitle>
                                    <DialogDescription>
                                        Compila il modulo per inviare una nuova richiesta per conto dell'operatore.
                                    </DialogDescription>
                                </DialogHeader>
                                <RequestForm userId={operator.id} onFinished={() => setIsAddDialogOpen(false)} role="admin" />
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent>
                    <h3 className="text-lg font-medium mb-2">In Attesa</h3>
                    {renderTable(pendingRequests, true)}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex items-center justify-between">
                    <CardTitle>Storico Richieste</CardTitle>
                    <Button variant="destructive" size="sm" onClick={() => setIsCleanHistoryConfirmOpen(true)}>
                        <Trash2 className="mr-2 h-4 w-4"/> Pulisci Storico
                    </Button>
                </CardHeader>
                <CardContent>
                    {renderTable(historicalRequests, false)}
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
            
            <AlertDialog open={isCleanHistoryConfirmOpen} onOpenChange={setIsCleanHistoryConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confermi di voler pulire lo storico?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà in modo permanente tutte le richieste approvate e rifiutate per questo operatore. L'azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCleanHistory}>Conferma e Pulisci</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isBatchConfirmOpen} onOpenChange={setIsBatchConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approva {selectedRequests.size} Richieste</AlertDialogTitle>
                        <AlertDialogDescription>
                            Stai per approvare tutte le richieste selezionate. Vuoi applicare i costi contrattuali automaticamente?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex items-center space-x-2 py-4">
                        <Switch 
                            id="batch-apply-contractual" 
                            checked={batchApplyContractual} 
                            onCheckedChange={setBatchApplyContractual}
                        />
                        <Label htmlFor="batch-apply-contractual">Applica tariffa contrattuale</Label>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleApproveSelected} disabled={isBatchApproving}>
                            {isBatchApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            Conferma Approvazione
                        </AlertDialogAction>
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

            {requestToApprove && operator && (
                 <ApprovalDialog
                    request={requestToApprove}
                    operator={operator}
                    onConfirm={handleConfirmApproval}
                    onClose={() => setRequestToApprove(null)}
                />
            )}

        </div>
         <ResponsiveDialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>Guida alla Gestione Richieste</ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        Come approvare, rifiutare e modificare le richieste degli operatori.
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                <div className="py-4 space-y-4 text-sm">
                    <div>
                        <h4 className="font-semibold mb-1">Approvazione e Rifiuto</h4>
                        <p className="text-muted-foreground">
                            Nella tabella "In Attesa", puoi approvare o rifiutare una richiesta usando i pulsanti <CheckCircle className="h-4 w-4 inline-block text-green-500"/> (approva) e <XCircle className="h-4 w-4 inline-block text-red-500"/> (rifiuta). L'operatore riceverà una notifica sul cambio di stato.
                        </p>
                    </div>
                     <div>
                        <h4 className="font-semibold mb-1">Approvazione Multipla</h4>
                        <p className="text-muted-foreground">
                            Seleziona più richieste usando le caselle di controllo e clicca su "Approva Selezionate" per approvarle tutte in una volta. Il sistema calcolerà automaticamente i costi in base al contratto.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-1">Aggiungere una Richiesta</h4>
                        <p className="text-muted-foreground">
                            Se un operatore ti comunica una richiesta a voce, puoi inserirla tu stesso usando il pulsante "Aggiungi Richiesta". Puoi anche inserire richieste di malattia.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-1">Modifica ed Eliminazione</h4>
                        <p className="text-muted-foreground">
                            Puoi modificare qualsiasi richiesta (in attesa, approvata o rifiutata) usando il pulsante a forma di matita <Pencil className="h-4 w-4 inline-block"/>. Puoi anche eliminare definitivamente una richiesta con il pulsante del cestino <Trash2 className="h-4 w-4 inline-block text-destructive"/>. Usa queste funzioni con cautela.
                        </p>
                    </div>
                </div>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
        </>
    );
};
