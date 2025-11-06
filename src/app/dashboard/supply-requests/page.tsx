
"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, Check, X, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Request = {
  id: string;
  user: string;
  item: string;
  quantity: number;
  status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale';
  notes?: string;
  fulfilledQuantity?: number;
}

type WarehouseItem = {
  id: string;
  name: string;
  quantity: number;
};

// Function to get data from localStorage
const getFromStorage = <T,>(key: string): T[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

// Function to save data to localStorage
const saveToStorage = <T,>(key: string, data: T[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('storage')); // Trigger storage event for other components
};


export default function SupplyRequestsPage() {
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [warehouseItems, setWarehouseItems] = React.useState<WarehouseItem[]>([]);
  const [isNewRequestDialogOpen, setIsNewRequestDialogOpen] = React.useState(false);
  const [isManageRequestDialogOpen, setIsManageRequestDialogOpen] = React.useState(false);
  const [selectedRequest, setSelectedRequest] = React.useState<Request | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    setRequests(getFromStorage<Request>('supply-requests'));
    setWarehouseItems(getFromStorage<WarehouseItem>('warehouse-items'));
  }, []);

  React.useEffect(() => {
    saveToStorage<Request>('supply-requests', requests);
  }, [requests]);

  const handleNewRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const itemName = formData.get('item') as string;
    
    if (!itemName) {
        toast({ title: "Errore", description: "Seleziona un prodotto.", variant: "destructive" });
        return;
    }

    const newRequest: Request = {
        id: `SR${Date.now()}`,
        user: localStorage.getItem('userName') || 'Operatore',
        item: itemName,
        quantity: Number(formData.get('quantity') as string),
        status: 'In attesa',
    };
    
    setRequests(prev => [...prev, newRequest]);
    toast({ title: "Richiesta Inviata", description: "La tua richiesta di forniture è stata inviata." });
    setIsNewRequestDialogOpen(false);
    form.reset();
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
      setRequests(reqs => reqs.map(r => r.id === selectedRequest.id ? { ...r, status, fulfilledQuantity: 0, notes } : r));
      toast({ title: "Richiesta Rifiutata" });
    } else {
        const currentItems = getFromStorage<WarehouseItem>('warehouse-items');
        const itemInStock = currentItems.find(item => item.name === selectedRequest.item);

        if (!itemInStock || itemInStock.quantity < fulfilledQuantity) {
            toast({
                title: "Quantità non disponibile",
                description: `Disponibilità in magazzino: ${itemInStock?.quantity ?? 0}. Non è possibile assegnare ${fulfilledQuantity} unità.`,
                variant: "destructive"
            });
            return;
        }

        if (fulfilledQuantity >= selectedRequest.quantity) {
            status = 'Approvata';
            toastMessage = "Richiesta Approvata Completamente";
        } else if (fulfilledQuantity > 0) {
            status = 'Parziale';
            toastMessage = "Richiesta Approvata Parzialmente";
        } else { // fulfilledQuantity is 0 or less
            status = 'Approvata';
            toastMessage = "Richiesta Approvata (0 unità fornite)";
        }

        // Update warehouse
        const updatedWarehouseItems = currentItems.map(item =>
            item.name === selectedRequest.item
                ? { ...item, quantity: item.quantity - fulfilledQuantity }
                : item
        );
        saveToStorage<WarehouseItem>('warehouse-items', updatedWarehouseItems);
        setWarehouseItems(updatedWarehouseItems);

        // Update request
        setRequests(reqs => reqs.map(r => r.id === selectedRequest.id ? { ...r, status, fulfilledQuantity, notes } : r));
        toast({ title: toastMessage, description: `Prodotto: ${selectedRequest.item}, Quantità: ${fulfilledQuantity}` });
    }

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
                            Seleziona il prodotto e la quantità necessari.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleNewRequestSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="item" className="text-right">Prodotto</Label>
                            <Select name="item" required>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Seleziona un prodotto" />
                                </SelectTrigger>
                                <SelectContent>
                                    {warehouseItems.length > 0 ? warehouseItems.map(item => (
                                        <SelectItem key={item.id} value={item.name} disabled={item.quantity <= 0}>
                                            {item.name} {item.quantity <= 0 ? '(Esaurito)' : ''}
                                        </SelectItem>
                                    )) : <SelectItem value="disabled" disabled>Nessun prodotto in magazzino</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="quantity" className="text-right">Quantità</Label>
                            <Input id="quantity" name="quantity" type="number" placeholder="Es. 5" className="col-span-3" required min="1"/>
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
              <TableHead>Operatore</TableHead>
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
                <TableCell className="font-medium">{req.user}</TableCell>
                <TableCell>{req.item}</TableCell>
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
                      min="0"
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

    