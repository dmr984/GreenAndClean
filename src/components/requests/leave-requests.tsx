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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";

// Mock Data
const initialRequests = [
    { id: "LR001", type: "Ferie", from: "2024-08-15", to: "2024-08-20", status: "Approvata", reason: "Viaggio di famiglia.", adminNotes: "" },
    { id: "LR002", type: "Malattia", from: "2024-07-25", to: "2024-07-25", status: "Approvata", reason: "", adminNotes: "" },
    { id: "LR003", type: "Permesso", from: "2024-07-30", to: "2024-07-30", status: "Rifiutata", reason: "Visita medica.", adminNotes: "Esigenze operative. Si prega di riprogrammare." },
    { id: "LR004", type: "Ferie", from: "2024-09-01", to: "2024-09-07", status: "In attesa", reason: "Ferie annuali.", adminNotes: "" },
];

export function LeaveRequests() {
  const [requests, setRequests] = React.useState(initialRequests);
  const [isNewRequestOpen, setIsNewRequestOpen] = React.useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = React.useState(false);
  const [selectedRequest, setSelectedRequest] = React.useState<(typeof initialRequests)[0] | null>(null);
  const { toast } = useToast();

  const handleNewRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast({ title: "Richiesta Inviata", description: "La tua richiesta di ferie è stata inviata per l'approvazione." });
    setIsNewRequestOpen(false);
  }
  
  const handleApprove = (id: string) => {
    setRequests(reqs => reqs.map(r => r.id === id ? { ...r, status: "Approvata" } : r));
    toast({ title: "Richiesta Approvata", variant: "default" });
  }

  const handleRejectSubmit = () => {
    if (!selectedRequest) return;
    setRequests(reqs => reqs.map(r => r.id === selectedRequest.id ? { ...r, status: "Rifiutata" } : r));
    toast({ title: "Richiesta Rifiutata", variant: "destructive" });
    setIsRejectDialogOpen(false);
    setSelectedRequest(null);
  }

  const openRejectDialog = (request: (typeof initialRequests)[0]) => {
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle>Richieste di Ferie/Permessi</CardTitle>
                <CardDescription>Gestisci le tue richieste di ferie e permessi.</CardDescription>
            </div>
            <Dialog open={isNewRequestOpen} onOpenChange={setIsNewRequestOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                        <PlusCircle className="h-4 w-4" />
                        Nuova Richiesta
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Nuova Richiesta Ferie/Permessi</DialogTitle>
                        <DialogDescription>Compila i dettagli per la tua richiesta di assenza.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleNewRequestSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="type" className="text-right">Tipo</Label>
                             <Select required>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Seleziona tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="vacation">Ferie</SelectItem>
                                    <SelectItem value="sick-leave">Malattia</SelectItem>
                                    <SelectItem value="permission">Permesso</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="from-date" className="text-right">Dal</Label>
                            <Input id="from-date" type="date" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="to-date" className="text-right">Al</Label>
                            <Input id="to-date" type="date" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="reason" className="text-right pt-2">Motivo</Label>
                            <Textarea id="reason" className="col-span-3" placeholder="Opzionale: fornisci un motivo per la tua richiesta." />
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Tipo</TableHead>
              <TableHead>Dal</TableHead>
              <TableHead>Al</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead><span className="sr-only">Azioni</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((req) => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">{req.type}</TableCell>
                <TableCell>{req.from}</TableCell>
                <TableCell>{req.to}</TableCell>
                <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
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
      </CardContent>
    </Card>

    <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Motivo del Rifiuto</AlertDialogTitle>
                <AlertDialogDescription>
                    Si prega di fornire un motivo per il rifiuto di questa richiesta di ferie. Questo sarà condiviso con l'operatore.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea placeholder="Es. Esigenze operative critiche in questo periodo." />
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setSelectedRequest(null)}>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={handleRejectSubmit}>Conferma Rifiuto</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
