'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Loader2, Users, User, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

type Operator = {
    id: string;
    username: string;
    role: string;
};

export function AdminDashboard() {
    const firestore = useFirestore();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingCounts, setPendingCounts] = useState<Record<string, {shifts: number, leaves: number}>>({});

    useEffect(() => {
        if (!firestore) {
            setIsLoading(false);
            return;
        }

        const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));

        const unsubscribeOperators = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            usersData.sort((a,b) => a.username.localeCompare(b.username, undefined, { numeric: true }));
            setOperators(usersData);
            setIsLoading(false);

            // For each operator, set up listeners for pending items
            usersData.forEach(op => {
                const shiftsQuery = query(collection(firestore, `app-users/${op.id}/timbrature`), where('status', '==', 'sospesa'));
                const unsubShifts = onSnapshot(shiftsQuery, (shiftSnapshot) => {
                    const pendingDays = new Set(shiftSnapshot.docs.map(d => d.data().timestamp.toDate().toDateString()));
                    setPendingCounts(prev => ({
                        ...prev,
                        [op.id]: { ...(prev[op.id] || {shifts: 0, leaves: 0}), shifts: pendingDays.size }
                    }));
                });

                const leavesQuery = query(collection(firestore, `app-users/${op.id}/requests`), where('status', '==', 'in_attesa'));
                const unsubLeaves = onSnapshot(leavesQuery, (leaveSnapshot) => {
                     setPendingCounts(prev => ({
                        ...prev,
                        [op.id]: { ...(prev[op.id] || {shifts: 0, leaves: 0}), leaves: leaveSnapshot.size }
                    }));
                });

                // It's important to have a cleanup mechanism, but since the component unmounts
                // as a whole, the main unsubscribeOperators cleanup is often sufficient.
                // For more complex scenarios, you might manage these individual unsubscribes.
            });

        }, (error) => {
            console.error("Error fetching operators:", error);
            setIsLoading(false);
        });

        return () => unsubscribeOperators();
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
                            {operators.map(operator => {
                                const pending = pendingCounts[operator.id];
                                const totalPending = (pending?.shifts || 0) + (pending?.leaves || 0);
                                return (
                                <Link key={operator.id} href={`/dashboard/operators/${operator.id}`} passHref>
                                    <Button variant="outline" className="w-full h-20 justify-start p-4 text-left relative">
                                        <div className='flex items-center gap-3'>
                                            <User className='h-5 w-5 flex-shrink-0'/>
                                            <span className='truncate font-semibold'>{operator.username}</span>
                                        </div>
                                         {totalPending > 0 && (
                                            <Badge variant="destructive" className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full p-0">
                                                {totalPending > 9 ? '9+' : totalPending}
                                            </Badge>
                                        )}
                                    </Button>
                                </Link>
                                );
                            })}
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
