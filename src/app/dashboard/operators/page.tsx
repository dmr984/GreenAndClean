'use client';
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc, query, where, collectionGroup, Query } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2, PlusCircle, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser } from '@/hooks/use-user';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

type WorkSchedule = {
    [key in DayOfWeek]?: number;
};

const dayLabels: Record<DayOfWeek, string> = {
    monday: 'Lunedì',
    tuesday: 'Martedì',
    wednesday: 'Mercoledì',
    thursday: 'Giovedì',
    friday: 'Venerdì',
    saturday: 'Sabato',
    sunday: 'Domenica',
};

const weekDays: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];


type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    role: 'operator';
    visibleInLogin: boolean;
    workSchedule: WorkSchedule;
};

export default function ManageOperatorsPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [operators, setOperators] = useState<Operator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [operatorToDelete, setOperatorToDelete] = useState<Operator | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
    const [pendingCounts, setPendingCounts] = useState<Record<string, {shifts: number, leaves: number}>>({});

    
    // Form state
    const [newFirstName, setNewFirstName] = useState("");
    const [newLastName, setNewLastName] = useState("");
    const [newWorkSchedule, setNewWorkSchedule] = useState<WorkSchedule>({});

    const [editingFirstName, setEditingFirstName] = useState("");
    const [editingLastName, setEditingLastName] = useState("");
    const [editingWorkSchedule, setEditingWorkSchedule] = useState<WorkSchedule>({});


    const operatorsQuery = useMemoFirebase(() => {
        if (!firestore || !user || user.role !== 'admin') return null;
        return query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
    }, [firestore, user]);

    useEffect(() => {
        if (!operatorsQuery || !firestore) {
            if (!isUserLoading && user?.role === 'admin') {
                 setIsLoading(false);
            }
            return;
        }

        const unsubscribeOperators = onSnapshot(operatorsQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Operator[];
            usersData.sort((a,b) => a.username.localeCompare(b.username, undefined, { numeric: true }));
            setOperators(usersData);
            setIsLoading(false);

            // For each operator, set up a listener for pending items
            usersData.forEach(op => {
                const shiftsQuery = query(collection(firestore, `app-users/${op.id}/timbrature`), where('status', '==', 'sospesa'));
                const leavesQuery = query(collection(firestore, `app-users/${op.id}/requests`), where('status', '==', 'in_attesa'));
                
                onSnapshot(shiftsQuery, (shiftSnapshot) => {
                    const pendingDays = new Set(shiftSnapshot.docs.map(d => d.data().timestamp.toDate().toDateString()));
                    setPendingCounts(prev => ({
                        ...prev,
                        [op.id]: { ...prev[op.id], shifts: pendingDays.size }
                    }));
                });

                onSnapshot(leavesQuery, (leaveSnapshot) => {
                     setPendingCounts(prev => ({
                        ...prev,
                        [op.id]: { ...prev[op.id], leaves: leaveSnapshot.size }
                    }));
                });
            });

        }, (error) => {
            if (error.code === 'permission-denied') {
                const contextualError = new FirestorePermissionError({ operation: 'list', path: 'app-users' });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                 console.error("Error fetching operators:", error);
                 toast({ title: "Errore", description: "Impossibile caricare gli operatori.", variant: "destructive" });
            }
            setIsLoading(false);
        });
        
        return () => {
            unsubscribeOperators();
        };
    }, [operatorsQuery, toast, firestore, user, isUserLoading]);
    
    const handleWorkScheduleChange = (
      setter: React.Dispatch<React.SetStateAction<WorkSchedule>>,
      day: DayOfWeek,
      value: string
    ) => {
        const hours = value ? parseFloat(value) : 0;
        setter(prev => ({
            ...prev,
            [day]: hours >= 0 ? hours : 0
        }));
    };

    const handleFormSubmit = async (
        e: React.FormEvent,
        action: 'add' | 'edit'
    ) => {
        e.preventDefault();

        const firstName = action === 'add' ? newFirstName : editingFirstName;
        const lastName = action === 'add' ? newLastName : editingLastName;
        const workSchedule = action === 'add' ? newWorkSchedule : editingWorkSchedule;

        if (!firestore || !firstName.trim() || !lastName.trim()) {
            toast({
                title: "Campi Mancanti",
                description: "Nome e cognome sono obbligatori.",
                variant: "destructive",
            });
            return;
        }
        
        // Ensure all days are present in the schedule, defaulting to 0 if not entered
        const finalWorkSchedule: WorkSchedule = {};
        weekDays.forEach(day => {
            finalWorkSchedule[day] = workSchedule[day] || 0;
        });

        const generatedUsername = `${firstName} ${lastName}`;
        
        const operatorData = {
            username: generatedUsername,
            role: 'operator' as const,
            visibleInLogin: true,
            firstName,
            lastName,
            workSchedule: finalWorkSchedule,
        };

        if (action === 'add') {
             addDoc(collection(firestore, 'app-users'), operatorData)
              .then(() => {
                toast({ title: "Successo", description: `Operatore "${generatedUsername}" aggiunto.` });
                setIsAddDialogOpen(false);
                setNewFirstName("");
                setNewLastName("");
                setNewWorkSchedule({});
              }).catch((error: any) => {
                if (error.code === 'permission-denied') {
                     errorEmitter.emit('permission-error', new FirestorePermissionError({ operation: 'create', path: 'app-users', requestResourceData: operatorData }));
                } else {
                     toast({ title: "Errore", description: "Impossibile aggiungere l'operatore.", variant: "destructive" });
                }
            });
        } else if (action === 'edit' && selectedOperator) {
            const operatorRef = doc(firestore, 'app-users', selectedOperator.id);
            // We only update the fields that can be edited, role and visibility are managed separately.
            const updatePayload = {
                 username: generatedUsername,
                 firstName,
                 lastName,
                 workSchedule: finalWorkSchedule
            };

            updateDoc(operatorRef, updatePayload)
            .then(() => {
                toast({ title: "Successo", description: "Dati operatore aggiornati." });
                setIsEditDialogOpen(false);
                setSelectedOperator(null);
            }).catch((error: any) => {
                 if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ operation: 'update', path: operatorRef.path, requestResourceData: updatePayload }));
                } else {
                     toast({ title: "Errore", description: "Impossibile aggiornare l'operatore.", variant: "destructive" });
                }
            });
        }
    };


    const handleDeleteOperator = async () => {
        if (!firestore || !operatorToDelete) return;

        const operatorRef = doc(firestore, 'app-users', operatorToDelete.id);
        deleteDoc(operatorRef)
            .then(() => {
                toast({
                    title: "Successo",
                    description: `Operatore "${operatorToDelete.username}" eliminato.`
                });
            }).catch((error: any) => {
                if (error.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'delete',
                        path: operatorRef.path,
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                     toast({
                        title: "Errore",
                        description: "Impossibile eliminare l'operatore.",
                        variant: "destructive",
                    });
                }
            }).finally(() => {
                setOperatorToDelete(null);
            });
    };


    const handleVisibilityChange = (operatorId: string, newVisibility: boolean) => {
        if (!firestore) return;
        const operatorRef = doc(firestore, 'app-users', operatorId);
        const updatePayload = { visibleInLogin: newVisibility };
        
        updateDoc(operatorRef, updatePayload)
            .catch((error) => {
                if (error.code === 'permission-denied') {
                    const contextualError = new FirestorePermissionError({
                        operation: 'update',
                        path: operatorRef.path,
                        requestResourceData: updatePayload
                    });
                    errorEmitter.emit('permission-error', contextualError);
                } else {
                    toast({
                        title: "Errore",
                        description: "Impossibile aggiornare la visibilità.",
                        variant: "destructive",
                    });
                }
            });
    };

    const formatWorkSchedule = (schedule: WorkSchedule) => {
        if (!schedule || Object.keys(schedule).length === 0) return 'N/D';
        const dayMapping: Record<DayOfWeek, string> = { monday: 'Lun', tuesday: 'Mar', wednesday: 'Mer', thursday: 'Gio', friday: 'Ven', saturday: 'Sab', sunday: 'Dom' };
        
        return weekDays
            .filter(day => schedule[day] && schedule[day]! > 0)
            .map(day => `${dayMapping[day]}: ${schedule[day]}h`)
            .join(', ');
    };
    
    if (isUserLoading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!user || user.role !== 'admin') {
         return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Accesso Negato.</p></div>;
    }

    const renderWorkScheduleFields = (
        schedule: WorkSchedule,
        handler: (day: DayOfWeek, value: string) => void,
        prefix: string
    ) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {weekDays.map(day => (
                <div key={`${prefix}-${day}`} className="grid grid-cols-2 items-center gap-2">
                    <Label htmlFor={`${prefix}-${day}`}>{dayLabels[day]}</Label>
                    <Input 
                        id={`${prefix}-${day}`}
                        type="number"
                        placeholder="Ore"
                        value={schedule[day] || ''}
                        onChange={(e) => handler(day, e.target.value)}
                        min="0"
                        step="0.5"
                    />
                </div>
            ))}
        </div>
    );

    return (
        <>
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Users className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl">Gestione Operatori</CardTitle>
                    </div>
                     <div className="flex flex-col sm:flex-row gap-2">
                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi Operatore
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-2xl">
                                <form onSubmit={(e) => handleFormSubmit(e, 'add')}>
                                    <DialogHeader>
                                        <DialogTitle>Aggiungi Nuovo Operatore</DialogTitle>
                                        <DialogDescription>
                                            Inserisci i dati e il programma lavorativo settimanale.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-6 py-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label htmlFor="new-firstName">Nome</Label>
                                                <Input id="new-firstName" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} required />
                                            </div>
                                             <div>
                                                <Label htmlFor="new-lastName">Cognome</Label>
                                                <Input id="new-lastName" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} required />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="mb-2 block">Programma Lavorativo (ore per giorno)</Label>
                                            {renderWorkScheduleFields(newWorkSchedule, (day, value) => handleWorkScheduleChange(setNewWorkSchedule, day, value), 'new')}
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit">Salva Operatore</Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                     </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome Operatore</TableHead>
                                        <TableHead>Programma Lavorativo</TableHead>
                                        <TableHead>Visibile nel Login</TableHead>
                                        <TableHead className="text-right w-[160px]">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {operators.map((operator) => {
                                        const pending = pendingCounts[operator.id];
                                        const totalPending = (pending?.shifts || 0) + (pending?.leaves || 0);
                                        return (
                                            <TableRow key={operator.id} onClick={() => router.push(`/dashboard/operators/${operator.id}`)} className="cursor-pointer">
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <span>{operator.username}</span>
                                                        {totalPending > 0 && <Badge variant="destructive">{totalPending}</Badge>}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{formatWorkSchedule(operator.workSchedule)}</TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <Switch
                                                        checked={operator.visibleInLogin}
                                                        onCheckedChange={(checked) => handleVisibilityChange(operator.id, checked)}
                                                        aria-label={`Toggle visibility for ${operator.username}`}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" onClick={() => { setSelectedOperator(operator); setEditingFirstName(operator.firstName); setEditingLastName(operator.lastName); setEditingWorkSchedule(operator.workSchedule || {}); setIsEditDialogOpen(true);}}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setOperatorToDelete(operator)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <form onSubmit={(e) => handleFormSubmit(e, 'edit')}>
                        <DialogHeader>
                            <DialogTitle>Modifica Operatore</DialogTitle>
                            <DialogDescription>
                                Modifica i dati e il programma lavorativo dell'operatore.
                            </DialogDescription>
                        </DialogHeader>
                         <div className="grid gap-6 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="editing-firstName">Nome</Label>
                                    <Input id="editing-firstName" value={editingFirstName} onChange={(e) => setEditingFirstName(e.target.value)} required />
                                </div>
                                    <div>
                                    <Label htmlFor="editing-lastName">Cognome</Label>
                                    <Input id="editing-lastName" value={editingLastName} onChange={(e) => setEditingLastName(e.target.value)} required />
                                </div>
                            </div>
                            <div>
                                <Label className="mb-2 block">Programma Lavorativo (ore per giorno)</Label>
                                {renderWorkScheduleFields(editingWorkSchedule, (day, value) => handleWorkScheduleChange(setEditingWorkSchedule, day, value), 'edit')}
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit">Salva Modifiche</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!operatorToDelete} onOpenChange={(open) => !open && setOperatorToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione eliminerà l'operatore "{operatorToDelete?.username}" dal database in modo permanente. Questa azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOperator}>Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
