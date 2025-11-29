'use client';
import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp, writeBatch, doc, deleteDoc } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane, PlusCircle, Loader2, Circle, Trash2, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { RequestForm } from '@/components/request-form';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle } from '@/components/ui/responsive-dialog';


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
    viewedByOperator?: boolean;
    associatedShiftId?: string;
}


export default function RequestsPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    
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

            // Mark unread requests as read
            const unreadRequests = data.filter(r => r.viewedByOperator === false);
            if (unreadRequests.length > 0 && firestore && user) {
                 const batch = writeBatch(firestore);
                 unreadRequests.forEach(req => {
                    const reqRef = doc(firestore, `app-users/${user.id}/requests`, req.id);
                    batch.update(reqRef, { viewedByOperator: true });
                 });
                 batch.commit().catch(console.error);
            }

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

    const handleCancelRequest = async () => {
        if (!firestore || !user?.id || !requestToDelete) return;

        const requestRef = doc(firestore, `app-users/${user.id}/requests`, requestToDelete.id);

        try {
            await deleteDoc(requestRef);
            toast({
                title: "Successo",
                description: "La richiesta è stata annullata."
            });
        } catch (error: any) {
             if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({
                    operation: 'delete',
                    path: requestRef.path
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({
                    title: "Errore",
                    description: "Impossibile annullare la richiesta.",
                    variant: "destructive"
                });
            }
        } finally {
            setRequestToDelete(null);
        }
    }

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
        <>
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Plane className="h-8 w-8 text-primary" />
                    <CardTitle className="text-3xl font-bold tracking-tight">Gestione Richieste</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => setIsHelpOpen(true)}>
                        <Info className="h-5 w-5" />
                    </Button>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" /> Nuova Richiesta
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl">
                         <DialogHeader>
                            <DialogTitle>Crea Nuova Richiesta</DialogTitle>
                            <DialogDescription>
                                Compila il modulo per inviare una nuova richiesta di ferie, permesso, ecc.
                            </DialogDescription>
                        </DialogHeader>
                        <RequestForm userId={user.id} onFinished={() => setIsDialogOpen(false)} role="operator" />
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead></TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Dal</TableHead>
                                <TableHead>Al</TableHead>
                                <TableHead>Ore</TableHead>
                                <TableHead className="text-right">Stato</TableHead>
                                <TableHead className="w-[100px] text-right">Azioni</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.length > 0 ? (
                                requests.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell>
                                            {req.viewedByOperator === false && <Circle fill="red" className="h-2 w-2 text-red-500" />}
                                        </TableCell>
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
                                        <TableCell className="text-right">
                                            {req.status === 'in_attesa' && (
                                                <Button variant="ghost" size="icon" onClick={() => setRequestToDelete(req)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24">Nessuna richiesta trovata.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
        <AlertDialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Annullare la richiesta?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione è permanente. Sei sicuro di voler annullare questa richiesta?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Chiudi</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelRequest}>Annulla Richiesta</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

         <ResponsiveDialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
            <ResponsiveDialogContent>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>Guida alla Gestione Richieste</ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        Come creare e gestire le tue richieste di ferie e permessi.
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                <div className="py-4 space-y-4 text-sm">
                    <div>
                        <h4 className="font-semibold mb-1">Creare una Nuova Richiesta</h4>
                        <p className="text-muted-foreground">
                            Clicca sul pulsante <span className="font-bold text-primary-foreground">Nuova Richiesta</span> per aprire il modulo. Seleziona il tipo di richiesta (Ferie o Permesso), le date e, se necessario, il numero di ore.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-1">Stato della Richiesta</h4>
                        <p className="text-muted-foreground">
                            Dopo l'invio, la tua richiesta sarà <Badge variant="default" className="bg-yellow-500 text-white">in attesa</Badge>. Un amministratore la esaminerà. Lo stato diventerà <Badge variant="secondary">approvato</Badge> o <Badge variant="destructive">rifiutato</Badge>. Vedrai un pallino rosso <Circle fill="red" className="h-2 w-2 text-red-500 inline-block" /> accanto alle richieste il cui stato è cambiato e che non hai ancora visualizzato.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-1">Annullare una Richiesta</h4>
                        <p className="text-muted-foreground">
                            Puoi annullare una richiesta solo se è ancora in stato "in attesa". Per farlo, clicca sull'icona del cestino <Trash2 className="h-4 w-4 inline-block text-destructive" />.
                        </p>
                    </div>
                </div>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
        </>
    );
}
