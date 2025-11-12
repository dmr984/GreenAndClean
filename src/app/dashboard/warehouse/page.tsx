"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, Trash, Edit, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useFirestore } from "@/firebase";
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";

type WarehouseItem = {
  id: string;
  name: string;
  quantity: number;
};


export default function WarehousePage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [items, setItems] = React.useState<WarehouseItem[]>([]);
  const [isItemDialogOpen, setIsItemDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<WarehouseItem | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);

  React.useEffect(() => {
    if (!firestore) return;
    const unsubscribe = onSnapshot(collection(firestore, 'warehouse-items'), (snapshot) => {
        setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WarehouseItem)));
    });
    return () => unsubscribe();
  }, [firestore]);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firestore) return;

    const form = event.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const quantity = Number((form.elements.namedItem('quantity') as HTMLInputElement).value);

    try {
        if (isEditing && selectedItem) {
          // Edit item
          const docRef = doc(firestore, 'warehouse-items', selectedItem.id);
          await updateDoc(docRef, { name, quantity });
          toast({ title: "Prodotto Modificato", description: `"${name}" è stato aggiornato.` });
        } else {
          // Add new item
          await addDoc(collection(firestore, 'warehouse-items'), { name, quantity });
          toast({ title: "Prodotto Aggiunto", description: `"${name}" è stato aggiunto al magazzino.` });
        }
    } catch (error) {
        toast({ title: "Errore", description: "Impossibile salvare il prodotto.", variant: "destructive"});
    }

    setIsItemDialogOpen(false);
    setSelectedItem(null);
    setIsEditing(false);
    form.reset();
  };
  
  const handleDeleteItem = async () => {
    if (!selectedItem || !firestore) return;
    
    try {
        await deleteDoc(doc(firestore, 'warehouse-items', selectedItem.id));
        toast({
          title: "Prodotto Eliminato",
          description: `"${selectedItem.name}" è stato rimosso dal magazzino.`,
          variant: "destructive"
        });
    } catch (error) {
        toast({ title: "Errore", description: "Impossibile eliminare il prodotto.", variant: "destructive"});
    }

    setIsDeleteDialogOpen(false);
    setSelectedItem(null);
  }

  const handleQuantityChange = async (itemId: string, amount: number) => {
    if (!firestore) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const newQuantity = Math.max(0, item.quantity + amount);
    const docRef = doc(firestore, 'warehouse-items', itemId);
    try {
        await updateDoc(docRef, { quantity: newQuantity });
    } catch(error) {
        toast({ title: "Errore", description: "Impossibile aggiornare la quantità.", variant: "destructive"});
    }
  };
  
  const openDialog = (item: WarehouseItem | null, editing: boolean) => {
    setSelectedItem(item);
    setIsEditing(editing);
    setIsItemDialogOpen(true);
  }

  const openDeleteDialog = (item: WarehouseItem) => {
    setSelectedItem(item);
    setIsDeleteDialogOpen(true);
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Gestione Magazzino</h2>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Inventario Prodotti</CardTitle>
              <CardDescription>Aggiungi, modifica e visualizza i prodotti disponibili per le richieste.</CardDescription>
            </div>
            <Button size="sm" className="gap-1 w-full sm:w-auto" onClick={() => openDialog(null, false)}>
              <PlusCircle className="h-4 w-4" />
              Aggiungi Prodotto
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p>Non ci sono prodotti nel magazzino. Inizia aggiungendone uno.</p>
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prodotto</TableHead>
                    <TableHead className="w-[200px]">Quantità Disponibile</TableHead>
                    <TableHead className="w-[80px] text-right"><span className="sr-only">Azioni</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleQuantityChange(item.id, -1)}
                            disabled={item.quantity <= 0}
                          >
                            <Minus className="h-4 w-4" />
                            <span className="sr-only">Diminuisci</span>
                          </Button>
                          <span className="min-w-[40px] text-center text-base font-medium">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleQuantityChange(item.id, 1)}
                          >
                            <Plus className="h-4 w-4" />
                             <span className="sr-only">Aumenta</span>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Apri menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Azioni</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => openDialog(item, true)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Modifica Prodotto
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onSelect={() => openDeleteDialog(item)}>
                              <Trash className="mr-2 h-4 w-4" />
                              Elimina
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Item Dialog */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Modifica Prodotto' : 'Aggiungi Nuovo Prodotto'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Aggiorna il nome o la quantità totale del prodotto.' : 'Compila i campi per aggiungere un nuovo prodotto al magazzino.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-left sm:text-right">Nome Prodotto</Label>
              <Input id="name" name="name" className="col-span-1 sm:col-span-3" defaultValue={selectedItem?.name} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-left sm:text-right">Quantità</Label>
              <Input id="quantity" name="quantity" type="number" className="col-span-1 sm:col-span-3" defaultValue={selectedItem?.quantity ?? 0} required min="0" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsItemDialogOpen(false)}>Annulla</Button>
              <Button type="submit">{isEditing ? 'Salva Modifiche' : 'Aggiungi Prodotto'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Delete Item Confirmation */}
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata. Il prodotto verrà eliminato in modo permanente dal magazzino.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedItem(null)}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem}>Conferma Eliminazione</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
