'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where, Timestamp, getDocs, collectionGroup, orderBy } from 'firebase/firestore';
import { Loader2, User, Printer, ChevronLeft, ChevronRight, Eye, MapPin } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription, ResponsiveDialogFooter } from '@/components/ui/responsive-dialog';

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    role: 'operator';
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    latitude?: number;
    longitude?: number;
};

type OperatorDailyTimbrature = {
    operator: Operator;
    timbrature: Timbratura[];
};

export default function DailyClockingReportPage() {
    const firestore = useFirestore();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [dailyData, setDailyData] = useState<OperatorDailyTimbrature[]>([]);
    const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOperatorTimbrature, setSelectedOperatorTimbrature] = useState<OperatorDailyTimbrature | null>(null);

    useEffect(() => {
        if (!firestore) return;
        const operatorsQuery = query(
            collection(firestore, 'app-users'),
            where('role', '==', 'operator'),
            where('username', '!=', 'test')
        );
        const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
            const ops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            ops.sort((a, b) => a.firstName.localeCompare(b.firstName));
            setOperators(ops);
        }, error => {
            console.error("Error fetching operators: ", error);
        });
        return () => unsubscribe();
    }, [firestore]);

    useEffect(() => {
        if (!firestore || operators.length === 0) {
             if (operators.length > 0) setIsLoading(false);
            return;
        }
        setIsLoading(true);

        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        const timbratureQuery = query(
            collectionGroup(firestore, 'timbrature'),
            where('timestamp', '>=', start),
            where('timestamp', '<=', end),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(timbratureQuery, (snapshot) => {
            const timbratureByOperator: Record<string, Timbratura[]> = {};
            
            snapshot.docs.forEach(doc => {
                const operatorId = doc.ref.parent.parent?.id;
                if (operatorId) {
                    if (!timbratureByOperator[operatorId]) {
                        timbratureByOperator[operatorId] = [];
                    }
                    timbratureByOperator[operatorId].push({ id: doc.id, ...doc.data() } as Timbratura);
                }
            });

            const data: OperatorDailyTimbrature[] = operators
                .filter(op => timbratureByOperator[op.id]?.length > 0)
                .map(op => ({
                    operator: op,
                    timbrature: timbratureByOperator[op.id]
                }));
            
            setDailyData(data);
            setIsLoading(false);
        }, error => {
            console.error("Error fetching daily data:", error);
            setIsLoading(false);
        });
        
        return () => unsubscribe();

    }, [firestore, selectedDate, operators]);

    const handleDateChange = (offset: number) => {
        setSelectedDate(prev => addDays(prev, offset));
    };

    const handlePrint = () => {
        window.print();
    };

    const getAvatarFallback = (op: Operator) => `${op.firstName[0] || ''}${op.lastName[0] || ''}`.toUpperCase();

    const formatTime = (timestamp: Timestamp) => format(timestamp.toDate(), 'HH:mm:ss');

    return (
        <div className="space-y-6 print-container" id="printable-area">
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-container, .print-container * {
                        visibility: visible;
                    }
                    .print-container {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .no-print {
                        display: none !important;
                    }
                    main {
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                }
            `}</style>
            <CardHeader className="px-0 pt-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-3xl font-bold tracking-tight">Report Timbrature</CardTitle>
                        <CardDescription>Visualizza e stampa le timbrature di tutti gli operatori per il giorno selezionato.</CardDescription>
                    </div>
                    <Button onClick={handlePrint} className="no-print">
                        <Printer className="mr-2 h-4 w-4" /> Stampa Report
                    </Button>
                </div>
            </CardHeader>

            <div className="flex items-center justify-between gap-2 p-2 border rounded-md no-print">
                <Button variant="outline" size="sm" onClick={() => handleDateChange(-1)}><ChevronLeft className='h-4 w-4 mr-1' /> Prec.</Button>
                <h3 className="text-lg font-semibold text-center capitalize">{format(selectedDate, 'eeee, dd MMMM yyyy', { locale: it })}</h3>
                <Button variant="outline" size="sm" onClick={() => handleDateChange(1)}>Succ. <ChevronRight className='h-4 w-4 ml-1' /></Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : dailyData.length > 0 ? (
                <div className="space-y-4">
                    {dailyData.map(({ operator, timbrature }) => (
                        <Card key={operator.id}>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarFallback>{getAvatarFallback(operator)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <CardTitle className="text-lg">{operator.firstName} {operator.lastName}</CardTitle>
                                            <CardDescription>Codice: {operator.username}</CardDescription>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="no-print" onClick={() => setSelectedOperatorTimbrature({ operator, timbrature })}>
                                        <Eye className="h-5 w-5" />
                                    </Button>
                                </div>
                            </CardHeader>
                             <CardContent className="print-only">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Orario</TableHead>
                                            <TableHead>Evento</TableHead>
                                            <TableHead>Stato</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {timbrature.map(t => (
                                            <TableRow key={t.id}>
                                                <TableCell>{formatTime(t.timestamp)}</TableCell>
                                                <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                                                <TableCell>
                                                     <Badge variant={t.status === 'confermata' ? 'secondary' : t.status === 'rifiutata' ? 'destructive' : 'default'}>
                                                        {t.status}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <p>Nessuna timbratura registrata per questo giorno.</p>
                </div>
            )}
            
            <ResponsiveDialog open={!!selectedOperatorTimbrature} onOpenChange={() => setSelectedOperatorTimbrature(null)}>
                <ResponsiveDialogContent>
                    <ResponsiveDialogHeader>
                        <ResponsiveDialogTitle>Dettaglio Timbrature</ResponsiveDialogTitle>
                        {selectedOperatorTimbrature && (
                           <ResponsiveDialogDescription>
                                {selectedOperatorTimbrature.operator.firstName} {selectedOperatorTimbrature.operator.lastName} - {format(selectedDate, 'PPP', {locale: it})}
                           </ResponsiveDialogDescription>
                        )}
                    </ResponsiveDialogHeader>
                     <div className="max-h-96 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Orario</TableHead>
                                    <TableHead>Evento</TableHead>
                                    <TableHead>Stato</TableHead>
                                    <TableHead>Posizione</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedOperatorTimbrature?.timbrature.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell>{formatTime(t.timestamp)}</TableCell>
                                        <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                                        <TableCell>
                                            <Badge variant={t.status === 'confermata' ? 'secondary' : t.status === 'rifiutata' ? 'destructive' : 'default'}>
                                                {t.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {t.latitude && t.longitude ? (
                                                <a href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                                    <MapPin className="h-4 w-4" /> Mappa
                                                </a>
                                            ) : (
                                                <span>Manuale</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                     <ResponsiveDialogFooter>
                        <Button variant="outline" onClick={() => setSelectedOperatorTimbrature(null)}>Chiudi</Button>
                    </ResponsiveDialogFooter>
                </ResponsiveDialogContent>
            </ResponsiveDialog>
            <style jsx>{`
                .print-only {
                    display: none;
                }
                @media print {
                    .print-only {
                        display: block;
                    }
                }
            `}</style>
        </div>
    );
}
