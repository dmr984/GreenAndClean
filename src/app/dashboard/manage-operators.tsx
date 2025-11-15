'use client';
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Operator = {
    id: string;
    username: string;
    role: 'operator';
    visibleInLogin: boolean;
};

export function ManageOperators() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const operatorsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'app-users');
    }, [firestore]);

    useEffect(() => {
        if (!operatorsQuery) {
            setIsLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(user => user.role === 'operator') as Operator[];
            
            usersData.sort((a,b) => {
                const aNum = parseInt(a.username.split(' ')[1] || '0');
                const bNum = parseInt(b.username.split(' ')[1] || '0');
                return aNum - bNum;
            });

            setOperators(usersData);
            setIsLoading(false);
        }, (error) => {
            if (error.code === 'permission-denied' && firestore) {
                 const contextualError = new FirestorePermissionError({
                    operation: 'list',
                    path: 'app-users',
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({
                    title: "Errore",
                    description: "Impossibile caricare gli operatori.",
                    variant: "destructive",
                });
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [operatorsQuery, toast, firestore]);

    const handleVisibilityChange = (operatorId: string, newVisibility: boolean) => {
        if (!firestore) return;
        const operatorRef = doc(firestore, 'app-users', operatorId);
        const updatePayload = { visibleInLogin: newVisibility };
        
        // Optimistically update UI
        setOperators(prev => prev.map(op => op.id === operatorId ? { ...op, visibleInLogin: newVisibility } : op));

        updateDoc(operatorRef, updatePayload)
            .then(() => {
                 toast({
                    title: "Successo",
                    description: `Visibilità di ${operators.find(op => op.id === operatorId)?.username} aggiornata.`
                });
            })
            .catch((error) => {
                // Revert UI change on failure
                setOperators(prev => prev.map(op => op.id === operatorId ? { ...op, visibleInLogin: !newVisibility } : op));

                if (error.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'update',
                        path: operatorRef.path,
                        requestResourceData: updatePayload
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({
                        title: "Errore",
                        description: "Impossibile aggiornare la visibilità.",
                        variant: "destructive",
                    });
                }
            });
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Users className="h-6 w-6 text-primary" />
                    <CardTitle className="text-2xl">Gestione Operatori</CardTitle>
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
                                    <TableHead>Nome Operatore</TableHead>
                                    <TableHead className="text-right w-[150px]">Visibile nel Login</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {operators.map((operator) => (
                                    <TableRow key={operator.id}>
                                        <TableCell className="font-medium">{operator.username}</TableCell>
                                        <TableCell className="text-right">
                                            <Switch
                                                checked={operator.visibleInLogin}
                                                onCheckedChange={(checked) => handleVisibilityChange(operator.id, checked)}
                                                aria-label={`Toggle visibility for ${operator.username}`}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                 <p className="text-sm text-muted-foreground mt-4">
                    Disattiva l'interruttore per nascondere un operatore dalla schermata di login.
                </p>
            </CardContent>
        </Card>
    );
}
