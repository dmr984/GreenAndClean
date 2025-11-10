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
};

const getUsersFromStorage = (): User[] => {
    if (typeof window === 'undefined') return [];
    const storedUsers = localStorage.getItem('app-users');
    return storedUsers ? JSON.parse(storedUsers) : [];
};

const getAnnouncementsFromStorage = (): Announcement[] => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem('announcements');
    return stored ? JSON.parse(stored) : [];
};

const saveAnnouncementsToStorage = (announcements: Announcement[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('announcements', JSON.stringify(announcements));
    window.dispatchEvent(new Event('storage'));
};


export default function AnnouncementsPage() {
    const { toast } = useToast();
    const [operators, setOperators] = React.useState<User[]>([]);
    const [title, setTitle] = React.useState("");
    const [content, setContent] = React.useState("");
    const [recipientType, setRecipientType] = React.useState("all");
    const [selectedOperators, setSelectedOperators] = React.useState<string[]>([]);

    React.useEffect(() => {
        setOperators(getUsersFromStorage());
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