"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const initialRequests: { id: string; item: string; quantity: number; status: string; }[] = [];

export function SupplyRequests() {
  const [requests, setRequests] = React.useState(initialRequests);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast({ title: "Richiesta Inviata", description: "La tua richiesta di forniture è stata inviata." });
    setIsDialogOpen(false);
  }
  
  const handleApprove = (id: string) => {
    setRequests(reqs => reqs.map(r => r.id === id ? { ...r, status: "Approvata" } : r));
    toast({ title: "Richiesta Approvata", variant: "default" });
  }

  const handleReject = (id: string) => {
    setRequests(reqs => reqs.map(r => r.id === id ? { ...r, status: "Rifiutata" } : r));
    toast({ title: "Richiesta Rifiutata", variant: "destructive" });
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <CardTitle>Richieste Forniture</CardTitle>
                <CardDescription>Richiedi prodotti e forniture per la pulizia.</CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                        <PlusCircle className="h-4 w-4" />
                        Nuova Richiesta
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Nuova Richiesta Forniture</DialogTitle>
                        <DialogDescription>
                            Specifica il prodotto e la quantità necessari.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
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
              <TableHead className="w-auto sm:w-[100px]">Quantità</TableHead>
              <TableHead className="w-auto sm:w-[120px]">Stato</TableHead>
              <TableHead className="w-auto sm:w-[80px]"><span className="sr-only">Azioni</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((req) => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">{req.item}</TableCell>
                <TableCell>{req.quantity}</TableCell>
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
                      <DropdownMenuItem onSelect={() => handleReject(req.id)} className="text-destructive">
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
  );
}

    