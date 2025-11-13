"use client";

import * as React from "react";
import { Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useFirestore } from "@/firebase";
import { collection, onSnapshot, addDoc, query, where, orderBy, doc, updateDoc } from "firebase/firestore";

type Communication = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
  read: boolean;
};

export default function CommunicationsPage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [userRole, setUserRole] = React.useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
    const [currentUserName, setCurrentUserName] = React.useState<string | null>(null);
    const [communications, setCommunications] = React.useState<Communication[]>([]);
    const [newCommunication, setNewCommunication] = React.useState("");
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (!firestore) return;
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdmin = storedUser.role === 'admin';
        setUserRole(storedUser.role || null);
        setCurrentUserId(storedUser.id || null);
        setCurrentUserName(storedUser.username || null);

        let q;
        if(isAdmin) {
             q = query(collection(firestore, 'communications'), orderBy('timestamp', 'desc'));
        } else if (storedUser.id) {
             q = query(collection(firestore, 'communications'), where('userId', '==', storedUser.id), orderBy('timestamp', 'desc'));
        } else {
            setLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const comms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Communication));
            setCommunications(comms);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching communications:", error);
            toast({ variant: "destructive", title: "Errore di caricamento", description: "Impossibile caricare le comunicazioni." });
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [firestore, toast]);

    const handleSendCommunication = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCommunication.trim() || !currentUserId || !currentUserName || !firestore) {
            toast({ variant: "destructive", title: "Errore", description: "Impossibile inviare comunicazione vuota." });
            return;
        }

        const communication = {
            userId: currentUserId,
            userName: currentUserName,
            text: newCommunication.trim(),
            timestamp: new Date().toISOString(),
            read: false,
        };

        try {
            await addDoc(collection(firestore, 'communications'), communication);
            setNewCommunication("");
            toast({ title: "Comunicazione Inviata", description: "La tua comunicazione è stata inviata all'amministratore." });
        } catch (error) {
            toast({ title: "Errore", description: "Impossibile inviare la comunicazione.", variant: "destructive" });
        }
    };
    
     const markAsRead = async (id: string) => {
        if (!firestore || userRole !== 'admin') return;
        const commRef = doc(firestore, 'communications', id);
        const targetComm = communications.find(c => c.id === id);
        if (targetComm && !targetComm.read) {
            try {
                await updateDoc(commRef, { read: true });
            } catch (error) {
                console.error("Failed to mark as read:", error);
            }
        }
    };
    
    const isAdmin = userRole === 'admin';

    if (loading) {
        return <div className="flex items-center justify-center h-full"><p>Caricamento...</p></div>
    }

    return (
        <div className="flex flex-col gap-8">
             {!isAdmin && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Invia una Comunicazione</CardTitle>
                        <CardDescription>
                            Invia una segnalazione o una richiesta all'amministratore. Non è una chat in tempo reale.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSendCommunication} className="space-y-4">
                            <Textarea 
                              value={newCommunication}
                              onChange={(e) => setNewCommunication(e.target.value)}
                              placeholder="Scrivi qui la tua comunicazione..."
                              rows={6}
                              required
                            />
                            <Button type="submit" disabled={!newCommunication.trim()}>
                                <Send className="mr-2 h-4 w-4" /> Invia Comunicazione
                            </Button>
                        </form>
                    </CardContent>
                </Card>
             )}
            <Card>
                <CardHeader>
                    <CardTitle>{isAdmin ? "Bacheca Comunicazioni" : "Cronologia Comunicazioni Inviate"}</CardTitle>
                </CardHeader>
                <CardContent>
                     {communications.length === 0 ? (
                        <div className="text-center text-muted-foreground py-16">
                             <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-4">Nessuna comunicazione da mostrare.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {communications.map(comm => (
                                <div key={comm.id} className={`border p-4 rounded-md ${isAdmin && !comm.read ? 'bg-primary/10 border-primary cursor-pointer' : 'bg-muted/50'}`}
                                 onClick={() => markAsRead(comm.id)}
                                >
                                    <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
                                        <span className="font-semibold">{comm.userName}</span>
                                        <span>{new Date(comm.timestamp).toLocaleString('it-IT')}</span>
                                    </div>
                                    <p>{comm.text}</p>
                                     {isAdmin && !comm.read && <Badge variant="destructive" className="mt-2">Nuovo</Badge>}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
