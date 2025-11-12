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

type SupplyRequest = { id: string; user: string; items: { [key: string]: number }; status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale'; fulfilledItems?: { [key: string]: number }; adminNotes?: string };

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
        case "Parziale": return "outline";
        default: return "secondary";
    }
};

export default function UserSuppliesPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.userId as string;
    const firestore = useFirestore();

    const [userName, setUserName] = useState<string | null>(null);
    const [supplyRequests, setSupplyRequests] = useState<SupplyRequest[]>([]);
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

                    const allSupplies = getFromStorage<SupplyRequest[]>('supply-requests', []);
                    setSupplyRequests(allSupplies.filter(r => r.user === currentUserName).sort((a,b) => b.id.localeCompare(a.id)));
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
            <h2 className="text-3xl font-bold tracking-tight">Storico Richieste Forniture di {userName}</h2>
            <Card>
                <CardHeader>
                    <CardTitle>Riepilogo Richieste</CardTitle>
                    <CardDescription>Visualizza tutte le richieste di forniture inviate dall'operatore.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[calc(100vh-20rem)]">
                        {supplyRequests.length > 0 ? (
                            <div className="space-y-4">
                                {supplyRequests.map(req => (
                                    <Card key={req.id}>
                                        <CardHeader className="flex flex-row justify-between items-start pb-3">
                                            <div>
                                                <p className="font-semibold">Richiesta del {new Date().toLocaleDateString('it-IT')}</p>
                                                <p className="text-sm text-muted-foreground">ID: {req.id}</p>
                                            </div>
                                            <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2 text-sm">
                                                {Object.entries(req.items).map(([name, qty]) => (
                                                    <div key={name} className="flex justify-between border-b pb-2 last:border-none">
                                                        <span>{name}</span>
                                                        <div className="text-right">
                                                            <p>Richiesti: <span className="font-medium">{qty}</span></p>
                                                            <p>Consegnati: <span className="font-bold">{req.fulfilledItems ? req.fulfilledItems[name] ?? 0 : '-'}</span></p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {req.adminNotes && (
                                                <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                                                    <h4 className="font-semibold">Note Admin:</h4>
                                                    <p className="text-muted-foreground">{req.adminNotes}</p>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : <p className="text-center text-muted-foreground py-16">Nessuna richiesta di forniture trovata.</p>}
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
