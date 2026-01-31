'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Loader2, Users, User, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format, startOfDay } from 'date-fns';

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
    shiftId?: string;
};

type Shift = {
    id: string;
    status: 'in_sospeso' | 'in_corso' | 'confermato' | 'rifiutato';
    events: Timbratura[];
}

type PendingCounts = {
    shifts: number;
    leaves: number;
    overtime: number;
}

export function AdminDashboard() {
    const firestore = useFirestore();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingCounts, setPendingCounts] = useState<Record<string, PendingCounts>>({});
    const [lastRefresh, setLastRefresh] = useState(Date.now());

    const forceRefresh = () => {
        setPendingCounts({});
        setLastRefresh(Date.now());
    };

    useEffect(() => {
        if (!firestore) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        
        const unsubscribeOperators = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            usersData.sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName, undefined, { numeric: true }));
            setOperators(usersData);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching operators:", error);
            setIsLoading(false);
        });

        return () => unsubscribeOperators();
    }, [firestore, lastRefresh]);

    useEffect(() => {
        if (!firestore || operators.length === 0) {
            return;
        }
        
        const unsubscribers: (() => void)[] = [];

        operators.forEach(op => {
            // --- Listener for Shifts (Timbrature) ---
            const shiftsQuery = collection(firestore, `app-users/${op.id}/timbrature`);
            const unsubShifts = onSnapshot(shiftsQuery, (shiftSnapshot) => {
                const allTimbrature = shiftSnapshot.docs.map(d => ({id: d.id, ...d.data() as Timbratura}));
                
                const shiftsByDay: { [key: string]: Timbratura[] } = {};
                
                for (const event of allTimbrature) {
                    const dayString = format(event.timestamp.toDate(), 'yyyy-MM-dd');
                    if (!shiftsByDay[dayString]) shiftsByDay[dayString] = [];
                    shiftsByDay[dayString].push(event);
                }

                const groupedShifts: Shift[] = [];
                for (const dayString in shiftsByDay) {
                    const events = shiftsByDay[dayString];
                    if (events.length === 0) continue;

                    let status: Shift['status'];
                    const isComplete = events.some(e => e.type === 'uscita');
                    const hasPending = events.some(e => e.status === 'sospesa');
                    const allConfirmed = events.every(e => e.status === 'confermata');
                    
                    if (isComplete) {
                        if (hasPending) {
                            status = 'in_sospeso';
                        } else if (allConfirmed) {
                            status = 'confermato';
                        } else {
                            status = 'in_sospeso';
                        }
                    } else {
                        status = 'in_corso';
                    }
                    
                    groupedShifts.push({ id: dayString, status, events });
                }
                
                const pendingShiftsCount = groupedShifts.filter(s => s.status === 'in_sospeso' || s.status === 'in_corso').length;

                setPendingCounts(prev => ({
                    ...prev,
                    [op.id]: { ...(prev[op.id] || {shifts: 0, leaves: 0, overtime: 0}), shifts: pendingShiftsCount }
                }));
            });
            unsubscribers.push(unsubShifts);

            // --- Listener for Leave Requests ---
            const leavesQuery = query(collection(firestore, `app-users/${op.id}/requests`), where('status', '==', 'in_attesa'));
            const unsubLeaves = onSnapshot(leavesQuery, (leaveSnapshot) => {
                setPendingCounts(prev => ({
                    ...prev,
                    [op.id]: { ...(prev[op.id] || {shifts: 0, leaves: 0, overtime: 0}), leaves: leaveSnapshot.size }
                }));
            });
            unsubscribers.push(unsubLeaves);

            // --- Listener for Overtime Shifts ---
            const overtimeQuery = query(collection(firestore, `app-users/${op.id}/straordinari`), where('status', 'in', ['in_attesa_di_approvazione', 'in_corso']));
            const unsubOvertime = onSnapshot(overtimeQuery, (overtimeSnapshot) => {
                setPendingCounts(prev => ({
                    ...prev,
                    [op.id]: { ...(prev[op.id] || {shifts: 0, leaves: 0, overtime: 0}), overtime: overtimeSnapshot.size }
                }));
            });
            unsubscribers.push(unsubOvertime);
        });

        // Cleanup all listeners on component unmount or when dependencies change
        return () => {
            unsubscribers.forEach(unsub => unsub());
        };

    }, [firestore, operators]);
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className='flex items-center justify-between'>
                        <div className="flex items-center gap-3">
                           <Users className="h-6 w-6 text-primary" />
                           <CardTitle className="text-2xl">Accesso Rapido Operatori</CardTitle>
                        </div>
                        <Button variant="outline" size="icon" onClick={forceRefresh}>
                            <RefreshCw className="h-4 w-4" />
                            <span className="sr-only">Azzera Notifiche</span>
                        </Button>
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
                                const totalPending = (pending?.shifts || 0) + (pending?.leaves || 0) + (pending?.overtime || 0);
                                return (
                                <Link key={operator.id} href={`/dashboard/operators/${operator.id}`} passHref>
                                    <Button variant="outline" className="w-full h-20 justify-start p-4 text-left relative">
                                        <div className='flex items-center gap-3'>
                                            <User className='h-5 w-5 flex-shrink-0'/>
                                            <div className="flex flex-col">
                                                <span className='truncate font-semibold'>{`${operator.firstName} ${operator.lastName}`}</span>
                                                <span className='text-xs text-muted-foreground truncate'>Codice: {operator.username}</span>
                                            </div>
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
    