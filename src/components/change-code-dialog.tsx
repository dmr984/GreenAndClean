'use client';

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { doc, getDoc, updateDoc, query, where, collection, getDocs } from "firebase/firestore";
import { 
  getNotificationSettings, 
  saveNotificationSettings, 
  NotificationSettings, 
  DEFAULT_NOTIFICATION_SETTINGS 
} from "@/lib/notification-service";
import { Bell, KeyRound, CheckCircle2, ShieldCheck, Loader2, RotateCcw, MessageSquareCode, Sliders } from "lucide-react";

interface ChangeCodeDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    userId: string | null;
    role?: 'admin' | 'operator';
}

export function ChangeCodeDialog({ isOpen, onOpenChange, userId, role }: ChangeCodeDialogProps) {
    const { toast } = useToast();
    const [operatorCode, setOperatorCode] = React.useState("");
    const [activeTab, setActiveTab] = React.useState<string>("code");
    const [notifSubTab, setNotifSubTab] = React.useState<string>("events");
    const [isSavingCode, setIsSavingCode] = React.useState(false);
    const [isSavingNotifications, setIsSavingNotifications] = React.useState(false);
    
    // Impostazioni notifiche admin
    const [notifSettings, setNotifSettings] = React.useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
    const firestore = useFirestore();

    React.useEffect(() => {
        if (isOpen && userId && firestore) {
            const fetchUserAndSettings = async () => {
                try {
                    const userDocRef = doc(firestore, 'app-users', userId);
                    const docSnap = await getDoc(userDocRef);
                    if (docSnap.exists()) {
                        setOperatorCode(docSnap.data().username || "");
                    }

                    if (role === 'admin') {
                        const settings = await getNotificationSettings(firestore);
                        setNotifSettings(settings);
                    }
                } catch (e) {
                    console.error("Errore nel caricamento impostazioni:", e);
                }
            };
            fetchUserAndSettings();
        }
    }, [isOpen, userId, role, firestore]);

    const handleCodeChange = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!userId || !firestore) {
             toast({ variant: "destructive", title: "Errore", description: "Utente o database non trovato." });
             return;
        }

        setIsSavingCode(true);
        try {
            const userDocRef = doc(firestore, 'app-users', userId);
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                 toast({ variant: "destructive", title: "Errore", description: "Utente non trovato." });
                 setIsSavingCode(false);
                 return;
            }

            const userData = userDoc.data();
            const updates: { username?: string } = {};

            if (operatorCode && operatorCode !== userData.username) {
                const usersRef = collection(firestore, 'app-users');
                const q = query(usersRef, where("username", "==", operatorCode.trim()));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    toast({ variant: "destructive", title: "Codice Esistente", description: "Questo codice di accesso è già in uso." });
                    setIsSavingCode(false);
                    return;
                }

                updates.username = operatorCode.trim();
            }

            if (Object.keys(updates).length > 0) {
                 await updateDoc(userDocRef, updates);
                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                const updatedUser = { ...storedUser, username: operatorCode.trim() };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                window.dispatchEvent(new Event('storage'));
                toast({ title: "Profilo Aggiornato", description: "Il codice di accesso è stato salvato con successo." });
            }

            resetAndClose();

        } catch (error: any) {
             console.error("Error updating profile:", error);
             toast({ 
                variant: "destructive", 
                title: "Errore", 
                description: "Si è verificato un errore durante il salvataggio."
            });
        } finally {
            setIsSavingCode(false);
        }
    };

    const handleSaveNotificationSettings = async () => {
        if (!firestore) return;
        setIsSavingNotifications(true);
        try {
            await saveNotificationSettings(firestore, notifSettings);
            toast({
                title: "Preferenze Notifiche Salvate ✅",
                description: "Le impostazioni e la struttura dei messaggi sono state aggiornate con successo.",
            });
            resetAndClose();
        } catch (error) {
            console.error("Errore salvataggio impostazioni notifiche:", error);
            toast({
                variant: "destructive",
                title: "Errore",
                description: "Impossibile salvare le preferenze notifiche.",
            });
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const handleResetToDefaultTemplates = () => {
        setNotifSettings(prev => ({
            ...prev,
            templateShiftApprovedTitle: DEFAULT_NOTIFICATION_SETTINGS.templateShiftApprovedTitle,
            templateShiftApprovedBody: DEFAULT_NOTIFICATION_SETTINGS.templateShiftApprovedBody,
            templateShiftRejectedTitle: DEFAULT_NOTIFICATION_SETTINGS.templateShiftRejectedTitle,
            templateShiftRejectedBody: DEFAULT_NOTIFICATION_SETTINGS.templateShiftRejectedBody,
            templateRequestApprovedTitle: DEFAULT_NOTIFICATION_SETTINGS.templateRequestApprovedTitle,
            templateRequestApprovedBody: DEFAULT_NOTIFICATION_SETTINGS.templateRequestApprovedBody,
            templateRequestRejectedTitle: DEFAULT_NOTIFICATION_SETTINGS.templateRequestRejectedTitle,
            templateRequestRejectedBody: DEFAULT_NOTIFICATION_SETTINGS.templateRequestRejectedBody,
            templateShiftModifiedTitle: DEFAULT_NOTIFICATION_SETTINGS.templateShiftModifiedTitle,
            templateShiftModifiedBody: DEFAULT_NOTIFICATION_SETTINGS.templateShiftModifiedBody,
        }));
        toast({
            title: "Testi Predefiniti Ripristinati",
            description: "Ricorda di cliccare su 'Salva Preferenze Notifiche' per confermare le modifiche.",
        });
    };
    
    const resetAndClose = () => {
        onOpenChange(false);
    };
    
    const handleOpenChange = (open: boolean) => {
        if(!open) {
            resetAndClose();
        }
        onOpenChange(open);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className={role === 'admin' ? "w-[96vw] max-w-6xl h-[94vh] max-h-[96vh] flex flex-col p-4 sm:p-6" : "sm:max-w-md"}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {role === 'admin' ? 'Impostazioni Amministrazione' : 'Modifica Profilo'}
                    </DialogTitle>
                    <DialogDescription>
                        {role === 'admin' 
                            ? 'Gestisci il tuo codice di accesso, gli eventi di notifica e la struttura dei messaggi inviati agli operatori.'
                            : 'Modifica il tuo codice di accesso per il login.'}
                    </DialogDescription>
                </DialogHeader>

                {role === 'admin' ? (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col overflow-hidden">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="code" className="flex items-center gap-2">
                                <KeyRound className="h-4 w-4" />
                                Codice Accesso
                            </TabsTrigger>
                            <TabsTrigger value="notifications" className="flex items-center gap-2">
                                <Bell className="h-4 w-4" />
                                Notifiche Operatori
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="code" className="pt-3">
                            <form id="change-code-form" onSubmit={handleCodeChange} className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="admin-code">Codice Amministratore</Label>
                                    <Input 
                                        id="admin-code" 
                                        name="admin-code" 
                                        type="text" 
                                        value={operatorCode}
                                        onChange={(e) => setOperatorCode(e.target.value)}
                                        placeholder="Inserisci il nuovo codice"
                                        required 
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Questo codice viene utilizzato per eseguire il login come amministratore.
                                    </p>
                                </div>
                                <DialogFooter className="pt-4 flex-col-reverse sm:flex-row gap-2 sm:gap-0">
                                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Annulla</Button>
                                    <Button type="submit" disabled={isSavingCode}>
                                        {isSavingCode && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Salva Codice
                                    </Button>
                                </DialogFooter>
                            </form>
                        </TabsContent>

                        <TabsContent value="notifications" className="pt-3 flex-1 flex flex-col overflow-hidden space-y-3">
                            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                <span>
                                    Configura quando e come il telefono dell'operatore riceve le notifiche push (con suono, vibrazione e pop-up a schermo).
                                </span>
                            </div>

                            {/* Sotto-tab per dividere interruttori ed editing template */}
                            <Tabs value={notifSubTab} onValueChange={setNotifSubTab} className="w-full flex-1 flex flex-col overflow-hidden">
                                <TabsList className="grid w-full grid-cols-2 h-9">
                                    <TabsTrigger value="events" className="text-xs flex items-center gap-1.5">
                                        <Sliders className="h-3.5 w-3.5" />
                                        Eventi Abilitati
                                    </TabsTrigger>
                                    <TabsTrigger value="templates" className="text-xs flex items-center gap-1.5">
                                        <MessageSquareCode className="h-3.5 w-3.5" />
                                        Struttura Messaggi
                                    </TabsTrigger>
                                </TabsList>

                                {/* Sotto-tab 1: Eventi Abilitati (interruttori ON/OFF) */}
                                <TabsContent value="events" className="pt-3 space-y-3 overflow-y-auto flex-1 pr-1">
                                    <div className="space-y-3 divide-y divide-border">
                                        <div className="flex items-center justify-between gap-4 pt-1">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="notify-shift-approved" className="text-sm font-semibold cursor-pointer">
                                                    Approvazione Turni Lavorati
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    Invia notifica all'operatore quando approvi un suo turno ordinario o straordinario.
                                                </p>
                                            </div>
                                            <Switch
                                                id="notify-shift-approved"
                                                checked={notifSettings.notifyShiftApproved}
                                                onCheckedChange={(val) => setNotifSettings(prev => ({ ...prev, notifyShiftApproved: val }))}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between gap-4 pt-3">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="notify-shift-rejected" className="text-sm font-semibold cursor-pointer">
                                                    Rifiuto o Annullamento Turni
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    Invia notifica se un turno straordinario o una timbratura viene rifiutata o annullata.
                                                </p>
                                            </div>
                                            <Switch
                                                id="notify-shift-rejected"
                                                checked={notifSettings.notifyShiftRejected}
                                                onCheckedChange={(val) => setNotifSettings(prev => ({ ...prev, notifyShiftRejected: val }))}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between gap-4 pt-3">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="notify-req-approved" className="text-sm font-semibold cursor-pointer">
                                                    Approvazione Richieste (Ferie, Permessi, Malattia, Assenza)
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    Invia notifica quando approvi una richiesta inviata dall'operatore.
                                                </p>
                                            </div>
                                            <Switch
                                                id="notify-req-approved"
                                                checked={notifSettings.notifyRequestApproved}
                                                onCheckedChange={(val) => setNotifSettings(prev => ({ ...prev, notifyRequestApproved: val }))}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between gap-4 pt-3">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="notify-req-rejected" className="text-sm font-semibold cursor-pointer">
                                                    Rifiuto Richieste
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    Invia notifica all'operatore se una sua richiesta viene respinta.
                                                </p>
                                            </div>
                                            <Switch
                                                id="notify-req-rejected"
                                                checked={notifSettings.notifyRequestRejected}
                                                onCheckedChange={(val) => setNotifSettings(prev => ({ ...prev, notifyRequestRejected: val }))}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between gap-4 pt-3">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="notify-shift-modified" className="text-sm font-semibold cursor-pointer">
                                                    Modifiche o Aggiunte Manuali
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    Invia notifica se inserisci o modifichi un turno manualmente.
                                                </p>
                                            </div>
                                            <Switch
                                                id="notify-shift-modified"
                                                checked={notifSettings.notifyShiftModified}
                                                onCheckedChange={(val) => setNotifSettings(prev => ({ ...prev, notifyShiftModified: val }))}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* Sotto-tab 2: Struttura Messaggi (Template personalizzati) */}
                                <TabsContent value="templates" className="pt-2 space-y-4 overflow-y-auto flex-1 pr-1.5">
                                    <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-2.5 text-xs text-foreground space-y-1.5">
                                        <p className="font-semibold text-blue-700 dark:text-blue-400">Variabili dinamiche utilizzabili nei testi:</p>
                                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                                            <Badge variant="outline" className="bg-background font-mono">{'{data}'} (data turno)</Badge>
                                            <Badge variant="outline" className="bg-background font-mono">{'{ore}'} (ore lavorate)</Badge>
                                            <Badge variant="outline" className="bg-background font-mono">{'{tipo}'} (tipo richiesta)</Badge>
                                            <Badge variant="outline" className="bg-background font-mono">{'{dal}'} (data inizio)</Badge>
                                            <Badge variant="outline" className="bg-background font-mono">{'{al}'} (data fine)</Badge>
                                            <Badge variant="outline" className="bg-background font-mono">{'{operatore}'} (nome)</Badge>
                                        </div>
                                    </div>

                                    {/* 1. Turno Approvato */}
                                    <div className="space-y-2 border rounded-lg p-3 bg-card">
                                        <div className="flex items-center justify-between">
                                            <Label className="font-semibold text-xs text-primary">1. Turno Approvato</Label>
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-shift-app-title" className="text-[11px] text-muted-foreground">Titolo</Label>
                                            <Input 
                                                id="tpl-shift-app-title"
                                                value={notifSettings.templateShiftApprovedTitle ?? DEFAULT_NOTIFICATION_SETTINGS.templateShiftApprovedTitle}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateShiftApprovedTitle: e.target.value }))}
                                                className="h-8 text-xs"
                                                placeholder="Turno Approvato ✅"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-shift-app-body" className="text-[11px] text-muted-foreground">Testo Messaggio</Label>
                                            <Textarea 
                                                id="tpl-shift-app-body"
                                                value={notifSettings.templateShiftApprovedBody ?? DEFAULT_NOTIFICATION_SETTINGS.templateShiftApprovedBody}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateShiftApprovedBody: e.target.value }))}
                                                className="text-xs min-h-[60px]"
                                                placeholder="Il tuo turno del {data} è stato approvato dall'amministratore."
                                            />
                                        </div>
                                    </div>

                                    {/* 2. Richiesta Approvata */}
                                    <div className="space-y-2 border rounded-lg p-3 bg-card">
                                        <Label className="font-semibold text-xs text-primary">2. Richiesta Approvata (Ferie, Malattia, Permesso, Assenza)</Label>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-req-app-title" className="text-[11px] text-muted-foreground">Titolo</Label>
                                            <Input 
                                                id="tpl-req-app-title"
                                                value={notifSettings.templateRequestApprovedTitle ?? DEFAULT_NOTIFICATION_SETTINGS.templateRequestApprovedTitle}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateRequestApprovedTitle: e.target.value }))}
                                                className="h-8 text-xs"
                                                placeholder="Richiesta {tipo} Approvata ✅"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-req-app-body" className="text-[11px] text-muted-foreground">Testo Messaggio</Label>
                                            <Textarea 
                                                id="tpl-req-app-body"
                                                value={notifSettings.templateRequestApprovedBody ?? DEFAULT_NOTIFICATION_SETTINGS.templateRequestApprovedBody}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateRequestApprovedBody: e.target.value }))}
                                                className="text-xs min-h-[60px]"
                                                placeholder="La tua richiesta di {tipo} del {data} è stata approvata con successo."
                                            />
                                        </div>
                                    </div>

                                    {/* 3. Turno Rifiutato */}
                                    <div className="space-y-2 border rounded-lg p-3 bg-card">
                                        <Label className="font-semibold text-xs text-primary">3. Turno Rifiutato o Annullato</Label>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-shift-rej-title" className="text-[11px] text-muted-foreground">Titolo</Label>
                                            <Input 
                                                id="tpl-shift-rej-title"
                                                value={notifSettings.templateShiftRejectedTitle ?? DEFAULT_NOTIFICATION_SETTINGS.templateShiftRejectedTitle}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateShiftRejectedTitle: e.target.value }))}
                                                className="h-8 text-xs"
                                                placeholder="Turno Rifiutato ❌"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-shift-rej-body" className="text-[11px] text-muted-foreground">Testo Messaggio</Label>
                                            <Textarea 
                                                id="tpl-shift-rej-body"
                                                value={notifSettings.templateShiftRejectedBody ?? DEFAULT_NOTIFICATION_SETTINGS.templateShiftRejectedBody}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateShiftRejectedBody: e.target.value }))}
                                                className="text-xs min-h-[60px]"
                                                placeholder="Il tuo turno del {data} è stato rifiutato o annullato."
                                            />
                                        </div>
                                    </div>

                                    {/* 4. Richiesta Rifiutata */}
                                    <div className="space-y-2 border rounded-lg p-3 bg-card">
                                        <Label className="font-semibold text-xs text-primary">4. Richiesta Rifiutata</Label>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-req-rej-title" className="text-[11px] text-muted-foreground">Titolo</Label>
                                            <Input 
                                                id="tpl-req-rej-title"
                                                value={notifSettings.templateRequestRejectedTitle ?? DEFAULT_NOTIFICATION_SETTINGS.templateRequestRejectedTitle}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateRequestRejectedTitle: e.target.value }))}
                                                className="h-8 text-xs"
                                                placeholder="Richiesta {tipo} Rifiutata ❌"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-req-rej-body" className="text-[11px] text-muted-foreground">Testo Messaggio</Label>
                                            <Textarea 
                                                id="tpl-req-rej-body"
                                                value={notifSettings.templateRequestRejectedBody ?? DEFAULT_NOTIFICATION_SETTINGS.templateRequestRejectedBody}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateRequestRejectedBody: e.target.value }))}
                                                className="text-xs min-h-[60px]"
                                                placeholder="La tua richiesta di {tipo} è stata rifiutata dall'amministratore."
                                            />
                                        </div>
                                    </div>

                                    {/* 5. Nuovo Turno Inserito Manualmente */}
                                    <div className="space-y-2 border rounded-lg p-3 bg-card">
                                        <Label className="font-semibold text-xs text-primary">5. Modifica o Inserimento Manuale Turno</Label>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-shift-mod-title" className="text-[11px] text-muted-foreground">Titolo</Label>
                                            <Input 
                                                id="tpl-shift-mod-title"
                                                value={notifSettings.templateShiftModifiedTitle ?? DEFAULT_NOTIFICATION_SETTINGS.templateShiftModifiedTitle}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateShiftModifiedTitle: e.target.value }))}
                                                className="h-8 text-xs"
                                                placeholder="Nuovo Turno Inserito 📋"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-shift-mod-body" className="text-[11px] text-muted-foreground">Testo Messaggio</Label>
                                            <Textarea 
                                                id="tpl-shift-mod-body"
                                                value={notifSettings.templateShiftModifiedBody ?? DEFAULT_NOTIFICATION_SETTINGS.templateShiftModifiedBody}
                                                onChange={(e) => setNotifSettings(prev => ({ ...prev, templateShiftModifiedBody: e.target.value }))}
                                                className="text-xs min-h-[60px]"
                                                placeholder="L'amministratore ha registrato o modificato un turno per te ({data})."
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-1">
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={handleResetToDefaultTemplates}
                                            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            Ripristina testi predefiniti
                                        </Button>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            <DialogFooter className="pt-3 border-t mt-auto flex-col-reverse sm:flex-row gap-2 sm:gap-0">
                                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Annulla</Button>
                                <Button type="button" onClick={handleSaveNotificationSettings} disabled={isSavingNotifications}>
                                    {isSavingNotifications && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salva Preferenze Notifiche
                                </Button>
                            </DialogFooter>
                        </TabsContent>
                    </Tabs>
                ) : (
                    <>
                        <form id="change-settings-form" onSubmit={handleCodeChange} className="grid gap-4 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                                <Label htmlFor="username" className="text-left sm:text-right">Codice Operatore</Label>
                                <Input 
                                    id="username" 
                                    name="username" 
                                    type="text" 
                                    className="col-span-1 sm:col-span-3"
                                    value={operatorCode}
                                    onChange={(e) => setOperatorCode(e.target.value)}
                                    required 
                                />
                            </div>
                        </form>
                        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
                            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Annulla</Button>
                            <Button type="submit" form="change-settings-form" disabled={isSavingCode}>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin hidden" />
                                Salva Modifiche
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
