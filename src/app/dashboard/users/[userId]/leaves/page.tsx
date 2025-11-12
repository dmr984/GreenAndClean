'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';

type LeaveRequest = { id: string; user: string; type: string; from: string; to: string; timeFrom?: string; timeTo?: string; status: 'In attesa' | 'Approvata' | 'Rifiutata'; reason?: string };

const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const saveToStorage = <T,>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('storage'));
};

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case "Approvata": return "default";
        case "In attesa": return "secondary";
        case "Rifiutata": return "destructive";
        default: return "secondary";
    }
};

export default function UserLeavesPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.userId as string;
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [userName, setUserName] = useState<string | null>(null);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedRequestToDelete, setSelectedRequestToDelete] = useState<string | null>(null);

    useEffect(() => {
        const fetchUserData = async () => {
            if (!userId || !firestore) return;

            setLoading(true);
            
            try {
                const userDocRef = doc(firestore, 'app-users', userId);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const currentUserName = userData.username;
                    setUserName(currentUserName);

                    // Fetch data that depends on username
                    const allLeaves = getFromStorage<LeaveRequest[]>('leave-requests', []);
                    setLeaveRequests(allLeaves.filter(r => r.user === currentUserName).sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime()));
                } else {
                    setUserName(null);
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
                setUserName(null);
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, [userId, firestore]);

    const openDeleteConfirmation = (requestId: string) => {
        setSelectedRequestToDelete(requestId);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteRequest = () => {
        if (!selectedRequestToDelete) return;
        
        const allLeaves = getFromStorage<LeaveRequest[]>('leave-requests', []);
        const updatedLeaves = allLeaves.filter(r => r.id !== selectedRequestToDelete);
        saveToStorage('leave-requests', updatedLeaves);

        setLeaveRequests(prev => prev.filter(r => r.id !== selectedRequestToDelete));
        
        toast({ title: "Richiesta eliminata", description: "La richiesta è stata rimossa con successo.", variant: "destructive"});
        setIsDeleteDialogOpen(false);
        setSelectedRequestToDelete(null);
    };

    if (loading) {
        return (
            <div className="p-4 md:p-6 space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    if (!userName) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <h2 className="text-2xl font-bold mb-4">Utente non trovato</h2>
            <Button onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Torna Indietro
            </Button>
          </div>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-6">
                <h2 className="text-3xl font-bold tracking-tight">Storico Ferie e Permessi di {userName}</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Riepilogo Richieste</CardTitle>
                        <CardDescription>Visualizza tutte le richieste di ferie e permessi inviate.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {leaveRequests.length > 0 ? (
                            <>
                                {/* Mobile View - Cards */}
                                <div className="md:hidden space-y-4">
                                    {leaveRequests.map(req => {
                                        const fromDate = new Date(req.from).toLocaleDateString('it-IT');
                                        const toDate = new Date(req.to).toLocaleDateString('it-IT');
                                        let period = fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;
                                        if (req.type === 'Permesso' && req.timeFrom && req.timeTo) {
                                            period += ` (${req.timeFrom}-${req.timeTo})`;
                                        }
                                        return (
                                            <Card key={req.id} className="w-full">
                                                <CardHeader className="flex flex-row justify-between items-start pb-2">
                                                    <CardTitle className="text-base">{req.type}</CardTitle>
                                                    <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                                                </CardHeader>
                                                <CardContent className="space-y-1 text-sm pb-2">
                                                    <p><span className="font-medium">Periodo:</span> {period}</p>
                                                    <p><span className="font-medium">Motivo:</span> {req.reason || '-'}</p>
                                                </CardContent>
                                                <CardFooter className="pb-3 pt-1 flex justify-end">
                                                    <Button variant="ghost" size="icon" onClick={() => openDeleteConfirmation(req.id)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                        <span className="sr-only">Elimina</span>
                                                    </Button>
                                                </CardFooter>
                                            </Card>
                                        );
                                    })}
                                </div>
                                {/* Desktop View - Table */}
                                <div className="hidden md:block">
                                    <ScrollArea className="h-[calc(100vh-22rem)]">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Periodo</th>
                                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
                                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Motivo</th>
                                                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Stato</th>
                                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Azioni</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {leaveRequests.map(req => {
                                                    const fromDate = new Date(req.from).toLocaleDateString('it-IT');
                                                    const toDate = new Date(req.to).toLocaleDateString('it-IT');
                                                    let period = fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;
                                                    if (req.type === 'Permesso' && req.timeFrom && req.timeTo) {
                                                        period += ` (${req.timeFrom}-${req.timeTo})`;
                                                    }
                                                    return (
                                                        <tr key={req.id} className="border-b">
                                                            <td className="p-4 align-middle font-medium">{period}</td>
                                                            <td className="p-4 align-middle">{req.type}</td>
                                                            <td className="p-4 align-middle text-muted-foreground truncate max-w-xs">{req.reason || '-'}</td>
                                                            <td className="p-4 align-middle text-center"><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></td>
                                                            <td className="p-4 align-middle text-right">
                                                                <Button variant="ghost" size="icon" onClick={() => openDeleteConfirmation(req.id)}>
                                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                                    <span className="sr-only">Elimina</span>
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </ScrollArea>
                                </div>
                            </>
                        ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di ferie o permesso trovata.</p>}
                    </CardContent>
                </Card>
            </div>
            
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione non può essere annullata. La richiesta verrà eliminata in modo permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSelectedRequestToDelete(null)}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteRequest}>Conferma Eliminazione</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
