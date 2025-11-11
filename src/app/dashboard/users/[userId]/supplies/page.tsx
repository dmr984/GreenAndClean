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

type SupplyRequest = { id: string; user: string; items: { [key: string]: number }; status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale'; fulfilledItems?: { [key: string]: number }; };

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

                    // Fetch data that depends on username
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
                                <CardHeader className="flex flex-row justify-between items-center pb-3">
                                     <p className="font-semibold">Richiesta del {new Date().toLocaleDateString('it-IT')}</p>
                                     <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative w-full overflow-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Prodotto</th>
                                                    <th className="px-4 py-2 text-center font-medium text-muted-foreground">Qt. Richiesta</th>
                                                    <th className="px-4 py-2 text-center font-medium text-muted-foreground">Qt. Consegnata</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(req.items).map(([name, qty]) => (
                                                    <tr key={name} className="border-b">
                                                        <td className="p-4 align-middle">{name}</td>
                                                        <td className="p-4 align-middle text-center">{qty}</td>
                                                        <td className="p-4 align-middle text-center font-bold">{req.fulfilledItems ? req.fulfilledItems[name] ?? 0 : '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
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
