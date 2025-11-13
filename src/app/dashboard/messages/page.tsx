"use client";

import * as React from "react";
import { Send, MessageSquare, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useFirestore } from "@/firebase";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, where } from "firebase/firestore";


type Communication = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
  read: boolean;
};

const getAvatarFallback = (name?: string) => {
    if (!name) return "??";
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

const generateEmailFromName = (name: string) => {
    if (!name) return "";
    return `${name.toLowerCase().replace(/\s+/g, '.')}@serveco.it`;
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

    // State for delete confirmation dialog
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const [selectedCommId, setSelectedCommId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!firestore) return;
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdmin = storedUser.role === 'admin';
        setUserRole(storedUser.role || null);
        setCurrentUserId(storedUser.id || null);
        setCurrentUserName(storedUser.username || null);

        let unsubscribe = () => {};

        if (isAdmin) {
            // For admin, we will temporarily not load all communications to avoid permission errors.
            // This part of the component will show a message instead.
            setCommunications([]);
            setLoading(false);
        } else if (storedUser.id) {
            const q = query(collection(firestore, 'communications'), where('userId', '==', storedUser.id));
            unsubscribe = onSnapshot(q, (snapshot) => {
                const userComms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Communication));
                setCommunications(userComms.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
                setLoading(false);
            }, (error) => {
                console.error("Error fetching communications:", error);
                toast({ variant: "destructive", title: "Errore di caricamento", description: "Impossibile caricare le comunicazioni." });
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
        
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

    const handleDeleteClick = (id: string) => {
        setSelectedCommId(id);
        setIsDeleteDialogOpen(true);
    }

    const handleDeleteConfirm = async () => {
        if (!selectedCommId || !firestore) return;
        try {
            await deleteDoc(doc(firestore, 'communications', selectedCommId));
            toast({ title: "Comunicazione eliminata" });
        } catch (error) {
             toast({ title: "Errore", description: "Impossibile eliminare la comunicazione.", variant: "destructive" });
        } finally {
            setIsDeleteDialogOpen(false);
            setSelectedCommId(null);
        }
    }

    const markAsRead = async (id: string) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, 'communications', id), { read: true });
        } catch (error) {
            console.error("Failed to mark as read:", error);
        }
    };

    const isAdmin = userRole === 'admin';
    const operatorCommunications = communications.filter(c => c.userId === currentUserId);
    
    if (loading) {
        return <div className="flex items-center justify-center h-full"><p>Caricamento...</p></div>
    }

    if (isAdmin) {
        return (
             <>
             <Card>
                <CardHeader>
                    <CardTitle>Bacheca Comunicazioni</CardTitle>
                    <CardDescription>Visualizza le comunicazioni inviate dagli operatori.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center text-muted-foreground py-16">
                        <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-4">La visualizzazione delle comunicazioni per l'admin è in fase di manutenzione.</p>
                    </div>
                </CardContent>
            </Card>
            </>
        )
    }

    // Operator View
    return (
        <div className="flex flex-col gap-8">
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
            <Card>
                <CardHeader>
                    <CardTitle>Cronologia Comunicazioni Inviate</CardTitle>
                </CardHeader>
                <CardContent>
                     {operatorCommunications.length === 0 ? (
                        <div className="text-center text-muted-foreground py-12">
                            <p>Non hai ancora inviato nessuna comunicazione.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {operatorCommunications.map(comm => (
                                <div key={comm.id} className="border p-4 rounded-md bg-muted/50">
                                    <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
                                        <span>Inviato il: {new Date(comm.timestamp).toLocaleString('it-IT')}</span>
                                        {comm.read && <Badge variant="secondary">Letto</Badge>}
                                    </div>
                                    <p>{comm.text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
