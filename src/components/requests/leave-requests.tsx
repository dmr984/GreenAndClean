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
    { id: "LR001", type: "Vacation", from: "2024-08-15", to: "2024-08-20", status: "Approved", reason: "Family trip.", adminNotes: "" },
    { id: "LR002", type: "Sick Leave", from: "2024-07-25", to: "2024-07-25", status: "Approved", reason: "", adminNotes: "" },
    { id: "LR003", type: "Permission", from: "2024-07-30", to: "2024-07-30", status: "Rejected", reason: "Doctor's appointment.", adminNotes: "Operational needs. Please reschedule." },
    { id: "LR004", type: "Vacation", from: "2024-09-01", to: "2024-09-07", status: "Pending", reason: "Annual leave.", adminNotes: "" },
];

export function LeaveRequests() {
  const [requests, setRequests] = React.useState(initialRequests);
  const [isNewRequestOpen, setIsNewRequestOpen] = React.useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = React.useState(false);
  const [selectedRequest, setSelectedRequest] = React.useState<(typeof initialRequests)[0] | null>(null);
  const { toast } = useToast();

  const handleNewRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast({ title: "Request Submitted", description: "Your leave request has been sent for approval." });
    setIsNewRequestOpen(false);
  }
  
  const handleApprove = (id: string) => {
    setRequests(reqs => reqs.map(r => r.id === id ? { ...r, status: "Approved" } : r));
    toast({ title: "Request Approved", variant: "default" });
  }

  const handleRejectSubmit = () => {
    if (!selectedRequest) return;
    setRequests(reqs => reqs.map(r => r.id === selectedRequest.id ? { ...r, status: "Rejected" } : r));
    toast({ title: "Request Rejected", variant: "destructive" });
    setIsRejectDialogOpen(false);
    setSelectedRequest(null);
  }

  const openRejectDialog = (request: (typeof initialRequests)[0]) => {
    setSelectedRequest(request);
    setIsRejectDialogOpen(true);
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
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle>Leave Requests</CardTitle>
                <CardDescription>Manage your vacation and permission requests.</CardDescription>
            </div>
            <Dialog open={isNewRequestOpen} onOpenChange={setIsNewRequestOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                        <PlusCircle className="h-4 w-4" />
                        New Request
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>New Leave Request</DialogTitle>
                        <DialogDescription>Fill in the details for your time off request.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleNewRequestSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="type" className="text-right">Type</Label>
                             <Select required>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="vacation">Vacation</SelectItem>
                                    <SelectItem value="sick-leave">Sick Leave</SelectItem>
                                    <SelectItem value="permission">Permission</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="from-date" className="text-right">From</Label>
                            <Input id="from-date" type="date" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="to-date" className="text-right">To</Label>
                            <Input id="to-date" type="date" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="reason" className="text-right pt-2">Reason</Label>
                            <Textarea id="reason" className="col-span-3" placeholder="Optional: provide a reason for your request." />
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
              <TableHead className="w-[120px]">Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
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
                      <DropdownMenuItem onSelect={() => openRejectDialog(req)} className="text-destructive">
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

    <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Reason for Rejection</AlertDialogTitle>
                <AlertDialogDescription>
                    Please provide a reason for rejecting this leave request. This will be shared with the operator.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea placeholder="e.g., Critical operational needs during this period." />
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setSelectedRequest(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRejectSubmit}>Confirm Rejection</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
