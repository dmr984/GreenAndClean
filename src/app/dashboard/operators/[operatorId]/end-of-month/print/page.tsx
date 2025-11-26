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
     <div ref={ref} className="bg-white text-black p-8 printable-summary" style={{ width: '210mm', minHeight: '297mm', margin: 'auto' }}>
        <header className="flex justify-between items-center border-b-2 border-gray-300 pb-4 mb-4">
             <Image src="https://i.postimg.cc/d3QKx62Q/IMG-20251006-WA0024.jpg" alt="Serveco Logo" width={100} height={100} crossOrigin="anonymous" />
             <div className="text-right">
                 <h1 className="text-3xl font-bold">{operator.username}</h1>
                 <p className="text-xl capitalize text-gray-600">{format(currentMonth, 'MMMM yyyy', { locale: it })}</p>
             </div>
        </header>

        <section className="grid grid-cols-3 gap-4 mb-6 text-center">
            <div className="border rounded-lg p-3">
                <div className="text-sm text-gray-600">Giorni Lavorati</div>
                <div className="text-2xl font-bold">{monthlySummary.workedDays}</div>
            </div>
            <div className="border rounded-lg p-3">
                <div className="text-sm text-gray-600">Ore Ordinarie</div>
                <div className="text-2xl font-bold">{monthlySummary.ordinaryHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-3">
                <div className="text-sm text-gray-600">Ore Straordinarie</div>
                <div className="text-2xl font-bold">{monthlySummary.overtimeHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-3">
                <div className="text-sm text-gray-600">Ferie (giorni)</div>
                <div className="text-2xl font-bold">{monthlySummary.ferieDays}</div>
            </div>
            <div className="border rounded-lg p-3">
                <div className="text-sm text-gray-600">Permessi (ore)</div>
                <div className="text-2xl font-bold">{monthlySummary.permessoHours.toLocaleString('it-IT')}</div>
            </div>
            <div className="border rounded-lg p-3">
                <div className="text-sm text-gray-600">Malattia (giorni)</div>
                <div className="text-2xl font-bold">{monthlySummary.malattiaDays}</div>
            </div>
        </section>

        <section>
            <h3 className="text-xl font-bold mb-2 border-b pb-1">Dettaglio Giornaliero</h3>
            <div className="text-xs">
                {dailyDetails.filter(d => d.status !== 'riposo').map(detail => (
                    <div key={detail.date} className="border-b py-2 flex items-center">
                        <div className="w-1/3 font-bold capitalize">{format(new Date(detail.date), 'eeee dd/MM/yyyy', { locale: it })}</div>
                        <div className="w-2/3">
                            {detail.status === 'lavorato' && detail.shift ? (
                                <div>
                                    <div className="font-semibold">
                                        Entrata: {detail.shift.events.find(e => e.type === 'entrata') ? format(new Date(detail.shift.events.find(e => e.type === 'entrata')!.timestamp), 'HH:mm') : '--:--'} | Uscita: {detail.shift.events.find(e => e.type === 'uscita') ? format(new Date(detail.shift.events.find(e => e.type === 'uscita')!.timestamp), 'HH:mm') : '--:--'}
                                    </div>
                                    <div className="text-gray-600 text-[10px]">
                                        <span>Prev: {detail.shift.contractualHours}h</span> | 
                                        <span> Lav: {formatMinutes(detail.shift.workedMinutes)}</span> | 
                                        <span> Ord: {detail.shift.ordinaryHours}h</span> | 
                                        <span> Straord: {detail.shift.overtimeHours}h</span> | 
                                        <span> Perm: {detail.shift.permissionHours}h</span>
                                    </div>
                                </div>
                            ) : detail.status === 'ferie' ? (
                                <span className="text-green-600 font-medium">Giorno di ferie</span>
                            ) : detail.status === 'malattia' ? (
                                <span className="text-red-600 font-medium">Giorno di malattia</span>
                            ) : detail.status === 'mancata_timbratura' ? (
                                <span className="text-yellow-600 font-medium">Nessuna timbratura registrata</span>
                            ) : null}
                        </div>
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
    const [isProcessing, setIsProcessing] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const savedData = localStorage.getItem('printData');
        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData);
                // Re-hydrate dates
                parsedData.currentMonth = new Date(parsedData.currentMonth);
                parsedData.dailyDetails.forEach((d: any) => {
                    d.date = new Date(d.date);
                    if (d.shift) {
                        // The timestamp is already a number from JSON
                        d.shift.events.forEach((e: any) => e.timestamp = e.timestamp);
                    }
                });
                setData(parsedData);
            } catch (error) {
                console.error("Failed to parse print data:", error);
                toast({ title: "Errore", description: "Dati di stampa non validi.", variant: "destructive" });
            }
        }
        setIsLoading(false);
    }, [toast]);

    const handlePrint = () => {
        window.print();
    };

    const handleShare = async () => {
        if (!printRef.current) return;
        setIsProcessing(true);
        
        try {
            // Add a small delay to ensure images are loaded
            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await html2canvas(printRef.current, { 
                useCORS: true, 
                scale: 2,
                logging: true,
                allowTaint: true,
             });

             canvas.toBlob(async (blob) => {
                if (!blob) {
                    toast({ title: "Errore", description: "Impossibile creare l'immagine per la condivisione.", variant: "destructive" });
                    setIsProcessing(false);
                    return;
                }

                const file = new File([blob], 'Riepilogo.png', { type: 'image/png' });
                
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: `Riepilogo Mensile - ${data.operator.username}`,
                        });
                    } catch (error) {
                        // This catch block handles the case where the user cancels the share dialog
                        console.log("Share action was cancelled or failed", error);
                    }
                } else {
                     // Fallback for desktop browsers: open image in a new tab
                     const imageUrl = URL.createObjectURL(blob);
                     window.open(imageUrl, '_blank');
                }
                 setIsProcessing(false);
            }, 'image/png');

        } catch(e) {
            console.error(e);
            toast({ title: "Errore durante la condivisione", description: "Si è verificato un problema tecnico.", variant: "destructive"});
            setIsProcessing(false);
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
                        @page {
                           margin: 0;
                        }
                    }
                `}</style>
                <Button onClick={handlePrint} disabled={isProcessing}>
                    <Printer className="mr-2 h-4 w-4" /> Stampa
                </Button>
                 <Button variant="outline" onClick={handleShare} disabled={isProcessing}>
                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Share2 className="mr-2 h-4 w-4" />}
                     Condividi
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
