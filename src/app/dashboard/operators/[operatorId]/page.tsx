'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, updateDoc, runTransaction } from 'firebase/firestore';
import { Loader2, User, ClipboardList, PackageSearch, ListChecks, Calendar, CheckCircle, XCircle, MapPin, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { format, differenceInDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { useParams } from 'next/navigation';


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

// Sub-components for each accordion item

const PendingClockings = ({ operatorId }: { operatorId: string }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [clockings, setClockings] = useState<Timbratura[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore) return;
        const q = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            orderBy('timestamp', 'desc')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            const allClockings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura));
            const pending = allClockings.filter(c => c.status === 'sospesa');
            setClockings(pending);
            setIsLoading(false);
        }, error => {
            console.error(error);
            toast({ title: 'Errore', description: 'Impossibile caricare le timbrature.', variant: 'destructive' });
            setIsLoading(false);
        });
        return unsubscribe;
    }, [firestore, operatorId, toast]);

    const handleApprove = (clockingId: string) => {
        if (!firestore) return;
        const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, clockingId);
        updateDoc(docRef, { status: 'confermata' }).catch(err => {
            console.error(err);
            toast({ title: 'Errore', description: 'Impossibile approvare la timbratura.', variant: 'destructive' });
        });
    };
    
    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    if (clockings.length === 0) return <p className="text-sm text-muted-foreground">Nessuna timbratura in sospeso.</p>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Orario</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Posizione</TableHead>
                    <TableHead className="text-right">Azione</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {clockings.map(t => (
                    <TableRow key={t.id}>
                        <TableCell>{format(t.timestamp.toDate(), 'Pp', { locale: it })}</TableCell>
                        <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                        <TableCell>
                            <a href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                <MapPin className="h-4 w-4"/> Mappa
                             </a>
                        </TableCell>
                        <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleApprove(t.id)}>
                                <CheckCircle className="h-5 w-5 text-green-500" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

const LeaveRequests = ({ operatorId }: { operatorId: string }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore) return;
        const q = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            where('status', '==', 'in_attesa'),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            setRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request)));
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

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    if (requests.length === 0) return <p className="text-sm text-muted-foreground">Nessuna richiesta in attesa.</p>;

    return (
        <Table>
            <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Dal</TableHead><TableHead>Al</TableHead><TableHead>Ore</TableHead><TableHead>Azioni</TableHead></TableRow></TableHeader>
            <TableBody>
                {requests.map(req => (
                    <TableRow key={req.id}>
                        <TableCell className="capitalize">{req.type.replace('_', ' ')}</TableCell>
                        <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{req.hours || '-'}</TableCell>
                        <TableCell>
                            <div className="flex gap-2 justify-end">
                                <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req.id, 'approvato')}><CheckCircle className="h-5 w-5 text-green-500" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req.id, 'rifiutato')}><XCircle className="h-5 w-5 text-red-500" /></Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
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

     useEffect(() => {
        if (!firestore) return;
        const q = query(
            collection(firestore, 'supply-requests'),
            where('userId', '==', operatorId),
            where('status', '==', 'in_attesa'),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            setRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SupplyRequest)));
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
        </>
    );
};

const MonthlySummary = ({ operatorId }: { operatorId: string }) => {
    const firestore = useFirestore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
        
        const unsubRequests = onSnapshot(requestsQuery, s => setRequests(s.docs.map(d => d.data() as Request)));
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

        let totalWorkedMillis = 0;
        let workedDaysCount = 0;
        Object.values(dailyTimbrature).forEach(dayEvents => {
            dayEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            let dayWorkedMillis = 0, shiftStart: Timestamp | null = null, breakStart: Timestamp | null = null;
            dayEvents.forEach(event => {
                if (event.type === 'entrata') shiftStart = event.timestamp;
                else if (event.type === 'pausa' && shiftStart) breakStart = event.timestamp;
                else if (event.type === 'fine_pausa' && shiftStart && breakStart) { dayWorkedMillis += breakStart.toMillis() - shiftStart.toMillis(); shiftStart = event.timestamp; breakStart = null; }
                else if (event.type === 'uscita' && shiftStart) { dayWorkedMillis += event.timestamp.toMillis() - shiftStart.toMillis(); shiftStart = null; }
            });
            if (dayWorkedMillis > 0) { workedDaysCount++; totalWorkedMillis += dayWorkedMillis; }
        });

        const workedHours = totalWorkedMillis / (1000 * 60 * 60);
        const approvedRequests = requests.filter(r => r.status === 'approvato');
        return {
            workedDays: workedDaysCount,
            workedHours: workedHours.toFixed(2),
            overtimeHours: approvedRequests.filter(r => r.type === 'straordinario').reduce((sum, r) => sum + (r.hours || 0), 0),
            ferieDays: approvedRequests.filter(r => r.type === 'ferie').reduce((sum, r) => sum + differenceInDays(r.endDate.toDate(), r.startDate.toDate()) + 1, 0),
            permessoHours: approvedRequests.filter(r => r.type === 'permesso').reduce((sum, r) => sum + (r.hours || 0), 0),
            malattiaDays: approvedRequests.filter(r => r.type === 'malattia').reduce((sum, r) => sum + differenceInDays(r.endDate.toDate(), r.startDate.toDate()) + 1, 0),
        };
    }, [timbrature, requests]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin"/>;
    
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                <h4 className="text-lg font-semibold">{format(currentDate, 'MMMM yyyy', { locale: it })}</h4>
                <Button variant="outline" onClick={() => handleMonthChange(1)}>Succ.</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle><Briefcase className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedDays}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ore Lavorate</CardTitle><Hash className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.workedHours}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Straordinari (ore)</CardTitle><Plus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.overtimeHours}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle><Plane className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.ferieDays}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle><UserCheck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.permessoHours}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle><Stethoscope className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.malattiaDays}</div></CardContent></Card>
            </div>
        </div>
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
                    <AccordionItem value="item-1">
                        <AccordionTrigger className="p-6">
                            <div className="flex items-center gap-3">
                                <ListChecks className="h-6 w-6 text-primary"/>
                                <h3 className="text-xl font-semibold">Gestione Timbrature Sospese</h3>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                            <PendingClockings operatorId={operator.id} />
                        </AccordionContent>
                    </AccordionItem>
                </Card>
                 <Card>
                    <AccordionItem value="item-2">
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
                    <AccordionItem value="item-3">
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
                    <AccordionItem value="item-4">
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
