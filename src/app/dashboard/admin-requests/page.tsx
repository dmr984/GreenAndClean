'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDocs, collectionGroup, query, orderBy, Timestamp, where } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/hooks/use-user';

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
    operatorUsername?: string; // Will be added client-side
};

export default function AdminRequestsPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const requestsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collectionGroup(firestore, 'requests'),
            orderBy('createdAt', 'desc')
        );
    }, [firestore]);


    useEffect(() => {
        if (!firestore || !user || user.role !== 'admin' || !requestsQuery) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        const fetchOperators = async () => {
            const operatorsSnapshot = await getDocs(collection(firestore, 'app-users'));
            const operatorsMap = new Map<string, string>();
            operatorsSnapshot.forEach(doc => {
                operatorsMap.set(doc.id, doc.data().username);
            });
            return operatorsMap;
        };

        const setupListener = (operatorsMap: Map<string, string>) => {
            const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
                const requestsData = snapshot.docs.map(doc => {
                    const data = doc.data() as Omit<Request, 'id' | 'operatorUsername'>;
                    const userId = doc.ref.parent.parent?.id; //  requests are in a subcollection
                    
                    if (!userId) return null;

                    return {
                        id: doc.id,
                        userId: userId,
                        ...data,
                        operatorUsername: operatorsMap.get(userId) || 'Sconosciuto',
                    } as Request;
                }).filter((req): req is Request => req !== null);
                
                setRequests(requestsData);
                setIsLoading(false);
            }, (error) => {
                console.error("Error fetching requests:", error);
                if (error.code === 'permission-denied' && firestore) {
                    const contextualError = new FirestorePermissionError({
                        operation: 'list',
                        path: 'requests (collection group)',
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({
                        title: "Errore",
                        description: "Impossibile caricare le richieste.",
                        variant: "destructive",
                    });
                }
                setIsLoading(false);
            });
            return unsubscribe;
        }


        let unsubscribe: (() => void) | undefined;

        const main = async () => {
             try {
                const operators = await fetchOperators();
                unsubscribe = setupListener(operators);
            } catch(error) {
                 console.error("Error fetching operators:", error);
                toast({
                    title: "Errore",
                    description: "Impossibile caricare i dati degli operatori.",
                    variant: "destructive",
                });
                setIsLoading(false);
            }
        }
        
        main();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };

    }, [firestore, user, requestsQuery, toast]);

    const handleUpdateRequestStatus = (request: Request, newStatus: 'approvato' | 'rifiutato') => {
        if (!firestore) return;

        const requestDocRef = doc(firestore, `app-users/${request.userId}/requests`, request.id);
        
        const updatePayload = { status: newStatus };

        updateDoc(requestDocRef, updatePayload)
          .then(() => {
             toast({
                title: "Successo",
                description: `Richiesta ${newStatus === 'approvato' ? 'approvata' : 'rifiutata'}.`,
            });
          })
          .catch(async (error: any) => {
             if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({
                    operation: 'update',
                    path: requestDocRef.path,
                    requestResourceData: updatePayload
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({
                    title: "Errore",
                    description: "Impossibile aggiornare la richiesta.",
                    variant: "destructive",
                });
            }
        });
    };
    
    if (isUserLoading) {
        return (
             <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user || user.role !== 'admin') {
        return (
             <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm mt-6">
              <div className="flex flex-col items-center gap-1 text-center">
                <h3 className="text-2xl font-bold tracking-tight">
                  Accesso Negato
                </h3>
                <p className="text-sm text-muted-foreground">
                  Non hai i permessi per visualizzare questa pagina.
                </p>
              </div>
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <ClipboardList className="h-6 w-6 text-primary" />
                    <CardTitle className="text-2xl">Gestione Richieste Operatori</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Operatore</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Dal</TableHead>
                                    <TableHead>Al</TableHead>
                                    <TableHead>Ore</TableHead>
                                    <TableHead>Stato</TableHead>
                                    <TableHead className="text-right">Azioni</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center h-24">Nessuna richiesta trovata.</TableCell>
                                    </TableRow>
                                ) : (
                                    requests.map((req) => (
                                        <TableRow key={`${req.userId}-${req.id}`}>
                                            <TableCell className="font-medium">{req.operatorUsername}</TableCell>
                                            <TableCell className="capitalize">{req.type.replace('_', ' ')}</TableCell>
                                            <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                                            <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                                            <TableCell>{req.hours || '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    req.status === 'approvato' ? 'secondary' 
                                                    : req.status === 'rifiutato' ? 'destructive' 
                                                    : 'default'
                                                }
                                                className={req.status === 'in_attesa' ? 'bg-yellow-500 text-white' : ''}
                                                >
                                                    {req.status.replace('_', ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {req.status === 'in_attesa' && (
                                                    <div className="flex gap-2 justify-end">
                                                        <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req, 'approvato')}>
                                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => handleUpdateRequestStatus(req, 'rifiutato')}>
                                                            <XCircle className="h-5 w-5 text-red-500" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
