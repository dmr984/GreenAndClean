'use client';
import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, eachDayOfInterval, isSameDay, startOfDay, getDay } from 'date-fns';
import { it } from 'date-fns/locale';

type ExistingRequest = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'in_attesa' | 'approvato' | 'rifiutato';
    startDate: Timestamp;
    endDate: Timestamp;
}

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
};
type WorkSchedule = {
    [key in DayOfWeek]?: DailySchedule;
};
type Operator = {
    workSchedule?: WorkSchedule;
};


// 1. Define Zod schema
const requestSchema = z.object({
  requestType: z.enum(['ferie', 'permesso', 'malattia', 'straordinario'], { required_error: 'Devi selezionare un tipo.' }),
  startDate: z.date({ required_error: 'La data di inizio è obbligatoria.' }),
  endDate: z.date().optional(),
  hours: z.string().optional(),
  reason: z.string().optional(),
});


type RequestFormValues = z.infer<typeof requestSchema>;

interface RequestFormProps {
    userId: string;
    onFinished: () => void;
    role: 'admin' | 'operator';
}

export function RequestForm({ userId, onFinished, role }: RequestFormProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isStartPickerOpen, setIsStartPickerOpen] = useState(false);
    const [isEndPickerOpen, setIsEndPickerOpen] = useState(false);
    const [existingRequests, setExistingRequests] = useState<ExistingRequest[]>([]);
    const [bookedDays, setBookedDays] = useState<Date[]>([]);
    const [operator, setOperator] = useState<Operator | null>(null);

    useEffect(() => {
        if (!firestore || !userId) return;
        
        const fetchOperator = async () => {
            const operatorDoc = await getDoc(doc(firestore, 'app-users', userId));
            if(operatorDoc.exists()) {
                setOperator(operatorDoc.data() as Operator);
            }
        }
        fetchOperator();

        const allBookedDays = new Set<string>();
        const unsubs: (() => void)[] = [];

        // 1. Fetch approved leave/sickness requests
        const requestsQuery = query(
            collection(firestore, `app-users/${userId}/requests`),
            where('status', '==', 'approvato')
        );
        const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
            snapshot.docs.forEach(doc => {
                const req = doc.data() as ExistingRequest;
                const interval = { start: req.startDate.toDate(), end: req.endDate.toDate() };
                eachDayOfInterval(interval).forEach(day => {
                    allBookedDays.add(startOfDay(day).toISOString());
                });
            });
            setBookedDays(Array.from(allBookedDays).map(d => new Date(d)));
        });
        unsubs.push(unsubRequests);


        // 2. Fetch confirmed clock-in/out days
        const timbratureQuery = query(
            collection(firestore, `app-users/${userId}/timbrature`),
            where('status', '==', 'confermata')
        );
        const unsubTimbrature = onSnapshot(timbratureQuery, (snapshot) => {
            snapshot.docs.forEach(doc => {
                const timbratura = doc.data() as { timestamp: Timestamp };
                allBookedDays.add(startOfDay(timbratura.timestamp.toDate()).toISOString());
            });
            setBookedDays(Array.from(allBookedDays).map(d => new Date(d)));
        });
        unsubs.push(unsubTimbrature);

        // 3. Fetch approved overtime shifts
        const straordinariQuery = query(
            collection(firestore, `app-users/${userId}/straordinari`),
            where('status', '==', 'approvato')
        );
        const unsubStraordinari = onSnapshot(straordinariQuery, (snapshot) => {
            snapshot.docs.forEach(doc => {
                const straordinario = doc.data() as { date: Timestamp };
                allBookedDays.add(startOfDay(straordinario.date.toDate()).toISOString());
            });
            setBookedDays(Array.from(allBookedDays).map(d => new Date(d)));
        });
        unsubs.push(unsubStraordinari);
        
        const allRequestsQuery = query(
            collection(firestore, `app-users/${userId}/requests`),
            where('status', 'in', ['in_attesa', 'approvato'])
        );
         const unsubAllRequests = onSnapshot(allRequestsQuery, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExistingRequest));
            setExistingRequests(requests);
        });
        unsubs.push(unsubAllRequests);

        return () => unsubs.forEach(unsub => unsub());
    }, [firestore, userId]);
    
    const refinedRequestSchema = requestSchema.refine(data => {
        if (data.startDate && data.endDate) return data.endDate >= data.startDate;
        return true;
    }, {
        message: "La data di fine non può essere precedente a quella di inizio.",
        path: ['endDate'],
    }).refine(data => {
        if ((data.requestType === 'permesso' || data.requestType === 'straordinario')) {
            const hours = data.hours ? parseFloat(data.hours) : 0;
            return hours > 0;
        }
        return true;
    }, {
        message: "Il numero di ore è obbligatorio e deve essere maggiore di 0.",
        path: ['hours'],
    }).superRefine((data, ctx) => {
         if ((data.requestType === 'ferie' || data.requestType === 'malattia') && data.startDate) {
            const selectedInterval = {
                start: data.startDate,
                end: data.endDate || data.startDate
            };

            const isOverlapping = existingRequests.some(existing => {
                 const existingInterval = {
                    start: existing.startDate.toDate(),
                    end: existing.endDate.toDate()
                };
                
                const dayRange = eachDayOfInterval(selectedInterval);

                return dayRange.some(day => 
                    (isSameDay(day, existingInterval.start) || isSameDay(day, existingInterval.end) || (day > existingInterval.start && day < existingInterval.end))
                );
            });

            if (isOverlapping) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Uno o più giorni selezionati sono già occupati da un'altra richiesta.",
                    path: ['startDate'], 
                });
                 ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Uno o più giorni selezionati sono già occupati da un'altra richiesta.",
                    path: ['endDate'], 
                });
            }
        }
    });

    const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RequestFormValues>({
        resolver: zodResolver(refinedRequestSchema),
        defaultValues: {
            requestType: undefined,
            startDate: undefined,
            endDate: undefined,
            hours: '',
            reason: '',
        }
    });

    const selectedType = watch('requestType');
    const startDateValue = watch('startDate');
    
    const isDayDisabled = (day: Date): boolean => {
        if (role === 'operator' && day < startOfDay(new Date())) return true;
        if (bookedDays.some(bookedDay => isSameDay(day, bookedDay))) return true;

        if (operator?.workSchedule) {
            const dayName = dayIndexToName[getDay(day)];
            const isContractualDay = (operator.workSchedule[dayName]?.totalHours || 0) > 0;
            if (!isContractualDay) return true;
        }
        
        return false;
    };
    
    const onSubmit = async (data: RequestFormValues) => {
        if (!firestore) return;

        const finalEndDate = data.endDate || data.startDate;

        const newRequestData: any = {
            userId: userId,
            type: data.requestType,
            status: 'in_attesa' as const,
            startDate: Timestamp.fromDate(data.startDate),
            endDate: Timestamp.fromDate(finalEndDate),
            reason: data.reason || "",
            createdAt: serverTimestamp(),
            viewedByOperator: role === 'admin' ? false : true,
        };

        if (data.requestType === 'permesso' || data.requestType === 'straordinario') {
            newRequestData.hours = Number(data.hours);
        }
        
        const requestCollectionRef = collection(firestore, `app-users/${userId}/requests`);

        addDoc(requestCollectionRef, newRequestData).then(() => {
            toast({ title: "Successo", description: "La tua richiesta è stata inviata." });
            onFinished();
        }).catch((error: any) => {
            console.error("Error creating request:", error);
            if (error.code === 'permission-denied' && firestore) {
                const contextualError = new FirestorePermissionError({
                    operation: 'create',
                    path: requestCollectionRef.path,
                    requestResourceData: newRequestData
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile inviare la richiesta. Riprova.", variant: "destructive" });
            }
        });
    };
    
    return (
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">

            {/* Request Type */}
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="type" className={cn("text-right", errors.requestType && 'text-destructive')}>Tipo</Label>
                <Controller
                    control={control}
                    name="requestType"
                    render={({ field }) => (
                        <div className='col-span-3 flex flex-col'>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger id="type">
                                    <SelectValue placeholder="Seleziona un tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ferie">Ferie</SelectItem>
                                    <SelectItem value="permesso">Permesso</SelectItem>
                                    {role === 'admin' && <SelectItem value="malattia">Malattia</SelectItem>}
                                    {/* Straordinario is now handled via shift approval */}
                                </SelectContent>
                            </Select>
                            {errors.requestType && <p className="text-xs text-destructive mt-1">{errors.requestType.message}</p>}
                        </div>
                    )}
                />
            </div>
            
            {/* Start Date */}
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="startDate" className={cn("text-right", errors.startDate && 'text-destructive')}>Data Inizio</Label>
                <Controller
                    name="startDate"
                    control={control}
                    render={({ field }) => (
                        <div className='col-span-3 flex flex-col'>
                             <Dialog open={isStartPickerOpen} onOpenChange={setIsStartPickerOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        id="startDate"
                                        variant={"outline"}
                                        className={cn("justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value ? format(field.value, "PPP", { locale: it }) : <span>Scegli una data</span>}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-auto p-0">
                                    <DialogHeader className='p-4 pb-0'>
                                       <DialogTitle>Seleziona data di inizio</DialogTitle>
                                    </DialogHeader>
                                    <Calendar 
                                      mode="single" 
                                      selected={field.value} 
                                      onSelect={(date) => {
                                        field.onChange(date);
                                        setIsStartPickerOpen(false);
                                      }}
                                      initialFocus
                                      locale={it}
                                      disabled={isDayDisabled}
                                    />
                                </DialogContent>
                            </Dialog>
                             {errors.startDate && <p className="text-xs text-destructive mt-1">{errors.startDate.message}</p>}
                        </div>
                    )}
                />
            </div>
            
            {/* End Date */}
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="endDate" className={cn("text-right", errors.endDate && 'text-destructive')}>Data Fine</Label>
                 <Controller
                    name="endDate"
                    control={control}
                    render={({ field }) => (
                        <div className='col-span-3 flex flex-col'>
                            <Dialog open={isEndPickerOpen} onOpenChange={setIsEndPickerOpen}>
                                <DialogTrigger asChild>
                                     <Button
                                        id="endDate"
                                        variant={"outline"}
                                        className={cn("justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                        disabled={!startDateValue || (selectedType !== 'ferie' && selectedType !== 'malattia')}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value ? format(field.value, "PPP", { locale: it }) : <span>Scegli una data (opzionale)</span>}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-auto p-0">
                                    <DialogHeader className='p-4 pb-0'>
                                       <DialogTitle>Seleziona data di fine</DialogTitle>
                                    </DialogHeader>
                                    <Calendar 
                                        mode="single" 
                                        selected={field.value} 
                                        onSelect={(date) => {
                                          field.onChange(date);
                                          setIsEndPickerOpen(false);
                                        }}
                                        disabled={day => {
                                            if (startDateValue && day < startDateValue) return true;
                                            return isDayDisabled(day);
                                        }}
                                        initialFocus 
                                        locale={it}
                                    />
                                </DialogContent>
                            </Dialog>
                            {errors.endDate && <p className="text-xs text-destructive mt-1">{errors.endDate.message}</p>}
                        </div>
                    )}
                />
            </div>

            {/* Hours */}
            {(selectedType === 'permesso' || selectedType === 'straordinario') && (
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="hours" className={cn("text-right", errors.hours && 'text-destructive')}>Ore</Label>
                     <Controller
                        name="hours"
                        control={control}
                        render={({ field }) => (
                            <div className='col-span-3 flex flex-col'>
                                <Input id="hours" type="number" {...field} value={field.value || ''} placeholder='Es: 2.5' min="0.5" step="0.5" />
                                {errors.hours && <p className="text-xs text-destructive mt-1">{errors.hours.message}</p>}
                            </div>
                        )}
                    />
                </div>
            )}

            {/* Reason */}
            <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="reason" className="text-right mt-2">Motivazione</Label>
                 <Controller
                    name="reason"
                    control={control}
                    render={({ field }) => (
                        <Textarea id="reason" {...field} value={field.value || ''} className="col-span-3" placeholder="Aggiungi una nota (opzionale)" />
                    )}
                />
            </div>
            
            {/* Footer */}
            <div className="flex justify-end gap-2 pt-4">
                 <Button type="button" variant="ghost" onClick={onFinished}>Annulla</Button>
                 <Button type="submit" disabled={isSubmitting}>
                     {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                     Invia Richiesta
                 </Button>
            </div>
        </form>
    );
}

    