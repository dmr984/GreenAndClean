'use client';
import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

// 1. Define Zod schema
const requestSchema = z.object({
  requestType: z.enum(['ferie', 'permesso', 'malattia', 'straordinario'], { required_error: 'Devi selezionare un tipo.' }),
  startDate: z.date({ required_error: 'La data di inizio è obbligatoria.' }),
  endDate: z.date().optional(),
  hours: z.string().optional(),
  reason: z.string().optional(),
}).refine(data => {
    // End date must be after start date if it exists
    if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
    }
    return true;
}, {
    message: "La data di fine non può essere precedente a quella di inizio.",
    path: ['endDate'],
}).refine(data => {
    // Hours are required for 'permesso' or 'straordinario'
    if ((data.requestType === 'permesso' || data.requestType === 'straordinario')) {
        const hours = data.hours ? parseFloat(data.hours) : 0;
        return hours > 0;
    }
    return true;
}, {
    message: "Il numero di ore è obbligatorio e deve essere maggiore di 0.",
    path: ['hours'],
});


type RequestFormValues = z.infer<typeof requestSchema>;

interface RequestFormProps {
    userId: string;
    onFinished: () => void;
}

export function RequestForm({ userId, onFinished }: RequestFormProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isStartPickerOpen, setIsStartPickerOpen] = useState(false);
    const [isEndPickerOpen, setIsEndPickerOpen] = useState(false);
    
    const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RequestFormValues>({
        resolver: zodResolver(requestSchema),
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

    const onSubmit = async (data: RequestFormValues) => {
        if (!firestore) return;

        // Use end date if provided, otherwise default to start date
        const finalEndDate = data.endDate || data.startDate;

        const newRequestData: any = {
            userId: userId,
            type: data.requestType,
            status: 'in_attesa' as const,
            startDate: Timestamp.fromDate(data.startDate),
            endDate: Timestamp.fromDate(finalEndDate),
            reason: data.reason || "",
            createdAt: serverTimestamp(),
        };

        if (data.requestType === 'permesso' || data.requestType === 'straordinario') {
            newRequestData.hours = Number(data.hours);
        }
        
        const requestCollectionRef = collection(firestore, `app-users/${userId}/requests`);

        addDoc(requestCollectionRef, newRequestData).then(() => {
            toast({ title: "Successo", description: "La tua richiesta è stata inviata." });
            onFinished(); // Close the dialog
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
                                    <SelectItem value="malattia">Malattia</SelectItem>
                                    <SelectItem value="straordinario">Straordinario</SelectItem>
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
                            <Popover open={isStartPickerOpen} onOpenChange={setIsStartPickerOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="startDate"
                                        variant={"outline"}
                                        className={cn("justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value ? format(field.value, "PPP", { locale: it }) : <span>Scegli una data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar 
                                      mode="single" 
                                      selected={field.value} 
                                      onSelect={(date) => {
                                        field.onChange(date);
                                        setIsStartPickerOpen(false);
                                      }} 
                                      initialFocus 
                                    />
                                </PopoverContent>
                            </Popover>
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
                            <Popover open={isEndPickerOpen} onOpenChange={setIsEndPickerOpen}>
                                <PopoverTrigger asChild>
                                     <Button
                                        id="endDate"
                                        variant={"outline"}
                                        className={cn("justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                        disabled={!startDateValue}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value ? format(field.value, "PPP", { locale: it }) : <span>Scegli una data (opzionale)</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar 
                                        mode="single" 
                                        selected={field.value} 
                                        onSelect={(date) => {
                                          field.onChange(date);
                                          setIsEndPickerOpen(false);
                                        }}
                                        disabled={{ before: startDateValue! }} 
                                        initialFocus 
                                    />
                                </PopoverContent>
                            </Popover>
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
