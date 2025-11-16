'use client';
import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane, PlusCircle, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';


type Request = {
    id: string;
    userId: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'in_attesa' | 'approvato' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
    reason?: string;
    createdAt: Timestamp;
}

type RequestType = 'ferie' | 'permesso' | 'malattia' | 'straordinario' | '';

const validateForm = (
    requestType: RequestType,
    startDate: Date | undefined,
    endDate: Date | undefined,
    hours: string,
    toast: (props: any) => void
): boolean => {
    if (!requestType || !startDate) {
        toast({ title: "Campi Mancanti", description: "Tipo di richiesta e data di inizio sono obbligatori.", variant: "destructive" });
        return false;
    }
    if ((requestType === 'permesso' || requestType === 'straordinario') && (!hours || Number(hours) <= 0)) {
        toast({ title: "Campo Mancante", description: "Per permessi e straordinari, il numero di ore è obbligatorio.", variant: "destructive" });
        return false;
    }
    if (endDate && startDate && endDate < startDate) {
        toast({ title: "Date non valide", description: "La data di fine non può essere precedente a quella di inizio.", variant: "destructive" });
        return false;
    }
    return true;
};


export default function RequestsPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    // Popover states
    const [isStartCalendarOpen, setIsStartCalendarOpen] = useState(false);
    const [isEndCalendarOpen, setIsEndCalendarOpen] = useState(false);

    // Form state
    const [requestType, setRequestType] = useState<RequestType>('');
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();
    const [hours, setHours] = useState<string>('');
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!firestore || !user?.id) {
            if(!isUserLoading) setIsLoadingData(false);
            return;
        };
        
        setIsLoadingData(true);
        const requestsQuery = query(
            collection(firestore, `app-users/${user.id}/requests`),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Request[];
            setRequests(data);
            setIsLoadingData(false);
        }, (error) => {
            console.error("Error fetching requests:", error);
            if (error.code === 'permission-denied' && firestore) {
                const contextualError = new FirestorePermissionError({
                    operation: 'list',
                    path: `app-users/${user.id}/requests`,
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile caricare le richieste.", variant: "destructive" });
            }
            setIsLoadingData(false);
        });

        return () => unsubscribe();
    }, [firestore, user, isUserLoading, toast]);

    const resetForm = () => {
        setRequestType('');
        setStartDate(undefined);
        setEndDate(undefined);
        setHours('');
        setReason('');
        setIsSubmitting(false);
    };


    const handleNewRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm(requestType, startDate, endDate, hours, toast) || !firestore || !user || !startDate) return;
        
        setIsSubmitting(true);

        const finalEndDate = endDate || startDate;

        const newRequestData = {
            userId: user.id,
            type: requestType as Exclude<RequestType, ''>,
            status: 'in_attesa' as const,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(finalEndDate),
            reason,
            createdAt: serverTimestamp(),
            ...( (requestType === 'permesso' || requestType === 'straordinario') && { hours: Number(hours) } )
        };

        const requestCollectionRef = collection(firestore, `app-users/${user.id}/requests`);
        
        try {
            await addDoc(requestCollectionRef, newRequestData);
            toast({ title: "Successo", description: "La tua richiesta è stata inviata." });
            setIsDialogOpen(false);
            resetForm();
        } catch (error: any) {
            console.error("Error creating request:", error);
            if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({
                    operation: 'create',
                    path: requestCollectionRef.path,
                    requestResourceData: newRequestData
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile inviare la richiesta. Riprova.", variant: "destructive" });
            }
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (isUserLoading || isLoadingData) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Utente non trovato. Riprova il login.</p>
            </div>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Plane className="h-8 w-8 text-primary" />
                    <CardTitle className="text-3xl font-bold tracking-tight">Gestione Richieste</CardTitle>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    if (!open) resetForm();
                    setIsDialogOpen(open);
                }}>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" /> Nuova Richiesta
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                         <form onSubmit={handleNewRequest}>
                            <DialogHeader>
                                <DialogTitle>Crea Nuova Richiesta</DialogTitle>
                                <DialogDescription>
                                    Compila il modulo per inviare una nuova richiesta di ferie, permesso, ecc.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="type" className="text-right">Tipo</Label>
                                    <Select required onValueChange={(value) => setRequestType(value as RequestType)} value={requestType}>
                                        <SelectTrigger id="type" className="col-span-3">
                                            <SelectValue placeholder="Seleziona un tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ferie">Ferie</SelectItem>
                                            <SelectItem value="permesso">Permesso</SelectItem>
                                            <SelectItem value="malattia">Malattia</SelectItem>
                                            <SelectItem value="straordinario">Straordinario</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                 <div className="grid grid-cols-4 items-center gap-4">
                                     <Label htmlFor="startDate" className="text-right">Data Inizio</Label>
                                     <Popover open={isStartCalendarOpen} onOpenChange={setIsStartCalendarOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                id="startDate"
                                                variant={"outline"}
                                                className={cn("col-span-3 justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {startDate ? format(startDate, "PPP", { locale: it }) : <span>Scegli una data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar 
                                                mode="single" 
                                                selected={startDate} 
                                                onSelect={(date) => {
                                                    setStartDate(date);
                                                    setIsStartCalendarOpen(false);
                                                }}
                                                initialFocus 
                                            />
                                        </PopoverContent>
                                     </Popover>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                     <Label htmlFor="endDate" className="text-right">Data Fine</Label>
                                     <Popover open={isEndCalendarOpen} onOpenChange={setIsEndCalendarOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                id="endDate"
                                                variant={"outline"}
                                                className={cn("col-span-3 justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                                                disabled={!startDate}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {endDate ? format(endDate, "PPP", { locale: it }) : <span>Scegli una data (opzionale)</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar 
                                                mode="single" 
                                                selected={endDate} 
                                                onSelect={(date) => {
                                                    setEndDate(date);
                                                    setIsEndCalendarOpen(false);
                                                }}
                                                disabled={{ before: startDate }} 
                                                initialFocus 
                                            />
                                        </PopoverContent>
                                     </Popover>
                                </div>
                                 {(requestType === 'permesso' || requestType === 'straordinario') && (
                                     <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="hours" className="text-right">Ore</Label>
                                        <Input id="hours" type="number" value={hours} onChange={(e) => setHours(e.target.value)} className="col-span-3" placeholder='Es: 2.5' required min="0.5" step="0.5" />
                                    </div>
                                 )}
                                <div className="grid grid-cols-4 items-start gap-4">
                                    <Label htmlFor="reason" className="text-right mt-2">Motivazione</Label>
                                    <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="col-span-3" placeholder="Aggiungi una nota (opzionale)" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Annulla</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                    Invia Richiesta
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Dal</TableHead>
                                <TableHead>Al</TableHead>
                                <TableHead>Ore</TableHead>
                                <TableHead className="text-right">Stato</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.length > 0 ? (
                                requests.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell className="font-medium capitalize">{req.type.replace('_', ' ')}</TableCell>
                                        <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                                        <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                                        <TableCell>{req.hours ? `${req.hours}` : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={
                                                req.status === 'approvato' ? 'secondary' 
                                                : req.status === 'rifiutato' ? 'destructive' 
                                                : 'default'
                                            }>
                                                {req.status.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24">Nessuna richiesta trovata.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
