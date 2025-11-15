'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { collection, query, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Briefcase, Plus, Hash, Plane, UserCheck, Stethoscope, Loader2, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

type Request = {
    id: string;
    userId: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'in_attesa' | 'approvato' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number; // Only for 'permesso' and 'straordinario'
    reason: string;
}

type Timbratura = {
    id: string;
    userId: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata';
};

// The user prop is passed from the layout
export default function MonthlySummaryPage({ user }: { user: UserData | null }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [requests, setRequests] = useState<Request[]>([]);
    const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const { startOfMonth, endOfMonth } = useMemo(() => {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
        return {
            startOfMonth: Timestamp.fromDate(start),
            endOfMonth: Timestamp.fromDate(end),
        };
    }, [currentDate]);

    useEffect(() => {
        if (!firestore || !user) {
            if(!user) setIsLoadingData(false); // If user is null, stop loading
            return;
        }

        setIsLoadingData(true);

        const requestsQuery = query(
            collection(firestore, `app-users/${user.id}/requests`),
            where('startDate', '>=', startOfMonth),
            where('startDate', '<=', endOfMonth)
        );
        
        const timbratureQuery = query(
            collection(firestore, `app-users/${user.id}/timbrature`),
            where('timestamp', '>=', startOfMonth),
            where('timestamp', '<=', endOfMonth)
        );

        const unsubscribeRequests = onSnapshot(requestsQuery, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Request[];
                setRequests(data);
                setIsLoadingData(false); // Stop loading after requests are fetched
            },
            (error) => {
                console.error("Error fetching requests:", error);
                toast({ title: "Errore", description: "Impossibile caricare le richieste.", variant: "destructive" });
                setIsLoadingData(false);
            }
        );
        
        const unsubscribeTimbrature = onSnapshot(timbratureQuery, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Timbratura[];
                setTimbrature(data);
            },
            (error) => {
                 console.error("Error fetching timbrature:", error);
                 toast({ title: "Errore", description: "Impossibile caricare le timbrature.", variant: "destructive" });
            }
        );

        return () => {
            unsubscribeRequests();
            unsubscribeTimbrature();
        };
    }, [firestore, user, startOfMonth, endOfMonth, toast]);
    
    const summary = useMemo(() => {
        const workedDays = new Set(
            timbrature
                .filter(t => t.type === 'entrata')
                .map(t => t.timestamp.toDate().toDateString())
        ).size;
        
        let workedHours = 0;
        const entries = timbrature.filter(t => t.type === 'entrata').sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());
        entries.forEach(entry => {
            const correspondingExit = timbrature.find(t => t.type === 'uscita' && t.timestamp.toMillis() > entry.timestamp.toMillis());
            if(correspondingExit) {
                workedHours += (correspondingExit.timestamp.toMillis() - entry.timestamp.toMillis()) / (1000 * 60 * 60);
            }
        });


        const approvedRequests = requests.filter(r => r.status === 'approvato');

        return {
            workedDays,
            workedHours: workedHours.toFixed(2),
            overtimeHours: approvedRequests.filter(r => r.type === 'straordinario').reduce((sum, r) => sum + (r.hours || 0), 0),
            ferieDays: approvedRequests.filter(r => r.type === 'ferie').reduce((sum, r) => sum + ((r.endDate.toMillis() - r.startDate.toMillis()) / (1000 * 60 * 60 * 24) + 1), 0),
            permessoHours: approvedRequests.filter(r => r.type === 'permesso').reduce((sum, r) => sum + (r.hours || 0), 0),
            malattiaDays: approvedRequests.filter(r => r.type === 'malattia').reduce((sum, r) => sum + ((r.endDate.toMillis() - r.startDate.toMillis()) / (1000 * 60 * 60 * 24) + 1), 0),
        };
    }, [timbrature, requests]);

    const handleMonthChange = (value: string) => {
        const [year, month] = value.split('-').map(Number);
        setCurrentDate(new Date(year, month - 1, 1));
    }
    
    const monthOptions = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(currentDate.getFullYear(), i);
        return { value: `${d.getFullYear()}-${String(i+1).padStart(2, '0')}`, label: d.toLocaleString('it-IT', { month: 'long' }) };
    });

    if (!user) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Attendere il caricamento dei dati utente...</p>
            </div>
        );
    }
    
     if (isLoadingData) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className='flex items-center gap-3'>
                    <Calendar className="h-8 w-8 text-primary" />
                    <h2 className="text-3xl font-bold tracking-tight">Riepilogo Mensile</h2>
                </div>
                <div className="flex gap-2">
                    <Select onValueChange={handleMonthChange} defaultValue={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Seleziona Mese" />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                     <Button>
                        <Plus className="mr-2 h-4 w-4" /> Nuova Richiesta
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle>
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.workedDays}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ore Lavorate</CardTitle>
                        <Hash className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.workedHours}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Straordinari (ore)</CardTitle>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.overtimeHours}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ferie (giorni)</CardTitle>
                        <Plane className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.ferieDays}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Permessi (ore)</CardTitle>
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.permessoHours}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Malattia (giorni)</CardTitle>
                        <Stethoscope className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.malattiaDays}</div>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <List className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Dettaglio Richieste del Mese</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Data Inizio</TableHead>
                                    <TableHead>Data Fine</TableHead>
                                    <TableHead>Quantità</TableHead>
                                    <TableHead className="text-right">Stato</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.length > 0 ? requests.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell className="font-medium capitalize">{req.type}</TableCell>
                                        <TableCell>{req.startDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                                        <TableCell>{req.endDate.toDate().toLocaleDateString('it-IT')}</TableCell>
                                        <TableCell>{req.hours ? `${req.hours} ore` : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={req.status === 'approvato' ? 'secondary' : req.status === 'rifiutato' ? 'destructive' : 'default'}>
                                                {req.status.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center">Nessuna richiesta trovata per questo mese.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
