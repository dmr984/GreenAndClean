"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, Check, X, Pencil, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";


// ==================================
// SHARED TYPES & UTILS
// ==================================
type SupplyRequest = {
  id: string;
  user: string;
  items: { [itemName: string]: number }; // e.g. { "Sgrassatore": 5, "Panni Vetri": 10 }
  status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale';
  adminNotes?: string;
  fulfilledItems?: { [itemName: string]: number };
};

type WarehouseItem = {
  id: string;
  name: string;
  quantity: number;
};

// Generic function to get data from localStorage
const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    console.error(`Failed to parse ${key} from storage`, e);
    return defaultValue;
  }
};

// Generic function to save data to localStorage
const saveToStorage = <T,>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('storage')); 
};


// ==================================
// MAIN PAGE COMPONENT
// ==================================

export default function SupplyRequestsPage() {
    const [requests, setRequests] = React.useState<SupplyRequest[]>([]);
    const [warehouseItems, setWarehouseItems] = React.useState<WarehouseItem[]>([]);
    const [isManageRequestDialogOpen, setIsManageRequestDialogOpen] = React.useState(false);
    const [selectedRequest, setSelectedRequest] = React.useState<SupplyRequest | null>(null);
    const [manageFormState, setManageFormState] = React.useState<{ fulfilledItems: { [key: string]: number }, notes: string }>({ fulfilledItems: {}, notes: "" });
    const { toast } = useToast();
    const [userRole, setUserRole] = React.useState<string|null>(null);
    const [userName, setUserName] = React.useState<string|null>(null);

    // Draft state for new request with auto-saving
    const [draftItems, setDraftItems] = React.useState<{ [itemName: string]: number }>({});
    
    React.useEffect(() => {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        setUserRole(storedUser.role);
        setUserName(storedUser.username);
        setRequests(getFromStorage<SupplyRequest[]>('supply-requests', []));
        setWarehouseItems(getFromStorage<WarehouseItem[]>('warehouse-items', []));
        
        if (storedUser.role === 'operator') {
            setDraftItems(getFromStorage<{ [itemName: string]: number }>('supply-request-draft', {}));
        }
    }, []);

    // Auto-save draft to localStorage whenever it changes
    React.useEffect(() => {
        if (userRole === 'operator') {
            saveToStorage('supply-request-draft', draftItems);
        }
    }, [draftItems, userRole]);

    const updateAllRequests = (updatedRequests: SupplyRequest[]) => {
        setRequests(updatedRequests);
        saveToStorage('supply-requests', updatedRequests);
    };

    const handleItemQuantityChange = (itemName: string, amount: number) => {
        setDraftItems(prev => {
            const currentQuantity = prev[itemName] || 0;
            const newQuantity = Math.max(0, currentQuantity + amount);
            if (newQuantity === 0) {
                const { [itemName]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [itemName]: newQuantity };
        });
    };

    const handleNewRequestSubmit = () => {
        if (Object.keys(draftItems).length === 0) {
            toast({ title: "Nessun prodotto selezionato", description: "Aggiungi almeno un prodotto alla richiesta.", variant: "destructive" });
            return;
        }

        const newRequest: SupplyRequest = {
            id: `SR${Date.now()}`,
            user: userName || 'Operatore',
            items: draftItems,
            status: 'In attesa',
        };
        
        updateAllRequests([newRequest, ...requests]);
        toast({ title: "Richiesta Inviata", description: "La tua richiesta di forniture è stata inviata." });
        setDraftItems({}); // Clear draft
    };
  
    const openManageDialog = (request: SupplyRequest) => {
        setSelectedRequest(request);
        setManageFormState({ fulfilledItems: { ...request.items }, notes: request.adminNotes || "" });
        setIsManageRequestDialogOpen(true);
    };
    
    const handleManageRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedRequest) return;
      
        const action = (e.nativeEvent as any).submitter.value as 'approve' | 'reject';
      
        let status: SupplyRequest['status'] = selectedRequest.status;
        
        // Handle rejection
        if (action === 'reject') {
            status = 'Rifiutata';
            const updated = requests.map(r => r.id === selectedRequest.id ? { ...r, status, fulfilledItems: {}, adminNotes: manageFormState.notes } : r);
            updateAllRequests(updated);
            toast({ title: "Richiesta Rifiutata" });
        } else { // Handle approval
            const currentStock = getFromStorage<WarehouseItem[]>('warehouse-items', []);
            let canFulfill = true;
            let updatedStock = [...currentStock];

            // Check stock availability
            for (const itemName in manageFormState.fulfilledItems) {
                const requestedQty = manageFormState.fulfilledItems[itemName];
                const stockItem = updatedStock.find(i => i.name === itemName);
                if (!stockItem || stockItem.quantity < requestedQty) {
                    toast({
                        title: "Quantità non disponibile",
                        description: `Disponibilità per ${itemName}: ${stockItem?.quantity ?? 0}.`,
                        variant: "destructive"
                    });
                    canFulfill = false;
                    break;
                }
            }

            if (!canFulfill) return;

            // Update stock
            for (const itemName in manageFormState.fulfilledItems) {
                 const fulfilledQty = manageFormState.fulfilledItems[itemName];
                 updatedStock = updatedStock.map(item => 
                    item.name === itemName ? { ...item, quantity: item.quantity - fulfilledQty } : item
                 );
            }
            saveToStorage('warehouse-items', updatedStock);
            setWarehouseItems(updatedStock);

            // Determine status
            const isPartial = Object.keys(selectedRequest.items).some(key => (manageFormState.fulfilledItems[key] || 0) < selectedRequest.items[key]);
            const totalFulfilled = Object.values(manageFormState.fulfilledItems).reduce((a, b) => a + b, 0);

            let toastMessage = "";
            if (totalFulfilled === 0 && selectedRequest.status !== 'Approvata') {
                 status = 'Approvata'; // Approved but 0 items given
                 toastMessage = "Richiesta approvata (0 unità fornite)";
            } else if (isPartial) {
                status = 'Parziale';
                toastMessage = "Richiesta Approvata Parzialmente";
            } else {
                status = 'Approvata';
                toastMessage = "Richiesta Approvata Completamente";
            }
            
            const updated = requests.map(r => r.id === selectedRequest.id ? { ...r, status, fulfilledItems: manageFormState.fulfilledItems, adminNotes: manageFormState.notes } : r);
            updateAllRequests(updated);
            if(toastMessage) toast({ title: toastMessage });
        }
    
        setIsManageRequestDialogOpen(false);
        setSelectedRequest(null);
    };

    const handleManageFormChange = (itemName: string, quantity: number) => {
        setManageFormState(prev => ({
            ...prev,
            fulfilledItems: {
                ...prev.fulfilledItems,
                [itemName]: Math.max(0, quantity)
            }
        }));
    };

    const getStatusVariant = (status: SupplyRequest['status']): "default" | "secondary" | "destructive" | "outline" => {
        switch (status) {
            case "Approvata": return "default";
            case "In attesa": return "secondary";
            case "Rifiutata": return "destructive";
            case "Parziale": return "outline";
            default: return "secondary";
        }
    }
    
    const isAdmin = userRole === 'admin';
    const userRequests = isAdmin ? requests : requests.filter(r => r.user === userName);

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">
                    {isAdmin ? "Gestione Richieste Forniture" : "Le Tue Richieste di Forniture"}
                </h2>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>
                        {isAdmin ? "Richieste Prodotti e Storico" : "Crea e visualizza le tue richieste"}
                    </CardTitle>
                    <CardDescription>
                        {isAdmin ? "Gestisci le richieste di prodotti e forniture per la pulizia." : "Richiedi i prodotti di cui hai bisogno dal magazzino."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    {!isAdmin && (
                        <div className="p-4 border rounded-lg space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold">Crea Nuova Richiesta</h3>
                                <p className="text-sm text-muted-foreground">Aggiungi i prodotti e le quantità desiderate.</p>
                            </div>
                            <div className="space-y-2">
                                {warehouseItems.map(item => (
                                    <div key={item.id} className="flex justify-between items-center p-2 rounded-md border">
                                        <span className="font-medium">{item.name}</span>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleItemQuantityChange(item.name, -1)}><Minus className="h-4 w-4" /></Button>
                                            <span className="min-w-[40px] text-center font-bold text-lg">{draftItems[item.name] || 0}</span>
                                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleItemQuantityChange(item.name, 1)}><Plus className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {warehouseItems.length === 0 && <p className="text-muted-foreground text-center">Magazzino vuoto. Nessun prodotto da richiedere.</p>}
                            <Button onClick={handleNewRequestSubmit} className="w-full sm:w-auto" disabled={Object.keys(draftItems).length === 0}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Invia Richiesta
                            </Button>
                        </div>
                    )}

                    <div>
                        <h3 className="text-lg font-semibold mb-2">Storico Richieste</h3>
                        {userRequests.length === 0 ? (
                            <div className="text-center text-muted-foreground py-12"><p>Non ci sono richieste di forniture da mostrare.</p></div>
                        ) : (
                            <div className="space-y-4">
                                {userRequests.map((req) => (
                                    <Card key={req.id}>
                                        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-2 gap-2">
                                            <div>
                                                <CardTitle className="text-base">{req.user}</CardTitle>
                                                <CardDescription>{new Date().toLocaleDateString()}</CardDescription>
                                            </div>
                                            <div className="flex items-center gap-2 self-end sm:self-center">
                                                <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                                                {isAdmin && req.status === 'In attesa' && (
                                                    <Button variant="outline" size="sm" onClick={() => openManageDialog(req)}>
                                                        <Pencil className="mr-2 h-3 w-3" /> Gestisci
                                                    </Button>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="relative w-full overflow-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Prodotto</TableHead>
                                                            <TableHead className="text-center">Qt. Richiesta</TableHead>
                                                            {req.status !== 'In attesa' && <TableHead className="text-center">Qt. Consegnata</TableHead>}
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {Object.entries(req.items).map(([name, qty]) => (
                                                            <TableRow key={name}>
                                                                <TableCell className="font-medium">{name}</TableCell>
                                                                <TableCell className="text-center">{qty}</TableCell>
                                                                {req.status !== 'In attesa' && <TableCell className="text-center font-bold">
                                                                    {req.fulfilledItems ? (req.fulfilledItems[name] ?? 0) : (req.status === 'Rifiutata' ? 0 : 'N/D')}
                                                                </TableCell>}
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            {(req.adminNotes) && (
                                                <div className="mt-4 p-3 bg-muted rounded-md">
                                                    <h4 className="font-semibold text-sm">Note dell'amministratore:</h4>
                                                    <p className="text-sm text-muted-foreground">{req.adminNotes}</p>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>

                    <Dialog open={isManageRequestDialogOpen} onOpenChange={setIsManageRequestDialogOpen}>
                        <DialogContent>
                        <form onSubmit={handleManageRequestSubmit}>
                            <DialogHeader>
                                <DialogTitle>Gestisci Richiesta Fornitura</DialogTitle>
                                <DialogDescription>Approva, rifiuta o modifica le quantità per la richiesta di <span className="font-bold">{selectedRequest?.user}</span>.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
                                {selectedRequest && Object.entries(selectedRequest.items).map(([itemName, requestedQty]) => (
                                    <div key={itemName} className="grid grid-cols-1 sm:grid-cols-3 items-center gap-4">
                                        <Label htmlFor={`qty-${itemName}`} className="col-span-1 sm:text-right">{itemName} (Max: {requestedQty})</Label>
                                        <Input 
                                        id={`qty-${itemName}`}
                                        type="number" 
                                        className="col-span-2"
                                        value={manageFormState.fulfilledItems[itemName] ?? 0}
                                        onChange={(e) => handleManageFormChange(itemName, Number(e.target.value))}
                                        max={requestedQty}
                                        min="0"
                                        />
                                    </div>
                                ))}
                                <Textarea 
                                id="notes" 
                                name="notes"
                                className="mt-4"
                                placeholder="Opzionale: aggiungi una nota per l'operatore." 
                                value={manageFormState.notes}
                                onChange={(e) => setManageFormState(p => ({...p, notes: e.target.value}))}
                                />
                            </div>
                            <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
                                <Button type="submit" name="action" value="reject" variant="destructive"><X className="mr-2 h-4 w-4" />Rifiuta</Button>
                                <Button type="submit" name="action" value="approve"><Check className="mr-2 h-4 w-4" />Conferma e Approva</Button>
                            </DialogFooter>
                        </form>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>
        </div>
    );
};
