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

const initialFormData = {
    requestType: '' as RequestType,
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    hours: '',
    reason: '',
};

export default function RequestsPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    const [formData, setFormData] = useState(initialFormData);
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

    const handleInputChange = (field: keyof typeof initialFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const validateForm = (): boolean => {
        if (!formData.requestType || !formData.startDate) {
            toast({ title: "Campi Mancanti", description: "Tipo di richiesta e data di inizio sono obbligatori.", variant: "destructive" });
            return false;
        }
        if ((formData.requestType === 'permesso' || formData.requestType === 'straordinario') && (!formData.hours || Number(formData.hours) <= 0)) {
            toast({ title: "Campo Mancante", description: "Per permessi e straordinari, il numero di ore è obbligatorio.", variant: "destructive" });
            return false;
        }
        if (formData.endDate && formData.startDate && formData.endDate < formData.startDate) {
            toast({ title: "Date non valide", description: "La data di fine non può essere precedente a quella di inizio.", variant: "destructive" });
            return false;
        }
        return true;
    };


    const handleNewRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm() || !firestore || !user || !formData.startDate) return;
        
        setIsSubmitting(true);

        const finalEndDate = formData.endDate || formData.startDate;

        const newRequestData: any = {
            userId: user.id,
            type: formData.requestType,
            status: 'in_attesa' as const,
            startDate: Timestamp.fromDate(formData.startDate),
            endDate: Timestamp.fromDate(finalEndDate),
            reason: formData.reason,
            createdAt: serverTimestamp(),
        };

        if (formData.requestType === 'permesso' || formData.requestType === 'straordinario') {
            newRequestData.hours = Number(formData.hours);
        }

        const requestCollectionRef = collection(firestore, `app-users/${user.id}/requests`);
        
        try {
            await addDoc(requestCollectionRef, newRequestData)
            toast({ title: "Successo", description: "La tua richiesta è stata inviata." });
            setIsDialogOpen(false);
            setFormData(initialFormData);
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
                    if (!open) setFormData(initialFormData);
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
                                    <Select required onValueChange={(value) => handleInputChange('requestType', value as RequestType)} value={formData.requestType}>
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
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                id="startDate"
                                                variant={"outline"}
                                                className={cn("col-span-3 justify-start text-left font-normal", !formData.startDate && "text-muted-foreground")}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {formData.startDate ? format(formData.startDate, "PPP", { locale: it }) : <span>Scegli una data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar 
                                                mode="single" 
                                                selected={formData.startDate} 
                                                onSelect={(date) => handleInputChange('startDate', date)}
                                                initialFocus 
                                            />
                                        </PopoverContent>
                                     </Popover>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                     <Label htmlFor="endDate" className="text-right">Data Fine</Label>
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                id="endDate"
                                                variant={"outline"}
                                                className={cn("col-span-3 justify-start text-left font-normal", !formData.endDate && "text-muted-foreground")}
                                                disabled={!formData.startDate}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {formData.endDate ? format(formData.endDate, "PPP", { locale: it }) : <span>Scegli una data (opzionale)</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar 
                                                mode="single" 
                                                selected={formData.endDate} 
                                                onSelect={(date) => handleInputChange('endDate', date)}
                                                disabled={{ before: formData.startDate }} 
                                                initialFocus 
                                            />
                                        </PopoverContent>
                                     </Popover>
                                </div>
                                 {(formData.requestType === 'permesso' || formData.requestType === 'straordinario') && (
                                     <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="hours" className="text-right">Ore</Label>
                                        <Input id="hours" type="number" value={formData.hours} onChange={(e) => handleInputChange('hours', e.target.value)} className="col-span-3" placeholder='Es: 2.5' required min="0.5" step="0.5" />
                                    </div>
                                 )}
                                <div className="grid grid-cols-4 items-start gap-4">
                                    <Label htmlFor="reason" className="text-right mt-2">Motivazione</Label>
                                    <Textarea id="reason" value={formData.reason} onChange={(e) => handleInputChange('reason', e.target.value)} className="col-span-3" placeholder="Aggiungi una nota (opzionale)" />
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
                                            }
                                             className={cn(req.status === 'in_attesa' ? 'bg-yellow-500 text-white hover:bg-yellow-600' : '')}>
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
