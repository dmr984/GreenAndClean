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

const initialRequests = [
    { id: "SR001", item: "All-Purpose Cleaner", quantity: 5, status: "Approved" },
    { id: "SR002", item: "Microfiber Cloths", quantity: 50, status: "Pending" },
    { id: "SR003", item: "Glass Cleaner", quantity: 2, status: "Rejected" },
    { id: "SR004", item: "Heavy Duty Gloves", quantity: 10, status: "Approved" },
];

export function SupplyRequests() {
  const [requests, setRequests] = React.useState(initialRequests);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast({ title: "Request Submitted", description: "Your supply request has been sent." });
    setIsDialogOpen(false);
  }
  
  const handleApprove = (id: string) => {
    setRequests(reqs => reqs.map(r => r.id === id ? { ...r, status: "Approved" } : r));
    toast({ title: "Request Approved", variant: "default" });
  }

  const handleReject = (id: string) => {
    setRequests(reqs => reqs.map(r => r.id === id ? { ...r, status: "Rejected" } : r));
    toast({ title: "Request Rejected", variant: "destructive" });
  }

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" => {
    switch (status) {
      case "Approved":
        return "default";
      case "Pending":
        return "secondary";
      case "Rejected":
        return "destructive";
      default:
        return "secondary";
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle>Supply Requests</CardTitle>
                <CardDescription>Request cleaning products and supplies.</CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                        <PlusCircle className="h-4 w-4" />
                        New Request
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>New Supply Request</DialogTitle>
                        <DialogDescription>
                            Specify the product and quantity needed.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="item" className="text-right">Product</Label>
                            <Input id="item" placeholder="e.g., All-Purpose Cleaner" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="quantity" className="text-right">Quantity</Label>
                            <Input id="quantity" type="number" placeholder="e.g., 5" className="col-span-3" required/>
                        </div>
                        <DialogFooter>
                            <Button type="submit">Submit Request</Button>
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
              <TableHead>Product</TableHead>
              <TableHead className="w-[100px]">Quantity</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[80px]"><span className="sr-only">Actions</span></TableHead>
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
                      <Button aria-haspopup="true" size="icon" variant="ghost" disabled={req.status !== 'Pending'}>
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Admin Actions</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => handleApprove(req.id)}>
                        <Check className="mr-2 h-4 w-4" />
                        Approve
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleReject(req.id)} className="text-destructive">
                        <X className="mr-2 h-4 w-4" />
                        Reject
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
  );
}
