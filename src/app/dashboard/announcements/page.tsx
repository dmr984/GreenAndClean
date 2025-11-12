"use client";

import * as React from "react";
import { Megaphone, Send, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";

type User = {
  id: string;
  name: string;
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  date: string;
  recipients: string[]; // 'all' or array of user IDs
  read?: boolean;
};

const getFromStorage = <T,>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(key);
    try {
        return stored ? JSON.parse(stored) : defaultValue;
    } catch(e) {
        return defaultValue;
    }
};

const saveToStorage = (key: string, data: any) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event('storage'));
};

const getUsersFromStorage = (): User[] => {
    const storedUsers = getFromStorage<{id: string; username: string}[]>('app-users', []);
    return storedUsers.map(u => ({ id: u.id, name: u.username }));
};

const getAnnouncementsFromStorage = (): Announcement[] => {
    return getFromStorage<Announcement[]>('announcements', []);
};

const saveAnnouncementsToStorage = (announcements: Announcement[]) => {
    saveToStorage('announcements', announcements);
};


export default function AnnouncementsPage() {
    const { toast } = useToast();
    const [userRole, setUserRole] = React.useState<string|null>(null);
    const [userId, setUserId] = React.useState<string|null>(null);
    const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
    
    // Admin state
    const [operators, setOperators] = React.useState<User[]>([]);
    const [title, setTitle] = React.useState("");
    const [content, setContent] = React.useState("");
    const [recipientType, setRecipientType] = React.useState("all");
    const [selectedOperators, setSelectedOperators] = React.useState<string[]>([]);
    

    React.useEffect(() => {
        const storedUser = getFromStorage<{role?: string, id?: string}>('user', {});
        setUserRole(storedUser.role || null);
        setUserId(storedUser.id || null);

        const handleStorageChange = () => {
            const allAnnouncements = getAnnouncementsFromStorage();
            if (storedUser.role === 'admin') {
                setOperators(getUsersFromStorage().filter(u => u.name !== 'Amministratore'));
                setAnnouncements(allAnnouncements);
            } else if (storedUser.id) {
                 const readAnnouncements = getFromStorage<string[]>('read-announcements', []);
                 const userAnnouncements = allAnnouncements
                    .filter(a => a.recipients.includes('all') || a.recipients.includes(storedUser.id!))
                    .map(a => ({...a, read: readAnnouncements.includes(a.id)}));
                setAnnouncements(userAnnouncements);
            }
        };

        handleStorageChange();
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);

    }, []);

    const handleSelectOperator = (operatorId: string) => {
        setSelectedOperators(prev => 
            prev.includes(operatorId) 
            ? prev.filter(id => id !== operatorId) 
            : [...prev, operatorId]
        );
    };

    const handleSendAnnouncement = (e: React.FormEvent) => {
        e.preventDefault();

        if (!title || !content) {
            toast({ title: "Campi mancanti", description: "Titolo e contenuto sono obbligatori.", variant: "destructive" });
            return;
        }
        
        let recipients: string[] = [];
        if (recipientType === 'all') {
            recipients = ['all'];
        } else if (recipientType === 'specific') {
            if (selectedOperators.length === 0) {
                 toast({ title: "Nessun destinatario", description: "Seleziona almeno un operatore.", variant: "destructive" });
                 return;
            }
            recipients = selectedOperators;
        }

        const newAnnouncement: Announcement = {
            id: `ANN${Date.now()}`,
            title,
            content,
            date: new Date().toISOString(),
            recipients
        };

        const existingAnnouncements = getAnnouncementsFromStorage();
        saveAnnouncementsToStorage([newAnnouncement, ...existingAnnouncements]);

        toast({ title: "Annuncio Inviato", description: "Il tuo annuncio è stato inviato con successo." });

        // Reset form
        setTitle("");
        setContent("");
        setRecipientType("all");
        setSelectedOperators([]);
    };
    
    const markAsRead = (id: string) => {
        const readAnnouncements = getFromStorage<string[]>('read-announcements', []);
        if(!readAnnouncements.includes(id)) {
            saveToStorage('read-announcements', [...readAnnouncements, id]);
        }
    };
    
    const isAdmin = userRole === 'admin';
    
    if (isAdmin) {
        return (
            <div className="flex flex-col gap-8">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Invia un Annuncio</h2>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Crea Nuovo Annuncio</CardTitle>
                        <CardDescription>
                            Scrivi un messaggio e scegli a chi inviarlo. Sarà visualizzato nella dashboard degli operatori.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSendAnnouncement} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="title" className="text-base">Titolo</Label>
                                <Input id="title" placeholder="Es. Riunione importante" value={title} onChange={e => setTitle(e.target.value)} required />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="content" className="text-base">Contenuto del Messaggio</Label>
                                <Textarea id="content" placeholder="Scrivi qui il tuo messaggio..." value={content} onChange={e => setContent(e.target.value)} required  rows={5}/>
                            </div>

                            <div className="space-y-4">
                                <Label className="text-base">Destinatari</Label>
                                 <RadioGroup value={recipientType} onValueChange={setRecipientType}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="all" id="r-all" />
                                        <Label htmlFor="r-all" className="flex items-center gap-2"><Users className="h-5 w-5"/> Invia a tutti gli operatori</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="specific" id="r-specific" />
                                        <Label htmlFor="r-specific" className="flex items-center gap-2"><User className="h-5 w-5"/> Seleziona operatori specifici</Label>
                                    </div>
                                </RadioGroup>

                                {recipientType === 'specific' && (
                                    <Card>
                                        <CardHeader className="p-4">
                                          <CardTitle className="text-lg">Seleziona Operatori</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                          <ScrollArea className="h-48">
                                              <div className="space-y-3">
                                                  {operators.map(op => (
                                                      <div key={op.id} className="flex items-center space-x-3">
                                                          <Checkbox 
                                                            id={`op-${op.id}`}
                                                            checked={selectedOperators.includes(op.id)}
                                                            onCheckedChange={() => handleSelectOperator(op.id)}
                                                          />
                                                          <Label htmlFor={`op-${op.id}`} className="font-normal text-base">{op.name}</Label>
                                                      </div>
                                                  ))}
                                              </div>
                                          </ScrollArea>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>

                            <Button type="submit" className="w-full sm:w-auto" size="lg">
                                <Send className="mr-2 h-5 w-5" /> Invia Annuncio
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Operator view
    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Annunci</h2>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>Bacheca Annunci</CardTitle>
                    <CardDescription>Tutte le comunicazioni ricevute dall'amministrazione.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[70vh]">
                    {announcements.length > 0 ? (
                        <div className="space-y-4 pr-4">
                            {announcements.map(ann => (
                                 <Card key={ann.id} onClick={() => markAsRead(ann.id)} className={`cursor-pointer transition-colors ${ann.read ? 'bg-muted/50' : 'hover:bg-muted/20'}`}>
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-center">
                                           <CardTitle className="text-base">{ann.title}</CardTitle>
                                           {!ann.read && <Badge variant="destructive">Nuovo</Badge>}
                                        </div>
                                        <CardDescription>{new Date(ann.date).toLocaleString('it-IT')}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm whitespace-pre-wrap">{ann.content}</p>
                                    </CardContent>
                                 </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-16">
                            <Megaphone className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-4">Nessun annuncio presente.</p>
                        </div>
                    )}
                    </ScrollArea>
                </CardContent>
             </Card>
        </div>
    );
}
