
"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Request = { 
  id: string; 
  user: string;
  type: string; 
  from: string; 
  to: string; 
  status: string; 
  reason: string; 
  adminNotes?: string; 
};

// Function to get requests from localStorage
const getRequestsFromStorage = (): Request[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('leave-requests');
  try {
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

// Function to save requests to localStorage
const saveRequestsToStorage = (requests: Request[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('leave-requests', JSON.stringify(requests));
  window.dispatchEvent(new Event('storage')); // Trigger storage event for other components
};


export default function LeaveRequestsPage() {
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [isNewRequestOpen, setIsNewRequestOpen] = React.useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = React.useState(false);
  const [selectedRequest, setSelectedRequest] = React.useState<Request | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const { toast } = useToast();

   React.useEffect(() => {
    setRequests(getRequestsFromStorage());
  }, []);

  React.useEffect(() => {
    saveRequestsToStorage(requests);
  }, [requests]);

  const handleNewRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const newRequest: Request = {
        id: `LR${Date.now()}`,
        user: localStorage.getItem('userName') || 'Operatore',
        type: formData.get('type') as string,
        from: formData.get('from-date') as string,
        to: formData.get('to-date') as string,
        reason: formData.get('reason') as string,
        status: 'In attesa'
    };
    
    setRequests(prev => [...prev, newRequest]);
    toast({ title: "Richiesta Inviata", description: "La tua richiesta è stata inviata per l'approvazione." });
    setIsNewRequestOpen(false);
    form.reset();
  }
  
  const handleApprove = (id: string) => {
    setRequests(reqs => reqs.map(r => r.id === id ? { ...r, status: "Approvata" } : r));
    toast({ title: "Richiesta Approvata", variant: "default" });
  }

  const handleRejectSubmit = () => {
    if (!selectedRequest) return;
    setRequests(reqs => reqs.map(r => r.id === selectedRequest.id ? { ...r, status: "Rifiutata", adminNotes: rejectionReason } : r));
    toast({ title: "Richiesta Rifiutata", variant: "destructive" });
    setIsRejectDialogOpen(false);
    setSelectedRequest(null);
    setRejectionReason("");
  }

  const openRejectDialog = (request: Request) => {
    setSelectedRequest(request);
    setIsRejectDialogOpen(true);
  }

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" => {
    switch (status) {
      case "Approvata":
        return "default";
      case "In attesa":
        return "secondary";
      case "Rifiutata":
        return "destructive";
      default:
        return "secondary";
    }
  }

  return (
    <>
     <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Richieste Ferie e Permessi</h2>
      </div>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <CardTitle>Elenco Richieste</CardTitle>
                <CardDescription>Gestisci le richieste di ferie e permessi degli operatori.</CardDescription>
            </div>
            <Dialog open={isNewRequestOpen} onOpenChange={setIsNewRequestOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                        <PlusCircle className="h-4 w-4" />
                        Nuova Richiesta (Operatore)
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Nuova Richiesta Ferie/Permessi</DialogTitle>
                        <DialogDescription>Compila i dettagli per la richiesta di assenza di un operatore.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleNewRequestSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="type" className="text-right">Tipo</Label>
                             <Select name="type" required>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Seleziona tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Ferie">Ferie</SelectItem>
                                    <SelectItem value="Malattia">Malattia</SelectItem>
                                    <SelectItem value="Permesso">Permesso</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="from-date" className="text-right">Dal</Label>
                            <Input id="from-date" name="from-date" type="date" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="to-date" className="text-right">Al</Label>
                            <Input id="to-date" name="to-date" type="date" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="reason" className="text-right pt-2">Motivo</Label>
                            <Textarea id="reason" name="reason" className="col-span-3" placeholder="Opzionale: fornisci un motivo per la richiesta." />
                        </div>
                        <DialogFooter>
                            <Button type="submit">Invia Richiesta</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <p>Non ci sono richieste di ferie o permessi al momento.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operatore</TableHead>
                <TableHead className="w-auto sm:w-[120px]">Tipo</TableHead>
                <TableHead>Dal</TableHead>
                <TableHead>Al</TableHead>
                <TableHead className="hidden md:table-cell">Motivo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead><span className="sr-only">Azioni</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{req.user}</TableCell>
                  <TableCell>{req.type}</TableCell>
                  <TableCell>{new Date(req.from).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(req.to).toLocaleDateString()}</TableCell>
                  <TableCell className="hidden md:table-cell max-w-[200px] truncate">{req.reason}</TableCell>
                  <TableCell><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button aria-haspopup="true" size="icon" variant="ghost" disabled={req.status !== 'In attesa'}>
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Apri menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Azioni Admin</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => handleApprove(req.id)}>
                          <Check className="mr-2 h-4 w-4" />
                          Approva
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openRejectDialog(req)} className="text-destructive">
                          <X className="mr-2 h-4 w-4" />
                          Rifiuta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

    <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Motivo del Rifiuto</AlertDialogTitle>
                <AlertDialogDescription>
                    Si prega di fornire un motivo per il rifiuto di questa richiesta. Questo sarà condiviso con l'operatore.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea 
              placeholder="Es. Esigenze operative critiche in questo periodo."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => { setSelectedRequest(null); setRejectionReason(""); }}>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={handleRejectSubmit}>Conferma Rifiuto</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
