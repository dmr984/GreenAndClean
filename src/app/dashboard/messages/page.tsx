"use client";

import * as React from "react";
import { Send, MessageSquare, User, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Communication = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
  read: boolean;
};

// Generic function to get data from localStorage
const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

// Generic function to save data to localStorage
const saveToStorage = <T,>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('storage'));
};

const getAvatarFallback = (name?: string) => {
    if (!name) return "??";
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export default function CommunicationsPage() {
    const { toast } = useToast();
    const [userRole, setUserRole] = React.useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
    const [currentUserName, setCurrentUserName] = React.useState<string | null>(null);
    const [communications, setCommunications] = React.useState<Communication[]>([]);
    const [newCommunication, setNewCommunication] = React.useState("");
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const role = getFromStorage<string|null>('userRole', null);
        const userId = getFromStorage<string|null>('userId', null);
        const userName = getFromStorage<string|null>('userName', null);

        setUserRole(role);
        setCurrentUserId(userId);
        setCurrentUserName(userName);

        const handleStorageChange = () => {
            const allComms = getFromStorage<Communication[]>('communications', []);
            setCommunications(allComms.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        };

        handleStorageChange(); // Initial load
        window.addEventListener('storage', handleStorageChange);
        setLoading(false);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    const handleSendCommunication = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCommunication.trim() || !currentUserId || !currentUserName) {
            toast({ variant: "destructive", title: "Errore", description: "Impossibile inviare comunicazione vuota." });
            return;
        }

        const communication: Communication = {
            id: `COM${Date.now()}`,
            userId: currentUserId,
            userName: currentUserName,
            text: newCommunication.trim(),
            timestamp: new Date().toISOString(),
            read: false,
        };

        const updatedCommunications = [communication, ...communications];
        setCommunications(updatedCommunications);
        saveToStorage('communications', updatedCommunications);
        setNewCommunication("");
        toast({ title: "Comunicazione Inviata", description: "La tua comunicazione è stata inviata all'amministratore." });
    };

    const markAsRead = (id: string) => {
        const updated = communications.map(c => c.id === id ? { ...c, read: true } : c);
        setCommunications(updated);
        saveToStorage('communications', updated);
        window.dispatchEvent(new Event('storage')); // Trigger update for badges
    };

    const isAdmin = userRole === 'admin';
    const operatorCommunications = communications.filter(c => c.userId === currentUserId);
    
    if (loading) {
        return <div className="flex items-center justify-center h-full"><p>Caricamento...</p></div>
    }

    if (isAdmin) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>Bacheca Comunicazioni</CardTitle>
                    <CardDescription>Visualizza le comunicazioni inviate dagli operatori.</CardDescription>
                </CardHeader>
                <CardContent>
                    {communications.length === 0 ? (
                        <div className="text-center text-muted-foreground py-16">
                             <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-4">Nessuna comunicazione ricevuta.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {communications.map(comm => (
                                <Card key={comm.id} className={comm.read ? 'bg-muted/50' : 'bg-secondary'}>
                                    <CardHeader className="flex flex-row justify-between items-start pb-2">
                                        <div className="flex items-center gap-3">
                                            <Avatar>
                                                <AvatarFallback>{getAvatarFallback(comm.userName)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-semibold">{comm.userName}</p>
                                                <p className="text-xs text-muted-foreground">{new Date(comm.timestamp).toLocaleString('it-IT')}</p>
                                            </div>
                                        </div>
                                        {!comm.read && <Badge variant="destructive">Nuova</Badge>}
                                    </CardHeader>
                                    <CardContent>
                                        <p className="whitespace-pre-wrap">{comm.text}</p>
                                        {!comm.read && (
                                            <div className="text-right mt-2">
                                                <Button size="sm" variant="outline" onClick={() => markAsRead(comm.id)}>
                                                    <CheckCircle className="mr-2 h-4 w-4" /> Segna come letto
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
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
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Inviato il: {new Date(comm.timestamp).toLocaleString('it-IT')}
                                    </p>
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