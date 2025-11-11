'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';


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
    
    const [userName, setUserName] = useState<string | null>(null);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);

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
        <div className="flex flex-col gap-6">
            <h2 className="text-3xl font-bold tracking-tight">Storico Ferie e Permessi di {userName}</h2>
            <Card>
                <CardHeader>
                    <CardTitle>Riepilogo Richieste</CardTitle>
                    <CardDescription>Visualizza tutte le richieste di ferie e permessi inviate.</CardDescription>
                </CardHeader>
                <CardContent>
                     <ScrollArea className="h-[calc(100vh-20rem)]">
                     {leaveRequests.length > 0 ? (
                        <div className="relative w-full overflow-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Periodo</th>
                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tipo</th>
                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Motivo</th>
                                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Stato</th>
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
                                return(
                                    <tr key={req.id} className="border-b">
                                        <td className="p-4 align-middle font-medium">{period}</td>
                                        <td className="p-4 align-middle">{req.type}</td>
                                        <td className="p-4 align-middle text-muted-foreground truncate max-w-xs hidden sm:table-cell">{req.reason || '-'}</td>
                                        <td className="p-4 align-middle text-right"><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></td>
                                    </tr>
                                )
                                })}
                                </tbody>
                            </table>
                        </div>
                     ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di ferie o permesso trovata.</p>}
                     </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
