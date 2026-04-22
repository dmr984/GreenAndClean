'use client';
import React, { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, updateDoc, deleteDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { Loader2, BellRing, Trash2, ShieldX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useParams } from 'next/navigation';
import { format, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';

// Define types
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
    status: 'sospesa' | 'confermata' | 'rifiutata';
}

type PendingRequest = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario' | 'sblocco_timbratura';
    status: 'in_attesa';
    startDate: Timestamp;
    createdAt: Timestamp;
};

type PendingStraordinario = {
    id: string;
    status: 'in_corso' | 'in_attesa_di_approvazione';
    date: Timestamp;
};

type NotificationItem = {
    id: string;
    collection: 'timbrature' | 'requests' | 'straordinari';
    description: string;
    date: Date;
};

export default function NotificationCenterPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const params = useParams();
    const operatorId = params.operatorId as string;
    
    const [operator, setOperator] = useState<Operator | null>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [itemToDelete, setItemToDelete] = useState<NotificationItem | null>(null);

    useEffect(() => {
        if (!firestore || !operatorId) return;

        const operatorDocRef = doc(firestore, 'app-users', operatorId);
        const unsubOperator = onSnapshot(operatorDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            }
        });

        const unsubs: (()=>void)[] = [unsubOperator];
        let allPendingItems: NotificationItem[] = [];

        const processAndSetNotifications = (newItems: NotificationItem[], type: 'timbrature' | 'requests' | 'straordinari') => {
            allPendingItems = [
                ...allPendingItems.filter(item => item.collection !== type),
                ...newItems
            ];
            allPendingItems.sort((a, b) => b.date.getTime() - a.date.getTime());
            setNotifications(allPendingItems);
             setIsLoading(false);
        };
        
        // Listener for Timbrature (now more comprehensive)
        const allTimbratureQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), orderBy('timestamp', 'desc'));
        const unsubTimbrature = onSnapshot(allTimbratureQuery, (snapshot) => {
            const allTimbrature = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Timbratura));
            const newItems: NotificationItem[] = [];

            // 1. Find individual 'sospesa' events
            const suspendedEvents = allTimbrature.filter(t => t.status === 'sospesa');
            suspendedEvents.forEach(data => {
                newItems.push({
                    id: data.id,
                    collection: 'timbrature',
                    description: `Timbratura di "${data.type}" in attesa`,
                    date: data.timestamp?.toDate() || new Date(0),
                });
            });

            // 2. Find 'in_corso' shifts by grouping events by day
            const shiftsByDay: { [key: string]: Timbratura[] } = {};
            for (const event of allTimbrature) {
                if (!event.timestamp || typeof event.timestamp.toDate !== 'function') continue;
                const dayString = format(event.timestamp.toDate(), 'yyyy-MM-dd');
                if (!shiftsByDay[dayString]) shiftsByDay[dayString] = [];
                shiftsByDay[dayString].push(event);
            }
            
            for (const dayString in shiftsByDay) {
                const dayEvents = shiftsByDay[dayString];
                const hasEntrata = dayEvents.some(e => e.type === 'entrata');
                const hasUscita = dayEvents.some(e => e.type === 'uscita');

                if (hasEntrata && !hasUscita) {
                    const firstEvent = dayEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis())[0];
                    const shiftId = dayEvents.map(e => e.id).join(',');
                    
                    const isAlreadyHandledAsSuspended = newItems.some(item => dayEvents.some(de => de.id === item.id));

                    if (!isAlreadyHandledAsSuspended) {
                        newItems.push({
                            id: shiftId,
                            collection: 'timbrature',
                            description: `Turno non terminato del ${format(firstEvent.timestamp.toDate(), 'PPP', { locale: it })}`,
                            date: firstEvent.timestamp.toDate(),
                        });
                    }
                }
            }

            processAndSetNotifications(newItems, 'timbrature');
        }, () => setIsLoading(false));
        unsubs.push(unsubTimbrature);


        // Listener for Requests
        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('status', '==', 'in_attesa'));
        const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data() as PendingRequest;
                return {
                    id: doc.id,
                    collection: 'requests',
                    description: `Richiesta di "${data.type.replace('_', ' ')}" in attesa`,
                    date: data.createdAt?.toDate() || data.startDate?.toDate() || new Date(0),
                } as NotificationItem;
            });
            processAndSetNotifications(items, 'requests');
        }, () => setIsLoading(false));
        unsubs.push(unsubRequests);

        // Listener for Straordinari
        const straordinariQuery = query(collection(firestore, `app-users/${operatorId}/straordinari`), where('status', 'in', ['in_attesa_di_approvazione', 'in_corso']));
        const unsubStraordinari = onSnapshot(straordinariQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data() as PendingStraordinario;
                return {
                    id: doc.id,
                    collection: 'straordinari',
                    description: `Turno straordinario ${data.status.replace(/_/g, ' ')}`,
                    date: data.date?.toDate() || new Date(0),
                } as NotificationItem;
            });
            processAndSetNotifications(items, 'straordinari');
        }, () => setIsLoading(false));
        unsubs.push(unsubStraordinari);


        return () => unsubs.forEach(unsub => unsub());
    }, [firestore, operatorId]);
    
    const handleDeleteItem = async () => {
        if (!firestore || !operatorId || !itemToDelete) return;
        
        const { id, collection } = itemToDelete;

        // Handle synthetic shift deletion for 'in_corso' shifts
        if (collection === 'timbrature' && id.includes(',')) {
            const batch = writeBatch(firestore);
            const eventIds = id.split(',');
            eventIds.forEach(eventId => {
                const docRef = doc(firestore, `app-users/${operatorId}/timbrature`, eventId);
                batch.delete(docRef);
            });
            try {
                await batch.commit();
                toast({ title: 'Successo', description: 'Turno incompleto eliminato.' });
            } catch (error) {
                console.error("Error deleting incomplete shift:", error);
                toast({ title: 'Errore', description: 'Impossibile eliminare il turno.', variant: 'destructive' });
            } finally {
                setItemToDelete(null);
            }
            return;
        }

        // Original logic for single items
        const docRef = doc(firestore, `app-users/${operatorId}/${collection}`, id);

        try {
            await deleteDoc(docRef);
            toast({ title: 'Successo', description: 'Notifica eliminata con successo.' });
        } catch (error) {
            console.error("Error deleting notification item:", error);
            toast({ title: 'Errore', description: 'Impossibile eliminare la notifica.', variant: 'destructive' });
        } finally {
            setItemToDelete(null);
        }
    };
    
    if (isLoading) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!operator) {
        return <div className="text-center text-muted-foreground">Operatore non trovato.</div>;
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-2xl">
                        <BellRing className="h-6 w-6 text-primary" />
                        Centro Notifiche
                    </CardTitle>
                    <CardDescription>
                        Elenco di tutte le azioni in sospeso per {operator.firstName} {operator.lastName}. Da qui puoi eliminare le "notifiche fantasma".
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Descrizione</TableHead>
                                <TableHead className="text-right">Azione</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {notifications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">Nessuna notifica in sospeso.</TableCell>
                                </TableRow>
                            ) : (
                                notifications.map(item => (
                                    <TableRow key={`${item.collection}-${item.id}`}>
                                        <TableCell className="font-medium whitespace-nowrap">
                                            {item.date.getTime() === 0 ? 'Data non valida' : format(item.date, 'PPP p', { locale: it })}
                                        </TableCell>
                                        <TableCell className="capitalize">{item.description}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => setItemToDelete(item)}>
                                                <Trash2 className="h-5 w-5 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            
             <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà l'elemento in modo permanente. Usala per rimuovere notifiche che non corrispondono a turni o richieste reali. L'azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteItem}>Conferma ed Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
