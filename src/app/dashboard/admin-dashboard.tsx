'use client';
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

type Operator = {
    id: string;
    username: string;
    role: 'operator';
    visibleInLogin: boolean;
};

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

interface AdminDashboardProps {
  user: UserData | null;
}

export function AdminDashboard({ user }: AdminDashboardProps) {
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const operatorsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        return q;
    }, [firestore]);

    useEffect(() => {
        if (!operatorsQuery || !user || user.role !== 'admin' ) {
            setIsLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() })) as Operator[];
            
            usersData.sort((a,b) => a.username.localeCompare(b.username, undefined, { numeric: true }));

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
    }, [operatorsQuery, toast, firestore, user]);

    if (!user) {
        return <div className="flex items-center justify-center h-full">Caricamento utente...</div>;
    }
    
    const navigateToOperator = (operatorId: string) => {
        router.push(`/dashboard/operators/${operatorId}`);
    };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Users className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Accesso Operatori</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : operators.length > 0 ? (
                         <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {operators.map((operator) => (
                                <Button
                                    key={operator.id}
                                    variant="outline"
                                    className="h-20 flex flex-col gap-2 items-center justify-center"
                                    onClick={() => navigateToOperator(operator.id)}
                                >
                                    <User className="h-5 w-5" />
                                    <span className="text-center">{operator.username}</span>
                                </Button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-10">
                            Nessun operatore trovato. Aggiungine uno dalla sezione "Gestione Operatori".
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
