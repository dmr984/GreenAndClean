
"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, Check, X, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

type Request = {
  id: string;
  item: string;
  quantity: number;
  status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale';
  notes?: string;
  fulfilledQuantity?: number;
}

const initialRequests: Request[] = [];

export default function SupplyRequestsPage() {
  const [requests, setRequests] = React.useState(initialRequests);
  const [isNewRequestDialogOpen, setIsNewRequestDialogOpen] = React.useState(false);
  const [isManageRequestDialogOpen, setIsManageRequestDialogOpen] = React.useState(false);
  const [selectedRequest, setSelectedRequest] = React.useState<Request | null>(null);
  const { toast } = useToast();

  const handleNewRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast({ title: "Richiesta Inviata", description: "La tua richiesta di forniture è stata inviata." });
    setIsNewRequestDialogOpen(false);
  }
  
  const openManageDialog = (request: Request) => {
    setSelectedRequest(request);
    setIsManageRequestDialogOpen(true);
  }
  
  const handleManageRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedRequest) return;
  
    const formData = new FormData(e.currentTarget);
    const fulfilledQuantity = Number(formData.get('fulfilledQuantity') as string);
    const notes = formData.get('notes') as string;
    const action = (e.nativeEvent as any).submitter.value;
  
    let status: Request['status'] = selectedRequest.status;
    let toastMessage = "";
  
    if (action === 'reject') {
      status = 'Rifiutata';
      toastMessage = "Richiesta Rifiutata";
    } else {
      if (fulfilledQuantity >= selectedRequest.quantity) {
        status = 'Approvata';
        toastMessage = "Richiesta Approvata Completamente";
      } else {
        status = 'Parziale';
        toastMessage = "Richiesta Approvata Parzialmente";
      }
    }
  
    setRequests(reqs => reqs.map(r => r.id === selectedRequest.id ? { ...r, status, fulfilledQuantity, notes } : r));
    toast({ title: toastMessage, description: `Prodotto: ${selectedRequest.item}` });
    setIsManageRequestDialogOpen(false);
    setSelectedRequest(null);
  }

  const getStatusVariant = (status: Request['status']): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Approvata":
        return "default";
      case "In attesa":
        return "secondary";
      case "Rifiutata":
        return "destructive";
      case "Parziale":
        return "outline"; // Using outline for partial
      default:
        return "secondary";
    }
  }

  return (
    <>
     <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Richieste Forniture</h2>
      </div>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <CardTitle>Elenco Richieste</CardTitle>
                <CardDescription>Gestisci le richieste di prodotti e forniture per la pulizia.</CardDescription>
            </div>
            <Dialog open={isNewRequestDialogOpen} onOpenChange={setIsNewRequestDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                        <PlusCircle className="h-4 w-4" />
                        Nuova Richiesta (Operatore)
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Nuova Richiesta Forniture</DialogTitle>
                        <DialogDescription>
                            Specifica il prodotto e la quantità necessari.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleNewRequestSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="item" className="text-right">Prodotto</Label>
                            <Input id="item" placeholder="Es. Detergente Multiuso" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="quantity" className="text-right">Quantità</Label>
                            <Input id="quantity" type="number" placeholder="Es. 5" className="col-span-3" required/>
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
            <p>Non ci sono richieste di forniture al momento.</p>
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prodotto</TableHead>
              <TableHead>Qt. Richiesta</TableHead>
              <TableHead>Qt. Consegnata</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead><span className="sr-only">Azioni</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((req) => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">{req.item}</TableCell>
                <TableCell>{req.quantity}</TableCell>
                <TableCell>{req.fulfilledQuantity ?? 'N/A'}</TableCell>
                <TableCell><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></TableCell>
                <TableCell>
                  {req.status === 'In attesa' && (
                     <Button variant="outline" size="sm" onClick={() => openManageDialog(req)}>
                        <Pencil className="mr-2 h-3 w-3" /> Gestisci
                      </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </CardContent>
    </Card>

    {/* Manage Request Dialog */}
    <Dialog open={isManageRequestDialogOpen} onOpenChange={setIsManageRequestDialogOpen}>
        <DialogContent>
          <form onSubmit={handleManageRequestSubmit}>
            <DialogHeader>
                <DialogTitle>Gestisci Richiesta Fornitura</DialogTitle>
                <DialogDescription>
                    Approva, rifiuta o modifica la quantità per la richiesta di: <span className="font-bold">{selectedRequest?.item} (Richiesti: {selectedRequest?.quantity})</span>
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="fulfilledQuantity" className="text-right">Qt. Consegnata</Label>
                    <Input 
                      id="fulfilledQuantity" 
                      name="fulfilledQuantity"
                      type="number" 
                      className="col-span-3"
                      defaultValue={selectedRequest?.quantity}
                      required
                    />
                </div>
                 <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="notes" className="text-right pt-2">Note Admin</Label>
                    <Textarea 
                      id="notes" 
                      name="notes"
                      className="col-span-3" 
                      placeholder="Opzionale: es. '7 inviati, il resto la prossima settimana.'" 
                      defaultValue={selectedRequest?.notes}
                    />
                </div>
            </div>
            <DialogFooter>
                <Button type="submit" name="action" value="reject" variant="destructive">
                    <X className="mr-2 h-4 w-4" /> Rifiuta
                </Button>
                <Button type="submit" name="action" value="approve">
                    <Check className="mr-2 h-4 w-4" /> Conferma e Approva
                </Button>
            </DialogFooter>
          </form>
        </DialogContent>
    </Dialog>
    </>
  );
}
