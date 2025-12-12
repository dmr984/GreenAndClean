'use client';
import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, onSnapshot, doc, getDoc, writeBatch } from 'firebase/firestore';
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
import { Badge } from '@/components/ui/badge';

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
  requestType: z.enum(['ferie', 'permesso', 'malattia'], { required_error: 'Devi selezionare un tipo.' }),
  selectedDates: z.array(z.date()).nonempty({ message: 'Devi selezionare almeno un giorno.' }),
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
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
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
            where('status', 'in', ['approvato', 'in_attesa'])
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

        return () => unsubs.forEach(unsub => unsub());
    }, [firestore, userId]);
    
    const refinedRequestSchema = requestSchema.refine(data => {
        if (data.requestType === 'permesso') {
            const hours = data.hours ? parseFloat(data.hours) : 0;
            return hours > 0;
        }
        return true;
    }, {
        message: "Il numero di ore è obbligatorio e deve essere maggiore di 0.",
        path: ['hours'],
    });

    const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RequestFormValues>({
        resolver: zodResolver(refinedRequestSchema),
        defaultValues: {
            requestType: undefined,
            selectedDates: [],
            hours: '',
            reason: '',
        }
    });

    const selectedType = watch('requestType');
    const selectedDatesValue = watch('selectedDates');
    
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

        const batch = writeBatch(firestore);
        const requestCollectionRef = collection(firestore, `app-users/${userId}/requests`);

        data.selectedDates.forEach(date => {
            const newDocRef = doc(requestCollectionRef);
            const newRequestData: any = {
                userId: userId,
                type: data.requestType,
                status: 'in_attesa' as const,
                startDate: Timestamp.fromDate(startOfDay(date)),
                endDate: Timestamp.fromDate(startOfDay(date)),
                reason: data.reason || "",
                createdAt: serverTimestamp(),
                viewedByOperator: role === 'admin' ? false : true,
            };

            if (data.requestType === 'permesso') {
                newRequestData.hours = Number(data.hours);
            }
            batch.set(newDocRef, newRequestData);
        });


        try {
            await batch.commit();
            toast({ title: "Successo", description: "Le tue richieste sono state inviate." });
            onFinished();
        } catch (error: any) {
            console.error("Error creating requests:", error);
            if (error.code === 'permission-denied') {
                // We can't know which exact doc failed, so we emit a generic error
                const contextualError = new FirestorePermissionError({
                    operation: 'create',
                    path: requestCollectionRef.path,
                    requestResourceData: { note: 'Batch write failed' }
                });
                errorEmitter.emit('permission-error', contextualError);
            } else {
                toast({ title: "Errore", description: "Impossibile inviare le richieste. Riprova.", variant: "destructive" });
            }
        }
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
                                </SelectContent>
                            </Select>
                            {errors.requestType && <p className="text-xs text-destructive mt-1">{errors.requestType.message}</p>}
                        </div>
                    )}
                />
            </div>
            
             {/* Dates Selection */}
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="dates" className={cn("text-right", errors.selectedDates && 'text-destructive')}>Giorni</Label>
                 <Controller
                    name="selectedDates"
                    control={control}
                    render={({ field }) => (
                         <div className='col-span-3 flex flex-col'>
                             <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        id="dates"
                                        variant={"outline"}
                                        className={cn("justify-start text-left font-normal h-auto", !field.value?.length && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value?.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {field.value.length > 3 ? (
                                                    <span>{`${field.value.length} giorni selezionati`}</span>
                                                ) : (
                                                    field.value.map(date => (
                                                        <Badge key={date.toISOString()} variant="secondary" className="font-normal">
                                                            {format(date, "d MMM", { locale: it })}
                                                        </Badge>
                                                    ))
                                                )}
                                            </div>
                                        ) : (
                                            <span>Seleziona i giorni</span>
                                        )}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-auto p-0">
                                     <DialogHeader className='p-4 pb-0'>
                                       <DialogTitle>Seleziona uno o più giorni</DialogTitle>
                                     </DialogHeader>
                                     <Calendar 
                                        mode="multiple"
                                        min={1}
                                        selected={field.value} 
                                        onSelect={field.onChange}
                                        initialFocus
                                        locale={it}
                                        disabled={isDayDisabled}
                                     />
                                      <div className="p-4 pt-0">
                                        <Button className="w-full" onClick={() => setIsCalendarOpen(false)}>Conferma</Button>
                                     </div>
                                </DialogContent>
                            </Dialog>
                             {errors.selectedDates && <p className="text-xs text-destructive mt-1">{errors.selectedDates.message}</p>}
                        </div>
                    )}
                />
            </div>
            
            {/* Hours */}
            {(selectedType === 'permesso') && (
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="hours" className={cn("text-right", errors.hours && 'text-destructive')}>Ore (per giorno)</Label>
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

    