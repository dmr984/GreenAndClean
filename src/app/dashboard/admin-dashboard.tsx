'use client';
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, collectionGroup } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

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
    const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

    const operatorsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
    }, [firestore]);

    useEffect(() => {
        if (!operatorsQuery || user?.role !== 'admin') {
            setIsLoading(false);
            return;
        }

        const unsubscribeOperators = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Operator[];
            usersData.sort((a,b) => a.username.localeCompare(b.username, undefined, { numeric: true }));
            setOperators(usersData);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching operators:", error);
            toast({ title: "Errore", description: "Impossibile caricare gli operatori.", variant: "destructive" });
            setIsLoading(false);
        });
        
        const pendingShiftsQuery = query(collectionGroup(firestore, 'timbrature'), where('status', '==', 'sospesa'));
        const pendingLeaveQuery = query(collectionGroup(firestore, 'requests'), where('status', '==', 'in_attesa'));
        const pendingSupplyQuery = query(collectionGroup(firestore, 'supply-requests'), where('status', '==', 'in_attesa'));

        const countPending = (query: any, itemType: string) => onSnapshot(query, (snapshot) => {
            const counts: Record<string, number> = {};
            snapshot.forEach(doc => {
                const userId = doc.data().userId;
                counts[userId] = (counts[userId] || 0) + 1;
            });

            setPendingCounts(prev => {
                const newCounts = { ...prev };
                // Reset counts for this type
                Object.keys(newCounts).forEach(key => {
                    if (key.startsWith(itemType)) delete newCounts[key];
                });
                // Add new counts
                Object.entries(counts).forEach(([userId, count]) => {
                    newCounts[`${itemType}_${userId}`] = count;
                });
                return newCounts;
            });

        }, (error) => console.error(`Error counting ${itemType}:`, error));

        const unsubShifts = countPending(pendingShiftsQuery, 'shifts');
        const unsubLeave = countPending(pendingLeaveQuery, 'leave');
        const unsubSupply = countPending(pendingSupplyQuery, 'supply');

        return () => {
            unsubscribeOperators();
            unsubShifts();
            unsubLeave();
            unsubSupply();
        };

    }, [operatorsQuery, user, firestore, toast]);

    if (!user) {
        return <div className="flex items-center justify-center h-full">Caricamento utente...</div>;
    }

    const getTotalPendingForOperator = (operatorId: string) => {
        let total = 0;
        if(pendingCounts[`shifts_${operatorId}`]) total += 1; // Treat all pending shifts for a day as one notification item
        if(pendingCounts[`leave_${operatorId}`]) total += pendingCounts[`leave_${operatorId}`];
        if(pendingCounts[`supply_${operatorId}`]) total += pendingCounts[`supply_${operatorId}`];
        return total;
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
                            {operators.map((operator) => {
                                const pendingCount = getTotalPendingForOperator(operator.id);
                                return (
                                    <Button
                                        key={operator.id}
                                        variant="outline"
                                        className="h-24 flex flex-col gap-2 items-center justify-center relative"
                                        onClick={() => navigateToOperator(operator.id)}
                                    >
                                        {pendingCount > 0 && (
                                            <Badge variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center rounded-full p-0">
                                                {pendingCount}
                                            </Badge>
                                        )}
                                        <User className="h-6 w-6" />
                                        <span className="text-center text-sm">{operator.username}</span>
                                    </Button>
                                );
                            })}
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
