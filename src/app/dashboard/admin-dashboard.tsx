'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, CalendarCheck, Package, ClipboardCheck, Megaphone, Clock, Warehouse, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

// Mock types to match the request pages
type LeaveRequest = {
  id: string;
  status: string;
};
type SupplyRequest = {
  id: string;
  status: 'In attesa' | 'Approvata' | 'Rifiutata' | 'Parziale';
};
type Shift = {
  id: string;
  endTime: string | null;
  status: 'In attesa' | 'Approvato';
}
type ExtraShiftRequest = {
  id: string;
  status: 'pending' | 'approved';
}

export function AdminDashboard() {
  const [pendingLeaveRequests, setPendingLeaveRequests] = React.useState(0);
  const [pendingSupplyRequests, setPendingSupplyRequests] = React.useState(0);
  const [pendingShifts, setPendingShifts] = React.useState(0);
  const [pendingExtraShifts, setPendingExtraShifts] = React.useState(0);
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isResetDialogOpen, setIsResetDialogOpen] = React.useState(false);
  const [resetConfirmation, setResetConfirmation] = React.useState('');


  React.useEffect(() => {
    if (!firestore) return;

    // --- Leave Requests ---
    const leaveQuery = query(collection(firestore, 'leave-requests'), where('status', '==', 'In attesa'));
    const unsubLeave = onSnapshot(leaveQuery, snapshot => {
        setPendingLeaveRequests(snapshot.size);
    });

    // --- Supply Requests ---
    const supplyQuery = query(collection(firestore, 'supply-requests'), where('status', '==', 'In attesa'));
    const unsubSupply = onSnapshot(supplyQuery, snapshot => {
        setPendingSupplyRequests(snapshot.size);
    });

    // --- Shift Approvals ---
    const shiftsQuery = query(collection(firestore, 'shifts'), where('status', '==', 'In attesa'));
     const unsubShifts = onSnapshot(shiftsQuery, snapshot => {
        const completedPendingShifts = snapshot.docs.filter(doc => doc.data().endTime).length;
        setPendingShifts(completedPendingShifts);
    });

    // --- Extra Shift Requests ---
     const extraShiftsQuery = query(collection(firestore, 'extra-shift-requests'), where('status', '==', 'pending'));
     const unsubExtraShifts = onSnapshot(extraShiftsQuery, snapshot => {
        setPendingExtraShifts(snapshot.size);
    });

    return () => {
        unsubLeave();
        unsubSupply();
        unsubShifts();
        unsubExtraShifts();
    };

  }, [firestore]);

  const handleResetData = async () => {
    if (resetConfirmation !== 'AZZERA TUTTO') {
        toast({ title: 'Conferma non valida', description: 'Scrivi "AZZERA TUTTO" per confermare.', variant: 'destructive' });
        return;
    }
    if (!firestore) return;

    const collectionsToDelete = ['shifts', 'leave-requests', 'supply-requests', 'announcements', 'extra-shift-requests', 'communications'];
    
    toast({ title: 'Azzeramento in corso...', description: 'Potrebbe richiedere qualche secondo.' });

    try {
        const batch = writeBatch(firestore);
        for (const coll of collectionsToDelete) {
            const querySnapshot = await getDocs(collection(firestore, coll));
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
        }
        await batch.commit();

        toast({ title: 'Azzeramento Completato', description: 'Tutti i dati transazionali sono stati eliminati.', variant: 'default' });

    } catch (error) {
        console.error("Error resetting data:", error);
        toast({ title: 'Errore', description: 'Impossibile completare l\'azzeramento dei dati.', variant: 'destructive' });
    } finally {
        setIsResetDialogOpen(false);
        setResetConfirmation('');
    }
  }


  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/dashboard/users" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Briefcase className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Gestione Operatori</CardTitle>
                </CardContent>
            </Card>
        </Link>
         <Link href="/dashboard/leave-requests" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                {pendingLeaveRequests > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {pendingLeaveRequests}
                  </Badge>
                }
                <CardHeader>
                    <CalendarCheck className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Richieste Ferie</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/supply-requests" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                {pendingSupplyRequests > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {pendingSupplyRequests}
                  </Badge>
                }
                <CardHeader>
                    <Package className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Richieste Forniture</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/announcements" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center">
                <CardHeader>
                    <Megaphone className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Annunci</CardTitle>
                </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/shift-approval" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                 {pendingShifts > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {pendingShifts}
                  </Badge>
                }
                <CardHeader>
                    <ClipboardCheck className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Approvazione Turni</CardTitle>
                </CardContent>
            </Card>
        </Link>
         <Link href="/dashboard/extra-shifts" className="h-full">
            <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center relative">
                 {pendingExtraShifts > 0 &&
                  <Badge variant="destructive" className="absolute -top-2 -right-2 text-sm sm:text-base h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full">
                    {pendingExtraShifts}
                  </Badge>
                }
                <CardHeader>
                    <Clock className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <CardTitle className="text-xl sm:text-2xl">Timbrature Extra</CardTitle>
                </CardContent>
            </Card>
        </Link>
      </div>
      
      <Card className="mt-8 border-destructive/50">
        <CardHeader>
            <div className="flex items-center gap-4">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <CardTitle>Zona Pericolosa</CardTitle>
            </div>
            <CardDescription>
                Questa azione è irreversibile. Eliminerà tutti i dati relativi a turni, ferie, richieste di forniture, annunci e comunicazioni. Gli account utente non verranno eliminati.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <Button variant="destructive" onClick={() => setIsResetDialogOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Azzera Dati Applicazione
            </Button>
        </CardContent>
      </Card>

      <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                <AlertDialogDescription>
                    Questa azione non può essere annullata. Tutti i dati transazionali verranno eliminati in modo permanente. Per confermare, scrivi <span className="font-bold text-foreground">AZZERA TUTTO</span> nel campo qui sotto.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <Input 
                value={resetConfirmation}
                onChange={(e) => setResetConfirmation(e.target.value)}
                placeholder='Scrivi "AZZERA TUTTO"'
            />
            <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetData}>Conferma e Azzera</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
