'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Loader2, Users, User, Circle, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

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
    status: 'in_sospeso' | 'in_corso' | 'confermato';
    events: Timbratura[];
}


export function AdminDashboard() {
    const firestore = useFirestore();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingCounts, setPendingCounts] = useState<Record<string, {shifts: number, leaves: number, overtime: number}>>({});

    useEffect(() => {
        if (!firestore) {
            setIsLoading(false);
            return;
        }

        const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribeOperators = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            usersData.sort((a,b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName, undefined, { numeric: true }));
            setOperators(usersData);
            setIsLoading(false);

            // For each operator, set up listeners for pending items
            usersData.forEach(op => {
                const shiftsQuery = collection(firestore, `app-users/${op.id}/timbrature`);
                 onSnapshot(shiftsQuery, (shiftSnapshot) => {
                    const allTimbrature = shiftSnapshot.docs.map(d => ({id: d.id, ...d.data() as Timbratura}));

                    const shiftsByDay: { [key: string]: Timbratura[] } = {};
                    const shiftsByManualId: { [key: string]: Timbratura[] } = {};
                    
                    for (const event of allTimbrature) {
                        if (event.shiftId) {
                            if (!shiftsByManualId[event.shiftId]) shiftsByManualId[event.shiftId] = [];
                            shiftsByManualId[event.shiftId].push(event);
                        } else {
                            const dayString = format(event.timestamp.toDate(), 'yyyy-MM-dd');
                            if (!shiftsByDay[dayString]) shiftsByDay[dayString] = [];
                            shiftsByDay[dayString].push(event);
                        }
                    }

                    const groupedShifts: Shift[] = [];
                    const processEvents = (events: Timbratura[], id: string) => {
                        const isComplete = events.some(e => e.type === 'uscita');
                        const hasPending = events.some(e => e.status === 'sospesa');
                        
                        let status: Shift['status'];
                        if (hasPending && isComplete) status = 'in_sospeso';
                        else if (!isComplete) status = 'in_corso';
                        else status = 'confermato';

                        groupedShifts.push({ id, status, events });
                    }
                    
                    // Process manual shifts
                    for (const shiftId in shiftsByManualId) {
                        processEvents(shiftsByManualId[shiftId], shiftId);
                    }

                    // Process automatic shifts
                    for (const day in shiftsByDay) {
                        let currentShiftEvents: Timbratura[] = [];
                        const sortedEvents = shiftsByDay[day].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                        for (const event of sortedEvents) {
                            currentShiftEvents.push(event);
                            if (event.type === 'uscita') {
                                const shiftId = currentShiftEvents.map(e => e.id).sort().join('-');
                                processEvents(currentShiftEvents, shiftId);
                                currentShiftEvents = [];
                            }
                        }
                        if (currentShiftEvents.length > 0) {
                            const shiftId = currentShiftEvents.map(e => e.id).sort().join('-');
                            processEvents(currentShiftEvents, shiftId);
                        }
                    }
                    
                    const pendingShiftsCount = groupedShifts.filter(s => s.status === 'in_sospeso').length;
                     setPendingCounts(prev => ({
                        ...prev,
                        [op.id]: { ...(prev[op.id] || {shifts: 0, leaves: 0, overtime: 0}), shifts: pendingShiftsCount }
                    }));
                });


                // Pending Leave Requests
                const leavesQuery = query(collection(firestore, `app-users/${op.id}/requests`), where('status', '==', 'in_attesa'));
                onSnapshot(leavesQuery, (leaveSnapshot) => {
                     setPendingCounts(prev => ({
                        ...prev,
                        [op.id]: { ...(prev[op.id] || {shifts: 0, leaves: 0, overtime: 0}), leaves: leaveSnapshot.size }
                    }));
                });

                // Pending Overtime Shifts
                const overtimeQuery = query(collection(firestore, `app-users/${op.id}/straordinari`), where('status', '==', 'in_attesa_di_approvazione'));
                onSnapshot(overtimeQuery, (overtimeSnapshot) => {
                    setPendingCounts(prev => ({
                        ...prev,
                        [op.id]: { ...(prev[op.id] || {shifts: 0, leaves: 0, overtime: 0}), overtime: overtimeSnapshot.size }
                    }));
                });
            });

        }, (error) => {
            console.error("Error fetching operators:", error);
            setIsLoading(false);
        });


        return () => {
            unsubscribeOperators();
        };
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
