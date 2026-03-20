'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Loader2, Calendar as CalendarIcon, Printer, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, endOfWeek, it } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
};

export default function WeeklyReportPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [operators, setOperators] = useState<Operator[]>([]);
    const [selectedOperatorIds, setSelectedOperatorIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ops = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Operator));
            ops.sort((a,b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
            setOperators(ops);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [firestore]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedOperatorIds(new Set(operators.map(op => op.id)));
        } else {
            setSelectedOperatorIds(new Set());
        }
    };

    const handleSelectOperator = (operatorId: string, checked: boolean) => {
        setSelectedOperatorIds(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(operatorId);
            else newSet.delete(operatorId);
            return newSet;
        });
    };

    const handleOpenPrintPreview = () => {
        if (!selectedDate) return;
        if (selectedOperatorIds.size === 0) {
            toast({ title: 'Nessun operatore', description: 'Seleziona almeno un operatore.', variant: 'destructive' });
            return;
        }
        
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const dateString = format(weekStart, 'yyyy-MM-dd');
        const opIds = Array.from(selectedOperatorIds).join(',');
        
        window.open(`/dashboard/weekly-report/print?startDate=${dateString}&operators=${opIds}`, '_blank');
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
                    <div>
                        <CardTitle className="text-2xl">Report Settimanale</CardTitle>
                        <CardDescription>Genera un report presenze per un'intera settimana per gli operatori selezionati.</CardDescription>
                    </div>
                    <Button onClick={handleOpenPrintPreview} disabled={isLoading || selectedOperatorIds.size === 0}>
                        <Printer className="mr-2 h-4 w-4" /> Crea Report
                    </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="space-y-2">
                            <Label>Scegli la Settimana</Label>
                            <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {selectedDate ? (
                                            `Settimana del ${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "dd MMM")} al ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "dd MMM yyyy")}`
                                        ) : <span>Seleziona un giorno</span>}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-auto p-0">
                                    <DialogHeader className="p-4 pb-0">
                                        <DialogTitle>Scegli una settimana</DialogTitle>
                                        <DialogDescription>Clicca su un giorno per selezionare l'intera settimana corrispondente.</DialogDescription>
                                    </DialogHeader>
                                    <Calendar
                                        mode="single"
                                        selected={selectedDate}
                                        onSelect={(d) => { setSelectedDate(d); setIsCalendarOpen(false); }}
                                        initialFocus
                                        locale={itLocale}
                                    />
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                        <div className="flex items-center space-x-2 bg-muted/20 p-2 rounded-md">
                            <Checkbox 
                                id="select-all" 
                                checked={selectedOperatorIds.size === operators.length && operators.length > 0}
                                onCheckedChange={handleSelectAll}
                            />
                            <Label htmlFor="select-all" className="font-bold cursor-pointer">Seleziona Tutti gli Operatori ({operators.length})</Label>
                        </div>

                        {isLoading ? (
                            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {operators.map(op => (
                                    <div key={op.id} className="flex items-center space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                                        <Checkbox 
                                            id={`op-${op.id}`}
                                            checked={selectedOperatorIds.has(op.id)}
                                            onCheckedChange={(checked) => handleSelectOperator(op.id, !!checked)}
                                        />
                                        <Label htmlFor={`op-${op.id}`} className="cursor-pointer flex-1">
                                            <p className="font-semibold">{op.firstName} {op.lastName}</p>
                                            <p className="text-xs text-muted-foreground">Codice: {op.username}</p>
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}