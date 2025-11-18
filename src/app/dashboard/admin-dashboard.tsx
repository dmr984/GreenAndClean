'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Loader2, Users, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type Operator = {
    id: string;
    username: string;
};

export function AdminDashboard() {
    const firestore = useFirestore();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore) {
            setIsLoading(false);
            return;
        }

        const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));

        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            usersData.sort((a,b) => a.username.localeCompare(b.username, undefined, { numeric: true }));
            setOperators(usersData);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching operators:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [firestore]);
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className='flex items-center gap-3'>
                        <Users className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Accesso Rapido Operatori</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-24">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : operators.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {operators.map(operator => (
                                <Link key={operator.id} href={`/dashboard/operators/${operator.id}`} passHref>
                                    <Button variant="outline" className="w-full h-20 justify-start p-4 text-left">
                                        <div className='flex items-center gap-3'>
                                            <User className='h-5 w-5 flex-shrink-0'/>
                                            <span className='truncate font-semibold'>{operator.username}</span>
                                        </div>
                                    </Button>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center p-8 text-muted-foreground">
                            <p>Nessun operatore trovato.</p>
                            <p className='text-sm mt-2'>Puoi aggiungere nuovi operatori dalla sezione "Gestione Operatori" nel menu.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
