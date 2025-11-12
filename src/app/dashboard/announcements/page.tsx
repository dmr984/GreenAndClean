"use client";

import * as React from "react";
import { Megaphone, Send, Users, User, Trash2, MoreVertical } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFirestore } from "@/firebase";
import { collection, onSnapshot, addDoc, doc, updateDoc, arrayUnion, deleteDoc } from "firebase/firestore";


type AppUser = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  date: string;
  recipients: string[]; // 'all' or array of user IDs
  readBy: string[]; // array of user IDs who have read it
  hiddenFor: string[]; // array of user IDs who have hidden it
};

export default function AnnouncementsPage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [userRole, setUserRole] = React.useState<string|null>(null);
    const [userId, setUserId] = React.useState<string|null>(null);
    const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
    
    // Admin state
    const [operators, setOperators] = React.useState<AppUser[]>([]);
    const [title, setTitle] = React.useState("");
    const [content, setContent] = React.useState("");
    const [recipientType, setRecipientType] = React.useState("all");
    const [selectedOperators, setSelectedOperators] = React.useState<string[]>([]);
    
    const [isHardDeleteDialogOpen, setIsHardDeleteDialogOpen] = React.useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = React.useState<Announcement | null>(null);
    

    React.useEffect(() => {
        if (!firestore) return;

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        setUserRole(storedUser.role || null);
        setUserId(storedUser.id || null);

        const usersUnsub = onSnapshot(collection(firestore, 'app-users'), (snapshot) => {
             const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser))
                                .filter(u => u.role === 'operator');
            setOperators(userList);
        });

        const announcementsUnsub = onSnapshot(collection(firestore, 'announcements'), (snapshot) => {
            const allAnnouncements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement));
            
            if (storedUser.role === 'admin' && storedUser.id) {
                setAnnouncements(allAnnouncements.filter(a => !a.hiddenFor.includes(storedUser.id!)));
            } else if (storedUser.id) {
                 const userAnnouncements = allAnnouncements
                    .filter(a => (a.recipients.includes('all') || a.recipients.includes(storedUser.id!)) && !a.hiddenFor.includes(storedUser.id!));
                setAnnouncements(userAnnouncements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            }
        });

        return () => {
            usersUnsub();
            announcementsUnsub();
        }

    }, [firestore]);

    const handleSelectOperator = (operatorId: string) => {
        setSelectedOperators(prev => 
            prev.includes(operatorId) 
            ? prev.filter(id => id !== operatorId) 
            : [...prev, operatorId]
        );
    };

    const handleSendAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore) return;

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

        try {
            await addDoc(collection(firestore, "announcements"), {
                title,
                content,
                date: new Date().toISOString(),
                recipients,
                readBy: [],
                hiddenFor: []
            });

            toast({ title: "Annuncio Inviato", description: "Il tuo annuncio è stato inviato con successo." });
    
            // Reset form
            setTitle("");
            setContent("");
            setRecipientType("all");
            setSelectedOperators([]);

        } catch (error) {
             toast({ title: "Errore", description: "Impossibile inviare l'annuncio.", variant: "destructive" });
        }
    };
    
    const markAsRead = async (id: string) => {
        if (!userId || !firestore) return;
        const target = announcements.find(a => a.id === id);
        if (target && !target.readBy.includes(userId)) {
            const docRef = doc(firestore, 'announcements', id);
            await updateDoc(docRef, { readBy: arrayUnion(userId) });
        }
    };
    
    const hideForCurrentUser = async (id: string) => {
        if (!userId || !firestore) return;
        const target = announcements.find(a => a.id === id);
        if (target && !target.hiddenFor.includes(userId)) {
             const docRef = doc(firestore, 'announcements', id);
            await updateDoc(docRef, { hiddenFor: arrayUnion(userId) });
            toast({ title: "Annuncio Nascosto"});
        }
    };
    
    const openHardDeleteDialog = (announcement: Announcement) => {
        setSelectedAnnouncement(announcement);
        setIsHardDeleteDialogOpen(true);
    };
    
    const handleHardDelete = async () => {
        if (!selectedAnnouncement || !firestore) return;
        try {
            await deleteDoc(doc(firestore, 'announcements', selectedAnnouncement.id));
            toast({ title: "Annuncio Eliminato per Tutti", variant: "destructive" });
            setIsHardDeleteDialogOpen(false);
            setSelectedAnnouncement(null);
        } catch (error) {
             toast({ title: "Errore", description: "Impossibile eliminare l'annuncio.", variant: "destructive" });
        }
    };
    
    const isAdmin = userRole === 'admin';
    const sortedAnnouncements = [...announcements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    if (isAdmin && userId) {
        return (
          <>
            <div className="flex flex-col gap-8">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Gestione Annunci</h2>
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
                                                          <Label htmlFor={`op-${op.id}`} className="font-normal text-base">{op.username}</Label>
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
                
                <Card>
                    <CardHeader>
                        <CardTitle>Bacheca Annunci Inviati</CardTitle>
                        <CardDescription>Tutte le comunicazioni inviate. Da qui puoi nasconderle o eliminarle per tutti.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[70vh]">
                        {sortedAnnouncements.length > 0 ? (
                            <div className="space-y-4 pr-4">
                                {sortedAnnouncements.map(ann => (
                                     <Card key={ann.id} className="bg-muted/30">
                                        <CardHeader className="pb-3">
                                            <div className="flex justify-between items-start">
                                               <div className="flex-1">
                                                 <CardTitle className="text-base">{ann.title}</CardTitle>
                                                 <CardDescription>{new Date(ann.date).toLocaleString('it-IT')}</CardDescription>
                                               </div>
                                               <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Azioni</DropdownMenuLabel>
                                                        <DropdownMenuItem onSelect={() => hideForCurrentUser(ann.id)}>Nascondi per me</DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onSelect={() => openHardDeleteDialog(ann)} className="text-destructive">Elimina per tutti</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
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
                                <p className="mt-4">Nessun annuncio inviato.</p>
                            </div>
                        )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
            
            <AlertDialog open={isHardDeleteDialogOpen} onOpenChange={setIsHardDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                           Questa azione non può essere annullata. L'annuncio verrà eliminato in modo permanente per te e per tutti gli operatori.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleHardDelete}>Conferma Eliminazione</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </>
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
                    {sortedAnnouncements.length > 0 ? (
                        <div className="space-y-4 pr-4">
                            {sortedAnnouncements.map(ann => {
                                const isRead = ann.readBy.includes(userId!);
                                return (
                                 <Card key={ann.id} onClick={() => markAsRead(ann.id)} className={`transition-colors ${isRead ? 'bg-muted/50' : 'hover:bg-muted/20 cursor-pointer'}`}>
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                           <div className="flex-1">
                                             <CardTitle className="text-base">{ann.title}</CardTitle>
                                             <CardDescription>{new Date(ann.date).toLocaleString('it-IT')}</CardDescription>
                                           </div>
                                            <div className="flex items-center gap-2">
                                                {!isRead && <Badge variant="destructive">Nuovo</Badge>}
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); hideForCurrentUser(ann.id); }}>
                                                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Nascondi</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm whitespace-pre-wrap">{ann.content}</p>
                                    </CardContent>
                                 </Card>
                                )
                            })}
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
