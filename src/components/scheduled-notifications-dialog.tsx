'use client';
import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface ScheduledNotification {
  id: string;
  operatorId: string;
  title: string;
  body: string;
  scheduledTime: Timestamp;
  status: 'pending' | 'sent' | 'failed';
}

interface ScheduledNotificationsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  operatorId: string;
  operatorName: string;
}

export function ScheduledNotificationsDialog({ isOpen, onClose, operatorId, operatorName }: ScheduledNotificationsDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<ScheduledNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [title, setTitle] = useState('Promemoria');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));

  useEffect(() => {
    if (!isOpen || !firestore || !operatorId) return;

    setIsLoading(true);
    const q = query(
      collection(firestore, 'scheduled-notifications'),
      where('operatorId', '==', operatorId),
      orderBy('scheduledTime', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ScheduledNotification[];
      setNotifications(docs);
      setIsLoading(false);
    }, (error) => {
      console.error('Errore nel caricamento notifiche programmate:', error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, firestore, operatorId]);

  const handleAdd = async () => {
    if (!firestore || !operatorId) return;
    if (!title || !body || !date || !time) {
      toast({ title: 'Errore', description: 'Compila tutti i campi.', variant: 'destructive' });
      return;
    }

    setIsAdding(true);
    try {
      const scheduledDateTime = new Date(`${date}T${time}`);
      
      if (scheduledDateTime < new Date()) {
        toast({ title: 'Errore', description: 'L\'orario deve essere nel futuro.', variant: 'destructive' });
        setIsAdding(false);
        return;
      }

      await addDoc(collection(firestore, 'scheduled-notifications'), {
        operatorId,
        title,
        body,
        scheduledTime: Timestamp.fromDate(scheduledDateTime),
        status: 'pending',
        createdAt: Timestamp.now()
      });

      toast({ title: 'Programmata', description: 'Notifica aggiunta con successo.' });
      setBody('');
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'scheduled-notifications', id));
      toast({ title: 'Eliminata', description: 'Notifica rimossa.' });
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Pianifica Notifiche per {operatorName}</DialogTitle>
          <DialogDescription>
            Programma più messaggi da inviare automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Form per nuova notifica */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuova Pianificazione
            </h4>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sched-title">Titolo</Label>
                <Input id="sched-title" value={title} onChange={(e) => setTitle(e.target.value)} size={32} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sched-body">Messaggio</Label>
                <Textarea id="sched-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Scrivi il messaggio..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Data</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Ora</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleAdd} disabled={isAdding} className="w-full">
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Programma Messaggio'}
              </Button>
            </div>
          </div>

          {/* Lista notifiche esistenti */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Notifiche In Coda</h4>
            {isLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-4">Nessuna notifica programmata.</p>
            ) : (
              <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2">
                {notifications.map((notif) => (
                  <div key={notif.id} className="flex items-center justify-between p-3 border rounded-md text-sm hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{notif.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(notif.scheduledTime.toDate(), 'dd/MM/yyyy HH:mm', { locale: it })}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                          notif.status === 'pending' ? 'bg-blue-100 text-blue-700' : 
                          notif.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {notif.status === 'pending' ? 'In coda' : notif.status === 'sent' ? 'Inviata' : 'Fallita'}
                        </span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(notif.id)} className="text-destructive h-8 w-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
