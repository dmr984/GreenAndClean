'use client';
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc, query, where, collectionGroup, Query, getDocs } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter, useMemoFirebase } from '@/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2, PlusCircle, Pencil, Trash2, Copy, CheckCircle, XCircle } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

type DailySchedule = {
    totalHours?: number;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number;
};

type WorkSchedule = {
    [key in DayOfWeek]?: DailySchedule;
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
    requireGps?: boolean;
    workSchedule: WorkSchedule;
    entryTolerance?: number;
    ordinaryHalfHourTrigger?: number;
    ordinaryHourTrigger?: number;
    scheduleType?: 'daily' | 'monthly';
    monthlyContractualHours?: number;
    overtimeHalfHourTrigger?: number;
    overtimeHourTrigger?: number;
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
    sickLeaveRate?: number;
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
    const [newOperatorCode, setNewOperatorCode] = useState("");
    const [newFirstName, setNewFirstName] = useState("");
    const [newLastName, setNewLastName] = useState("");
    const [newRequireGps, setNewRequireGps] = useState(true);
    const [newWorkSchedule, setNewWorkSchedule] = useState<WorkSchedule>({});
    const [newOvertimeHalfHourTrigger, setNewOvertimeHalfHourTrigger] = useState<number | string>(25);
    const [newOvertimeHourTrigger, setNewOvertimeHourTrigger] = useState<number | string>(45);
    const [newSalaryType, setNewSalaryType] = useState<'hourly' | 'fixed'>('hourly');
    const [newHourlyRate, setNewHourlyRate] = useState<number | string>('');
    const [newOvertimeRate, setNewOvertimeRate] = useState<number | string>('');
    const [newFixedSalary, setNewFixedSalary] = useState<number | string>('');
    const [newSickLeaveRate, setNewSickLeaveRate] = useState<number | string>('');
    const [newEntryTolerance, setNewEntryTolerance] = useState<number | string>(15);
    const [newOrdinaryHalfHourTrigger, setNewOrdinaryHalfHourTrigger] = useState<number | string>('');
    const [newOrdinaryHourTrigger, setNewOrdinaryHourTrigger] = useState<number | string>('');
    const [newScheduleType, setNewScheduleType] = useState<'daily' | 'monthly'>('daily');
    const [newMonthlyContractualHours, setNewMonthlyContractualHours] = useState<number | string>('');


    const [editingOperatorCode, setEditingOperatorCode] = useState("");
    const [editingFirstName, setEditingFirstName] = useState("");
    const [editingLastName, setEditingLastName] = useState("");
    const [editingRequireGps, setEditingRequireGps] = useState(true);
    const [editingWorkSchedule, setEditingWorkSchedule] = useState<WorkSchedule>({});
    const [editingOvertimeHalfHourTrigger, setEditingOvertimeHalfHourTrigger] = useState<number | string>('');
    const [editingOvertimeHourTrigger, setEditingOvertimeHourTrigger] = useState<number | string>('');
    const [editingSalaryType, setEditingSalaryType] = useState<'hourly' | 'fixed'>('hourly');
    const [editingHourlyRate, setEditingHourlyRate] = useState<number | string>('');
    const [editingOvertimeRate, setEditingOvertimeRate] = useState<number | string>('');
    const [editingFixedSalary, setEditingFixedSalary] = useState<number | string>('');
    const [editingSickLeaveRate, setEditingSickLeaveRate] = useState<number | string>('');
    const [editingEntryTolerance, setEditingEntryTolerance] = useState<number | string>(15);
    const [editingOrdinaryHalfHourTrigger, setEditingOrdinaryHalfHourTrigger] = useState<number | string>('');
    const [editingOrdinaryHourTrigger, setEditingOrdinaryHourTrigger] = useState<number | string>('');
    const [editingScheduleType, setEditingScheduleType] = useState<'daily' | 'monthly'>('daily');
    const [editingMonthlyContractualHours, setEditingMonthlyContractualHours] = useState<number | string>('');


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
                        [op.id]: { ...(prev[op.id] || {shifts:0, leaves: 0}), shifts: pendingDays.size }
                    }));
                });

                onSnapshot(leavesQuery, (leaveSnapshot) => {
                     setPendingCounts(prev => ({
                        ...prev,
                        [op.id]: { ...(prev[op.id] || {shifts:0, leaves: 0}), leaves: leaveSnapshot.size }
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
      field: keyof DailySchedule,
      value: string | number
    ) => {
        setter(prev => {
            const daySchedule = { ...(prev[day] || {}) };
            
            if (field === 'totalHours' || field === 'breakMinutes') {
                daySchedule[field] = value ? parseFloat(String(value)) : undefined;
            } else {
                (daySchedule as any)[field] = value || undefined;
            }

            return { ...prev, [day]: daySchedule };
        });
    };

    const handleCopyFromPreviousDay = (
        setter: React.Dispatch<React.SetStateAction<WorkSchedule>>,
        day: DayOfWeek
    ) => {
        const previousDayIndex = weekDays.indexOf(day) - 1;
        if (previousDayIndex < 0) return;

        const previousDayKey = weekDays[previousDayIndex];

        setter(prev => {
            const previousDaySchedule = prev[previousDayKey] || {};
            return {
                ...prev,
                [day]: { ...previousDaySchedule }
            };
        });
        toast({ title: 'Copiato!', description: `Orario di ${dayLabels[day]} impostato come quello di ${dayLabels[previousDayKey]}.`, duration: 2000 });
    };

    const handleFormSubmit = async (
        e: React.FormEvent,
        action: 'add' | 'edit'
    ) => {
        e.preventDefault();

        const operatorCode = action === 'add' ? newOperatorCode : editingOperatorCode;
        const firstName = action === 'add' ? newFirstName : editingFirstName;
        const lastName = action === 'add' ? newLastName : editingLastName;
        const requireGps = action === 'add' ? newRequireGps : editingRequireGps;
        const workSchedule = action === 'add' ? newWorkSchedule : editingWorkSchedule;
        const overtimeHalfHourTrigger = action === 'add' ? newOvertimeHalfHourTrigger : editingOvertimeHalfHourTrigger;
        const overtimeHourTrigger = action === 'add' ? newOvertimeHourTrigger : editingOvertimeHourTrigger;
        const salaryType = action === 'add' ? newSalaryType : editingSalaryType;
        const hourlyRate = action === 'add' ? newHourlyRate : editingHourlyRate;
        const overtimeRate = action === 'add' ? newOvertimeRate : editingOvertimeRate;
        const fixedSalary = action === 'add' ? newFixedSalary : editingFixedSalary;
        const sickLeaveRate = action === 'add' ? newSickLeaveRate : editingSickLeaveRate;
        
        const entryTolerance = action === 'add' ? newEntryTolerance : editingEntryTolerance;
        const ordinaryHalfHourTrigger = action === 'add' ? newOrdinaryHalfHourTrigger : editingOrdinaryHalfHourTrigger;
        const ordinaryHourTrigger = action === 'add' ? newOrdinaryHourTrigger : editingOrdinaryHourTrigger;
        const scheduleType = action === 'add' ? newScheduleType : editingScheduleType;
        const monthlyContractualHours = action === 'add' ? newMonthlyContractualHours : editingMonthlyContractualHours;

        if (!firestore || !firstName.trim() || !lastName.trim() || !operatorCode.trim()) {
            toast({
                title: "Campi Mancanti",
                description: "Codice operatore, nome e cognome sono obbligatori.",
                variant: "destructive",
            });
            return;
        }

        // Check for unique operator code
        const usersRef = collection(firestore, 'app-users');
        const q = query(usersRef, where("username", "==", operatorCode.trim()));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty && (action === 'add' || querySnapshot.docs[0].id !== selectedOperator?.id)) {
             toast({
                title: "Codice Esistente",
                description: "Questo codice operatore è già in uso. Scegline un altro.",
                variant: "destructive",
            });
            return;
        }
        
        const finalWorkSchedule: WorkSchedule = {};
        for (const day of weekDays) {
            const daySchedule = workSchedule[day];
            if (daySchedule && (daySchedule.totalHours || daySchedule.startTime)) {
                const newDaySchedule: DailySchedule = {};
                if (daySchedule.totalHours) newDaySchedule.totalHours = parseFloat(String(daySchedule.totalHours));
                if (daySchedule.startTime) newDaySchedule.startTime = daySchedule.startTime;
                if (daySchedule.breakMinutes) newDaySchedule.breakMinutes = parseFloat(String(daySchedule.breakMinutes));
                if (Object.keys(newDaySchedule).length > 0) {
                    finalWorkSchedule[day] = newDaySchedule;
                }
            }
        }
        
        const operatorData: Omit<Operator, 'id'> = {
            username: operatorCode.trim(),
            role: 'operator' as const,
            firstName,
            lastName,
            requireGps,
            workSchedule: finalWorkSchedule,
            entryTolerance: entryTolerance ? parseFloat(String(entryTolerance)) : undefined,
            ordinaryHalfHourTrigger: ordinaryHalfHourTrigger ? parseFloat(String(ordinaryHalfHourTrigger)) : undefined,
            ordinaryHourTrigger: ordinaryHourTrigger ? parseFloat(String(ordinaryHourTrigger)) : undefined,
            scheduleType,
            monthlyContractualHours: scheduleType === 'monthly' ? parseFloat(String(monthlyContractualHours)) || 0 : undefined,
            overtimeHalfHourTrigger: overtimeHalfHourTrigger ? parseFloat(String(overtimeHalfHourTrigger)) : undefined,
            overtimeHourTrigger: overtimeHourTrigger ? parseFloat(String(overtimeHourTrigger)) : undefined,
            salaryType,
            hourlyRate: salaryType === 'hourly' ? parseFloat(String(hourlyRate)) || 0 : 0,
            overtimeRate: parseFloat(String(overtimeRate)) || 0,
            fixedSalary: salaryType === 'fixed' ? parseFloat(String(fixedSalary)) || 0 : 0,
            sickLeaveRate: parseFloat(String(sickLeaveRate)) || 0,
        };

        if (action === 'add') {
             addDoc(collection(firestore, 'app-users'), operatorData)
              .then(() => {
                toast({ title: "Successo", description: `Operatore con codice "${operatorCode}" aggiunto.` });
                setIsAddDialogOpen(false);
                // Reset form fields
                setNewOperatorCode("");
                setNewFirstName("");
                setNewLastName("");
                setNewRequireGps(true);
                setNewWorkSchedule({});
                setNewOvertimeHalfHourTrigger(25);
                setNewOvertimeHourTrigger(45);
                setNewSalaryType('hourly');
                setNewHourlyRate('');
                setNewOvertimeRate('');
                setNewFixedSalary('');
                setNewSickLeaveRate('');
                setNewEntryTolerance(15);
                setNewOrdinaryHalfHourTrigger('');
                setNewOrdinaryHourTrigger('');
                setNewScheduleType('daily');
                setNewMonthlyContractualHours('');
              }).catch((error: any) => {
                if (error.code === 'permission-denied') {
                     errorEmitter.emit('permission-error', new FirestorePermissionError({ operation: 'create', path: 'app-users', requestResourceData: operatorData }));
                } else {
                     toast({ title: "Errore", description: "Impossibile aggiungere l'operatore.", variant: "destructive" });
                }
            });
        } else if (action === 'edit' && selectedOperator) {
            const operatorRef = doc(firestore, 'app-users', selectedOperator.id);
            updateDoc(operatorRef, operatorData as any)
            .then(() => {
                toast({ title: "Successo", description: "Dati operatore aggiornati." });
                setIsEditDialogOpen(false);
                setSelectedOperator(null);
            }).catch((error: any) => {
                 if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ operation: 'update', path: operatorRef.path, requestResourceData: operatorData }));
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
                    description: `Operatore "${operatorToDelete.firstName} ${operatorToDelete.lastName}" eliminato.`
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

    const formatWorkSchedule = (schedule: WorkSchedule) => {
        if (!schedule || Object.keys(schedule).length === 0) return 'N/D';
        const dayMapping: Record<DayOfWeek, string> = { monday: 'Lun', tuesday: 'Mar', wednesday: 'Mer', thursday: 'Gio', friday: 'Ven', saturday: 'Sab', sunday: 'Dom' };
        
        return weekDays
            .filter(day => schedule[day] && (schedule[day]?.totalHours || 0) > 0)
            .map(day => {
                const s = schedule[day];
                let display = `${dayMapping[day]}: ${s?.totalHours}h`;
                if(s?.startTime) {
                    display += ` (${s.startTime})`
                }
                return display;
            })
            .join(' | ');
    };
    
    if (isUserLoading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!user || user.role !== 'admin') {
         return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Accesso Negato.</p></div>;
    }

    const renderWorkScheduleFields = (
        schedule: WorkSchedule,
        handler: (day: DayOfWeek, field: keyof DailySchedule, value: string | number) => void,
        copyHandler: (day: DayOfWeek) => void,
        prefix: string
    ) => (
        <div className="space-y-4">
            {weekDays.map((day, index) => (
                <div key={`${prefix}-${day}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <Label className="font-semibold">{dayLabels[day]}</Label>
                        {index > 0 && (
                             <Button type="button" variant="outline" size="sm" onClick={() => copyHandler(day)} className="h-6 px-2">
                                <Copy className="h-3 w-3 mr-1"/>
                                Copia dal precedente
                            </Button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 items-center gap-4 p-3 border rounded-md">
                        <div className="space-y-1">
                            <Label htmlFor={`${prefix}-${day}-hours`}>Ore Totali</Label>
                            <Input 
                                id={`${prefix}-${day}-hours`}
                                type="number"
                                placeholder="Es: 8"
                                value={schedule[day]?.totalHours || ''}
                                onChange={(e) => handler(day, 'totalHours', e.target.value)}
                                min="0"
                                step="0.5"
                            />
                        </div>
                         <div className="space-y-1">
                            <Label htmlFor={`${prefix}-${day}-start`}>Orario Inizio (Opz.)</Label>
                            <Input 
                                id={`${prefix}-${day}-start`}
                                type="time"
                                value={schedule[day]?.startTime || ''}
                                onChange={(e) => handler(day, 'startTime', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor={`${prefix}-${day}-break`}>Minuti Pausa (Opz.)</Label>
                            <Input
                                id={`${prefix}-${day}-break`}
                                type="number"
                                placeholder="Es: 60"
                                value={schedule[day]?.breakMinutes || ''}
                                onChange={(e) => handler(day, 'breakMinutes', e.target.value)}
                                min="0"
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderSalaryFields = (
      type: 'new' | 'edit',
      salaryType: 'hourly' | 'fixed',
      setSalaryType: (val: 'hourly' | 'fixed') => void,
      hourlyRate: string | number,
      setHourlyRate: (val: string | number) => void,
      overtimeRate: string | number,
      setOvertimeRate: (val: string | number) => void,
      fixedSalary: string | number,
      setFixedSalary: (val: string | number) => void,
      sickLeaveRate: string | number,
      setSickLeaveRate: (val: string | number) => void,
      overtimeHalfHourTrigger: string | number,
      setOvertimeHalfHourTrigger: (val: string | number) => void,
      overtimeHourTrigger: string | number,
      setOvertimeHourTrigger: (val: string | number) => void,
      entryTolerance: string | number,
      setEntryTolerance: (val: string | number) => void,
      ordinaryHalfHourTrigger: string | number,
      setOrdinaryHalfHourTrigger: (val: string | number) => void,
      ordinaryHourTrigger: string | number,
      setOrdinaryHourTrigger: (val: string | number) => void,
      scheduleType: 'daily' | 'monthly',
      setScheduleType: (val: 'daily' | 'monthly') => void,
      monthlyContractualHours: string | number,
      setMonthlyContractualHours: (val: string | number) => void
    ) => (
      <>
        <div className='md:col-span-3'>
          <Label htmlFor={`${type}-salaryType`}>Tipo di Contratto</Label>
          <Select value={salaryType} onValueChange={v => setSalaryType(v as 'hourly' | 'fixed')}>
            <SelectTrigger id={`${type}-salaryType`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Orario</SelectItem>
              <SelectItem value="fixed">Fisso Mensile</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {salaryType === 'hourly' ? (
          <>
            <div>
              <Label htmlFor={`${type}-hourlyRate`}>Tariffa Oraria (€)</Label>
              <Input id={`${type}-hourlyRate`} type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} min="0" step="0.0001" placeholder="Es: 8.50" />
            </div>
             <div>
                <Label htmlFor={`${type}-sickLeaveRate`}>Tariffa Malattia (€/h)</Label>
                <Input id={`${type}-sickLeaveRate`} type="number" value={sickLeaveRate} onChange={(e) => setSickLeaveRate(e.target.value)} min="0" step="0.0001" placeholder="Es: 7.00" />
             </div>
          </>
        ) : (
          <div className="md:col-span-3">
            <Label htmlFor={`${type}-fixedSalary`}>Importo Fisso Mensile (€)</Label>
            <Input id={`${type}-fixedSalary`} type="number" value={fixedSalary} onChange={(e) => setFixedSalary(e.target.value)} min="0" step="0.01" placeholder="Es: 1500.00" />
          </div>
        )}
        
        <div>
            <Label htmlFor={`${type}-overtimeRate`}>Tariffa Straordinari (€/h)</Label>
            <Input id={`${type}-overtimeRate`} type="number" value={overtimeRate} onChange={(e) => setOvertimeRate(e.target.value)} min="0" step="0.0001" placeholder="Es: 10.00" />
        </div>
        <div className='md:col-span-3 mt-4 mb-2'>
            <h4 className="font-semibold text-lg">Regole Straordinari (Default 25/45)</h4>
        </div>
        <div>
          <Label htmlFor={`${type}-halfHourTrigger`}>Scatto Strat. Mezz'ora (min)</Label>
          <Input id={`${type}-halfHourTrigger`} type="number" value={overtimeHalfHourTrigger} onChange={(e) => setOvertimeHalfHourTrigger(e.target.value)} min="0" max="60" placeholder="Es: 25" />
        </div>
        <div>
          <Label htmlFor={`${type}-hourTrigger`}>Scatto Strat. Ora (min)</Label>
          <Input id={`${type}-hourTrigger`} type="number" value={overtimeHourTrigger} onChange={(e) => setOvertimeHourTrigger(e.target.value)} min="0" max="60" placeholder="Es: 45" />
        </div>

        <div className='md:col-span-3 mt-4 mb-2'>
            <h4 className="font-semibold text-lg">Regole Ore Ordinarie (Opzionale)</h4>
        </div>
        <div>
          <Label htmlFor={`${type}-entryTolerance`}>Tolleranza Entrata (min)</Label>
          <Input id={`${type}-entryTolerance`} type="number" value={entryTolerance} onChange={(e) => setEntryTolerance(e.target.value)} min="0" max="60" placeholder="Es: 15" />
        </div>
        <div>
          <Label htmlFor={`${type}-ordHalfTrigger`}>Scatto Ord. Mezz'ora (min)</Label>
          <Input id={`${type}-ordHalfTrigger`} type="number" value={ordinaryHalfHourTrigger} onChange={(e) => setOrdinaryHalfHourTrigger(e.target.value)} min="0" max="60" placeholder="Es: 25" />
        </div>
        <div>
          <Label htmlFor={`${type}-ordHourTrigger`}>Scatto Ord. Ora (min)</Label>
          <Input id={`${type}-ordHourTrigger`} type="number" value={ordinaryHourTrigger} onChange={(e) => setOrdinaryHourTrigger(e.target.value)} min="0" max="60" placeholder="Es: 45" />
        </div>

        <div className='md:col-span-3 mt-4 mb-2'>
            <h4 className="font-semibold text-lg">Tipo di Pianificazione (Monte Ore)</h4>
        </div>
        <div className='md:col-span-1'>
          <Label htmlFor={`${type}-scheduleType`}>Calcolo Ore</Label>
          <Select value={scheduleType} onValueChange={v => setScheduleType(v as 'daily' | 'monthly')}>
            <SelectTrigger id={`${type}-scheduleType`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Giornaliero (Standard)</SelectItem>
              <SelectItem value="monthly">Monte Ore Mensile</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {scheduleType === 'monthly' && (
             <div className='md:col-span-2'>
                <Label htmlFor={`${type}-monthlyHours`}>Ore Contrattuali Mensili (Totali)</Label>
                <Input id={`${type}-monthlyHours`} type="number" value={monthlyContractualHours} onChange={(e) => setMonthlyContractualHours(e.target.value)} min="0" placeholder="Es: 160" />
            </div>
        )}
      </>
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
                            <DialogContent className="sm:max-w-3xl">
                                <form onSubmit={(e) => handleFormSubmit(e, 'add')}>
                                    <DialogHeader>
                                        <DialogTitle>Aggiungi Nuovo Operatore</DialogTitle>
                                        <DialogDescription>
                                            Inserisci i dati e il programma lavorativo settimanale.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto pr-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <div>
                                                <Label htmlFor="new-code">Codice Operatore</Label>
                                                <Input id="new-code" value={newOperatorCode} onChange={(e) => setNewOperatorCode(e.target.value)} required />
                                            </div>
                                            <div>
                                                <Label htmlFor="new-firstName">Nome</Label>
                                                <Input id="new-firstName" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} required />
                                            </div>
                                            <div>
                                                <Label htmlFor="new-lastName">Cognome</Label>
                                                <Input id="new-lastName" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} required />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                          {renderSalaryFields(
                                            'new',
                                            newSalaryType, setNewSalaryType,
                                            newHourlyRate, setNewHourlyRate,
                                            newOvertimeRate, setNewOvertimeRate,
                                            newFixedSalary, setNewFixedSalary,
                                            newSickLeaveRate, setNewSickLeaveRate,
                                            newOvertimeHalfHourTrigger, setNewOvertimeHalfHourTrigger,
                                            newOvertimeHourTrigger, setNewOvertimeHourTrigger,
                                            newEntryTolerance, setNewEntryTolerance,
                                            newOrdinaryHalfHourTrigger, setNewOrdinaryHalfHourTrigger,
                                            newOrdinaryHourTrigger, setNewOrdinaryHourTrigger,
                                            newScheduleType, setNewScheduleType,
                                            newMonthlyContractualHours, setNewMonthlyContractualHours
                                          )}
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Switch id="new-gps" checked={newRequireGps} onCheckedChange={setNewRequireGps} />
                                            <Label htmlFor="new-gps">Richiedi Geolocalizzazione (GPS)</Label>
                                        </div>
                                        <div>
                                            <Label className="mb-2 block font-semibold text-lg">Programma Lavorativo</Label>
                                             <Separator className="my-2" />
                                            {renderWorkScheduleFields(
                                                newWorkSchedule, 
                                                (day, field, value) => handleWorkScheduleChange(setNewWorkSchedule, day, field, value), 
                                                (day) => handleCopyFromPreviousDay(setNewWorkSchedule, day),
                                                'new'
                                            )}
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
                                        <TableHead>Codice</TableHead>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>GPS</TableHead>
                                        <TableHead>Programma</TableHead>
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
                                                <TableCell>{`${operator.firstName} ${operator.lastName}`}</TableCell>
                                                <TableCell>
                                                    {operator.requireGps ?? true ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                                                </TableCell>
                                                <TableCell>{formatWorkSchedule(operator.workSchedule)}</TableCell>
                                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" onClick={() => { setSelectedOperator(operator); setEditingOperatorCode(operator.username); setEditingFirstName(operator.firstName); setEditingLastName(operator.lastName); setEditingRequireGps(operator.requireGps ?? true); setEditingWorkSchedule(operator.workSchedule || {}); setEditingOvertimeHalfHourTrigger(operator.overtimeHalfHourTrigger ?? 25); setEditingOvertimeHourTrigger(operator.overtimeHourTrigger ?? 45); setEditingSalaryType(operator.salaryType || 'hourly'); setEditingHourlyRate(operator.hourlyRate || ''); setEditingOvertimeRate(operator.overtimeRate || ''); setEditingFixedSalary(operator.fixedSalary || ''); setEditingSickLeaveRate(operator.sickLeaveRate || ''); setEditingEntryTolerance(operator.entryTolerance ?? 15); setEditingOrdinaryHalfHourTrigger(operator.ordinaryHalfHourTrigger ?? ''); setEditingOrdinaryHourTrigger(operator.ordinaryHourTrigger ?? ''); setEditingScheduleType(operator.scheduleType || 'daily'); setEditingMonthlyContractualHours(operator.monthlyContractualHours || ''); setIsEditDialogOpen(true);}}>
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
                <DialogContent className="sm:max-w-3xl">
                    <form onSubmit={(e) => handleFormSubmit(e, 'edit')}>
                        <DialogHeader>
                            <DialogTitle>Modifica Operatore</DialogTitle>
                            <DialogDescription>
                                Modifica i dati e il programma lavorativo dell'operatore.
                            </DialogDescription>
                        </DialogHeader>
                         <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto pr-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                 <div>
                                    <Label htmlFor="editing-code">Codice Operatore</Label>
                                    <Input id="editing-code" value={editingOperatorCode} onChange={(e) => setEditingOperatorCode(e.target.value)} required />
                                </div>
                                <div>
                                    <Label htmlFor="editing-firstName">Nome</Label>
                                    <Input id="editing-firstName" value={editingFirstName} onChange={(e) => setEditingFirstName(e.target.value)} required />
                                </div>
                                <div>
                                    <Label htmlFor="editing-lastName">Cognome</Label>
                                    <Input id="editing-lastName" value={editingLastName} onChange={(e) => setEditingLastName(e.target.value)} required />
                                </div>
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {renderSalaryFields(
                                    'edit',
                                    editingSalaryType, setEditingSalaryType,
                                    editingHourlyRate, setEditingHourlyRate,
                                    editingOvertimeRate, setEditingOvertimeRate,
                                    editingFixedSalary, setEditingFixedSalary,
                                    editingSickLeaveRate, setEditingSickLeaveRate,
                                    editingOvertimeHalfHourTrigger, setEditingOvertimeHalfHourTrigger,
                                    editingOvertimeHourTrigger, setEditingOvertimeHourTrigger,
                                    editingEntryTolerance, setEditingEntryTolerance,
                                    editingOrdinaryHalfHourTrigger, setEditingOrdinaryHalfHourTrigger,
                                    editingOrdinaryHourTrigger, setEditingOrdinaryHourTrigger,
                                    editingScheduleType, setEditingScheduleType,
                                    editingMonthlyContractualHours, setEditingMonthlyContractualHours
                                  )}
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch id="edit-gps" checked={editingRequireGps} onCheckedChange={setEditingRequireGps} />
                                <Label htmlFor="edit-gps">Richiedi Geolocalizzazione (GPS)</Label>
                            </div>
                            <div>
                                <Label className="mb-2 block font-semibold text-lg">Programma Lavorativo</Label>
                                <Separator className="my-2" />
                                {renderWorkScheduleFields(
                                    editingWorkSchedule, 
                                    (day, field, value) => handleWorkScheduleChange(setEditingWorkSchedule, day, field, value), 
                                    (day) => handleCopyFromPreviousDay(setEditingWorkSchedule, day),
                                    'edit'
                                )}
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
                            Questa azione eliminerà l'operatore "{operatorToDelete?.firstName} {operatorToDelete?.lastName}" dal database in modo permanente. Questa azione non può essere annullata.
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

    