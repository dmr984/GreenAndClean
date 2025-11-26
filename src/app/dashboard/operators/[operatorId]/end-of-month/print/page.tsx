'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Printer, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import Image from 'next/image';
import { Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';

// Define types locally for this page
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

type WorkSchedule = { [key in DayOfWeek]?: number };
type Operator = { id: string; username: string; workSchedule: WorkSchedule };
type Timbratura = { type: string, timestamp: number };
type Shift = { workedMinutes: number, contractualHours: number, ordinaryHours: number, overtimeHours: number, permissionHours: number, events: Timbratura[] };
type DailyDetail = { date: string, status: string, shift: Shift | null };
type MonthlySummary = { workedDays: number, ordinaryHours: number, overtimeHours: number, ferieDays: number, permessoHours: number, malattiaDays: number };

const formatMinutes = (minutes: number) => {
    if (isNaN(minutes) || minutes < 0) return '00:00';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const PrintableSummary = React.forwardRef<HTMLDivElement, { operator: Operator, currentMonth: Date, monthlySummary: MonthlySummary, dailyDetails: DailyDetail[] }>(({ operator, currentMonth, monthlySummary, dailyDetails }, ref) => (
     <div ref={ref} className="bg-white text-black p-4 printable-summary" style={{ width: '210mm', minHeight: '297mm', margin: 'auto' }}>
        <header className="flex justify-between items-center border-b pb-2 mb-2">
             <Image src="https://i.postimg.cc/d3QKx62Q/IMG-20251006-WA0024.jpg" alt="Serveco Logo" width={80} height={80} crossOrigin="anonymous" />
             <div className="text-right">
                 <h1 className="text-2xl font-bold">{operator.username}</h1>
                 <p className="text-lg capitalize text-gray-600">{format(currentMonth, 'MMMM yyyy', { locale: it })}</p>
             </div>
        </header>

        <section className="grid grid-cols-3 gap-2 mb-4">
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Giorni Lavorati</div>
                <div className="text-xl font-bold">{monthlySummary.workedDays}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Ore Ordinarie</div>
                <div className="text-xl font-bold">{monthlySummary.ordinaryHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Ore Straordinarie</div>
                <div className="text-xl font-bold">{monthlySummary.overtimeHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Ferie (giorni)</div>
                <div className="text-xl font-bold">{monthlySummary.ferieDays}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Permessi (ore)</div>
                <div className="text-xl font-bold">{monthlySummary.permessoHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Malattia (giorni)</div>
                <div className="text-xl font-bold">{monthlySummary.malattiaDays}</div>
            </div>
        </section>

        <section>
            <h3 className="text-xl font-bold mb-2 border-b pb-1">Dettaglio Giornaliero</h3>
            <div className="flex flex-col gap-0">
                {dailyDetails.filter(d => d.status !== 'riposo').map(detail => (
                    <div key={detail.date} className="border-b py-1 day-entry" style={{ padding: '2px 0', display: 'flex', flexDirection: 'column', borderBottom: '1px solid #e5e7eb' }}>
                        <div className="flex items-center gap-4">
                            <span className="font-bold text-sm capitalize w-48">{format(new Date(detail.date), 'eeee dd/MM/yyyy', { locale: it })}</span>
                             <div className="text-sm text-gray-700 flex items-center">
                                {detail.status === 'lavorato' && detail.shift && (
                                    <span className="whitespace-nowrap">
                                        Entrata: {detail.shift.events.find(e => e.type === 'entrata') ? format(new Date(detail.shift.events.find(e => e.type === 'entrata')!.timestamp), 'HH:mm') : '--:--'} | Uscita: {detail.shift.events.find(e => e.type === 'uscita') ? format(new Date(detail.shift.events.find(e => e.type === 'uscita')!.timestamp), 'HH:mm') : '--:--'}
                                    </span>
                                )}
                                 {detail.status === 'ferie' && <span className="text-green-600 font-medium">Giorno di ferie</span>}
                                 {detail.status === 'malattia' && <span className="text-red-600 font-medium">Giorno di malattia</span>}
                                 {detail.status === 'mancata_timbratura' && <span className="text-yellow-600 font-medium">Nessuna timbratura registrata</span>}
                             </div>
                        </div>
                        {detail.status === 'lavorato' && detail.shift && (
                             <div className="pl-52 text-xs text-gray-500">
                                <span>Previste: {detail.shift.contractualHours}h</span> | 
                                <span>Lavorate: {formatMinutes(detail.shift.workedMinutes)}</span> | 
                                <span>Ordinarie: {detail.shift.ordinaryHours}h</span> | 
                                <span>Straordinario: {detail.shift.overtimeHours}h</span> | 
                                <span>Permesso: {detail.shift.permissionHours}h</span>
                             </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    </div>
));
PrintableSummary.displayName = 'PrintableSummary';


export default function PrintPage() {
    const { toast } = useToast();
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const savedData = localStorage.getItem('printData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            // Re-hydrate dates
            parsedData.currentMonth = new Date(parsedData.currentMonth);
            parsedData.dailyDetails.forEach((d: any) => {
                d.date = new Date(d.date);
                if (d.shift) {
                    d.shift.events.forEach((e: any) => e.timestamp = new Timestamp(e.timestamp / 1000, 0).toDate());
                }
            });
            setData(parsedData);
        }
        setIsLoading(false);
    }, []);

    const handlePrint = () => {
        window.print();
    };

    const handleShare = async () => {
        if (!printRef.current) return;
        
        try {
            const canvas = await html2canvas(printRef.current, { useCORS: true, scale: 2 });
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    toast({ title: "Errore", description: "Impossibile creare l'immagine per la condivisione.", variant: "destructive" });
                    return;
                }
                const file = new File([blob], 'Riepilogo.png', { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: `Riepilogo Mensile - ${data.operator.username}`,
                    });
                } else {
                    toast({ title: "Condivisione non supportata", description: "Il tuo browser non supporta la condivisione di file.", variant: "destructive"});
                }
            }, 'image/png');
        } catch(e) {
            console.error(e);
            toast({ title: "Errore durante la condivisione", description: "Si è verificato un problema tecnico.", variant: "destructive"});
        }
    };


    if (isLoading) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    }

    if (!data) {
        return <div className="flex h-screen items-center justify-center">Nessun dato da stampare. Torna indietro e riprova.</div>;
    }

    return (
        <div className="bg-gray-100">
            <div className="print-controls sticky top-0 bg-background/80 backdrop-blur-sm z-10 p-2 flex justify-center gap-2 border-b">
                 <style>{`
                    @media print {
                        .print-controls { display: none; }
                        body { background-color: #fff; }
                    }
                `}</style>
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" /> Stampa
                </Button>
                 <Button variant="outline" onClick={handleShare}>
                    <Share2 className="mr-2 h-4 w-4" /> Condividi
                </Button>
            </div>
            <PrintableSummary
                ref={printRef}
                operator={data.operator}
                currentMonth={data.currentMonth}
                monthlySummary={data.monthlySummary}
                dailyDetails={data.dailyDetails}
            />
        </div>
    );
}
