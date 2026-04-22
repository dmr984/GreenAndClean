'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';

interface NotificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  operatorName: string;
  tokens: string[];
}

export function NotificationDialog({ isOpen, onClose, operatorName, tokens }: NotificationDialogProps) {
  const [title, setTitle] = useState('Promemoria Turno');
  const [body, setBody] = useState(`Ciao ${operatorName}, ricordati di chiudere il turno se hai finito!`);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!tokens || tokens.length === 0) {
      toast({
        title: 'Errore',
        description: 'L\'operatore non ha dispositivi registrati per le notifiche.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokens,
          title,
          body,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Notifica Inviata',
          description: `Inviata con successo a ${data.successCount} dispositivi.`,
        });
        onClose();
      } else {
        throw new Error(data.error || 'Errore durante l\'invio');
      }
    } catch (error: any) {
      toast({
        title: 'Errore Invio',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invia Notifica Push</DialogTitle>
          <DialogDescription>
            Invia un messaggio diretto a <strong>{operatorName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Titolo</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Inserisci il titolo..."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="body">Messaggio</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Scrivi il messaggio..."
              rows={4}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {tokens.length} dispositivi registrati per questo utente.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSend} disabled={isSending || tokens.length === 0} className="gap-2">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Invia Ora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
