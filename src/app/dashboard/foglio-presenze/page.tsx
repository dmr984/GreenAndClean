'use client';
import React, { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSaturday, isSunday } from 'date-fns';
import { it } from 'date-fns/locale';
import { Loader2, Printer, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { processMonthlyData, DailyDetail } from '@/lib/calculations';
import { Checkbox } from '@/components/ui/checkbox';

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    salaryType?: 'hourly' | 'fixed';
    scheduleType?: 'daily' | 'monthly';
    workSchedule: any;
};

export default function FoglioPresenzePage() {
    const firestore = useFirestore();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [operators, setOperators] = useState<Operator[]>([]);
    const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
    const [attendanceData, setAttendanceData] = useState<Record<string, { dailyDetails: DailyDetail[] }>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [overrides, setOverrides] = useState<Record<string, string>>({});

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const daysOfMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator));
            ops.sort((a, b) => a.lastName.localeCompare(b.lastName));
            setOperators(ops);
            setSelectedOperatorIds(ops.map(o => o.id));
        });
        return () => unsubscribe();
    }, [firestore]);

    useEffect(() => {
        const fetchAllData = async () => {
            if (!firestore || operators.length === 0) return;
            setIsLoading(true);
            const start = Timestamp.fromDate(monthStart);
            const end = Timestamp.fromDate(monthEnd);
            const data: Record<string, { dailyDetails: DailyDetail[] }> = {};
            for (const op of operators) {
                if (!selectedOperatorIds.includes(op.id)) continue;
                const tQuery = query(collection(firestore, `app-users/${op.id}/timbrature`), where('timestamp', '>=', start), where('timestamp', '<=', end));
                const tSnap = await getDocs(tQuery);
                data[op.id] = processMonthlyData(currentMonth, op as any, { 
                    timbrature: tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)), 
                    requests: [] 
                });
            }
            setAttendanceData(data);
            setIsLoading(false);
        };
        fetchAllData();
    }, [firestore, operators, currentMonth, selectedOperatorIds]);

    const handleOverride = (key: string, value: string) => {
        setOverrides(prev => ({ ...prev, [key]: value }));
    };

    const visibleOperators = operators.filter(op => selectedOperatorIds.includes(op.id));

    return (
        <div className="flex flex-col gap-4">
            <Card className="no-print">
                <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-1">
                    <CardTitle className="text-xl font-bold uppercase tracking-tight">Gestione Foglio Presenze</CardTitle>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="font-bold w-36 text-center capitalize text-lg">{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
                        <Button variant="outline" onClick={() => setOverrides({})} className="ml-2 text-destructive border-destructive hover:bg-destructive/10"><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
                        <Button variant="default" onClick={() => window.print()} className="ml-2 bg-[#4a6da7] hover:bg-[#3a5d97]"><Printer className="mr-2 h-4 w-4" /> Stampa</Button>
                    </div>
                </CardHeader>
                <CardContent className="pb-3">
                    <div className="flex flex-wrap gap-2">
                        {operators.map(op => (
                            <div key={op.id} className={`flex items-center space-x-2 border rounded-full px-3 py-1 cursor-pointer transition-colors ${selectedOperatorIds.includes(op.id) ? 'bg-[#4a6da7]/10 border-[#4a6da7]' : 'bg-transparent border-muted-foreground/30'}`} onClick={() => setSelectedOperatorIds(prev => prev.includes(op.id) ? prev.filter(id => id !== op.id) : [...prev, op.id])}>
                                <Checkbox checked={selectedOperatorIds.includes(op.id)} className="rounded-full" />
                                <span className="text-xs font-semibold whitespace-nowrap">{op.lastName} {op.firstName}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="attendance-sheet-container bg-white p-0 overflow-hidden">
                <div className="attendance-sheet relative p-1 pb-16" style={{ width: '1180px', margin: '0 auto' }}>
                    <table className="w-full border-collapse border-[2.5px] border-black text-black leading-tight">
                        <thead>
                            <tr className="bg-[#4a6da7] text-white text-[9px] h-8">
                                <th rowSpan={2} className="border border-black w-[50px] p-0 font-bold leading-none align-top bg-[#4a6da7]">
                                    <div className="h-[28px] border-b border-black flex items-center justify-center">N. d'ord.</div>
                                    <div className="h-[24px] flex items-center justify-center bg-[#4a6da7]">Matr.</div>
                                </th>
                                <th rowSpan={2} className="border-r-[2px] border-black w-[170px] p-0 px-2 text-center font-bold uppercase text-[10px] align-middle bg-[#4a6da7]">Cognome e Nome Qualifica</th>
                                <th rowSpan={2} className="border-r-[2px] border-black w-[25px] p-0 bg-[#4a6da7]"></th>
                                <th colSpan={31} className="border-r-[2px] border-black p-0 font-bold uppercase tracking-wider text-[11px] align-middle bg-[#4a6da7] h-4">Prestazioni per ciascuna giornata</th>
                                <th colSpan={3} className="border-r-[2px] border-black w-[115px] p-0 font-bold uppercase text-[8px] bg-[#4a6da7] h-4">Ore Ordinarie</th>
                                <th colSpan={2} className="border-r-[2px] border-black w-[90px] p-0 font-bold uppercase text-[8px] bg-[#4a6da7] h-4">Ore Str.</th>
                                <th colSpan={3} className="border-r-[2px] border-black w-[110px] p-0 font-bold uppercase text-[8px] bg-[#4a6da7] h-4">Malatt.Infort.</th>
                                <th colSpan={2} className="border-r-[2px] border-black w-[90px] p-0 font-bold uppercase text-[8px] bg-[#4a6da7] h-4">Giorni</th>
                                <th rowSpan={2} className="border border-black w-[65px] p-0 font-bold uppercase text-[7px] leading-tight bg-[#4a6da7]">Retribuzione oraria €</th>
                            </tr>
                            <tr className="bg-[#4a6da7] text-white text-[8px] h-6">
                                {[...Array(31)].map((_, i) => <th key={i} className={`border border-black w-[22px] p-0 font-bold ${i === 30 ? 'border-r-[2px]' : ''}`}>{i + 1}</th>)}
                                <th className="border-0 border-black w-[38px] p-0 bg-[#4a6da7] text-white font-bold h-full">
                                    <input type="text" value={overrides['h-ord-lav'] || 'Lavorate'} onChange={e => handleOverride('h-ord-lav', e.target.value)} className="w-full h-full border-none outline-none text-center bg-transparent no-print text-[7px]" />
                                    <span className="only-print text-[7px]">Lavorate</span>
                                </th>
                                <th className="border-0 border-black w-[38px] p-0 bg-[#4a6da7] text-white font-bold h-full">
                                    <input type="text" value={overrides['h-ord-fes'] || 'Festive'} onChange={e => handleOverride('h-ord-fes', e.target.value)} className="w-full h-full border-none outline-none text-center bg-transparent no-print text-[7px]" />
                                    <span className="only-print text-[7px]">Festive</span>
                                </th>
                                <th className="border-r-[2px] border-black w-[38px] p-0 bg-[#4a6da7] text-white font-bold h-full shadow-[inset_1px_0_0_0_#4a6da7]">
                                    <input type="text" value={overrides['h-ord-fer'] || 'Per ferie'} onChange={e => handleOverride('h-ord-fer', e.target.value)} className="w-full h-full border-none outline-none text-center bg-transparent no-print text-[7px]" />
                                    <span className="only-print text-[7px]">Per ferie</span>
                                </th>
                                <th className="border-0 border-black w-[45px] p-0 bg-[#4a6da7] text-white font-bold h-full">
                                    <div className="flex items-center justify-center h-full px-0.5 text-[7px]">al <input type="text" value={overrides['h-str-1'] || '___'} onChange={e => handleOverride('h-str-1', e.target.value)} className="w-6 border-none outline-none text-center bg-transparent no-print font-bold" />%</div>
                                    <span className="only-print text-[7px]">al {overrides['h-str-1'] || '___'} %</span>
                                </th>
                                <th className="border-r-[2px] border-black w-[45px] p-0 bg-[#4a6da7] text-white font-bold h-full shadow-[inset_1px_0_0_0_#4a6da7]">
                                    <div className="flex items-center justify-center h-full px-0.5 text-[7px]">al <input type="text" value={overrides['h-str-2'] || '___'} onChange={e => handleOverride('h-str-2', e.target.value)} className="w-6 border-none outline-none text-center bg-transparent no-print font-bold" />%</div>
                                    <span className="only-print text-[7px]">al {overrides['h-str-2'] || '___'} %</span>
                                </th>
                                <th className="border-0 border-black w-[36px] p-0 bg-[#4a6da7] text-white font-bold h-full">
                                    <input type="text" value={overrides['h-mal-car'] || 'Carenza'} onChange={e => handleOverride('h-mal-car', e.target.value)} className="w-full h-full border-none outline-none text-center bg-transparent no-print text-[7px]" />
                                    <span className="only-print text-[7px]">Carenza</span>
                                </th>
                                <th className="border-0 border-black w-[37px] p-0 bg-[#4a6da7] text-white font-bold h-full">
                                    <div className="flex items-center justify-center h-full px-0.5 text-[7px]">al <input type="text" value={overrides['h-mal-1'] || '___'} onChange={e => handleOverride('h-mal-1', e.target.value)} className="w-6 border-none outline-none text-center bg-transparent no-print font-bold" />%</div>
                                    <span className="only-print text-[7px]">al {overrides['h-mal-1'] || '___'} %</span>
                                </th>
                                <th className="border-r-[2px] border-black w-[37px] p-0 bg-[#4a6da7] text-white font-bold h-full shadow-[inset_1px_0_0_0_#4a6da7]">
                                    <div className="flex items-center justify-center h-full px-0.5 text-[7px]">al <input type="text" value={overrides['h-mal-2'] || '___'} onChange={e => handleOverride('h-mal-2', e.target.value)} className="w-6 border-none outline-none text-center bg-transparent no-print font-bold" />%</div>
                                    <span className="only-print text-[7px]">al {overrides['h-mal-2'] || '___'} %</span>
                                </th>
                                <th className="border-0 border-black w-[45px] p-0 bg-[#4a6da7] text-white font-bold h-full">
                                    <input type="text" value={overrides['h-gior-lav'] || 'Lavorati'} onChange={e => handleOverride('h-gior-lav', e.target.value)} className="w-full h-full border-none outline-none text-center bg-transparent no-print text-[7px]" />
                                    <span className="only-print text-[7px]">Lavorati</span>
                                </th>
                                <th className="border-r-[2px] border-black w-[45px] p-0 bg-[#4a6da7] text-white font-bold h-full shadow-[inset_1px_0_0_0_#4a6da7]">
                                    <input type="text" value={overrides['h-gior-ret'] || 'Retribuiti'} onChange={e => handleOverride('h-gior-ret', e.target.value)} className="w-full h-full border-none outline-none text-center bg-transparent no-print text-[7px]" />
                                    <span className="only-print text-[7px]">Retribuiti</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="text-[10px] font-bold">
                            {visibleOperators.map((op, idx) => {
                                const processed = attendanceData[op.id];
                                return (
                                    <React.Fragment key={op.id}>
                                        <tr className="h-[18px]">
                                            <td rowSpan={3} className="border-x border-t border-black text-center text-xs bg-white p-0 align-top">
                                                <div className="h-[27px] border-b border-black flex items-center justify-center font-black">{idx + 1}</div>
                                            </td>
                                            <td rowSpan={3} className="border-r-[2px] border-x border-t border-black px-2 font-black uppercase truncate max-w-[170px] text-[11px] leading-tight bg-white align-middle">
                                                {op.lastName} {op.firstName}
                                            </td>
                                            <td className="border-r-[2px] border-black text-center text-[10px] font-black bg-[#e1effe]">O</td>
                                            {[...Array(31)].map((_, i) => {
                                                const day = i + 1;
                                                const dayDate = day <= daysOfMonth.length ? daysOfMonth[i] : null;
                                                let m = overrides[`${op.id}-O-${day}`];
                                                if (m === undefined) {
                                                    if (dayDate && (isSaturday(dayDate) || isSunday(dayDate))) m = '/';
                                                    else if (dayDate) {
                                                        const d = processed?.dailyDetails?.find(dd => isSameDay(dd.date, dayDate!));
                                                        if (d) {
                                                            if (d.status === 'lavorato') m = 'P';
                                                            else if (d.status === 'festa') m = 'FG';
                                                            else if (d.status === 'ferie') m = 'F';
                                                            else if (d.status === 'malattia') m = 'M';
                                                            else if (d.status === 'mancata_timbratura' && op.scheduleType === 'daily') m = 'A';
                                                        }
                                                    }
                                                }
                                                return (
                                                    <td key={i} className={`border border-black text-center p-0 bg-[#e1effe] ${day === 31 ? 'border-r-[2px]' : ''}`}>
                                                        <input type="text" value={m || ''} onChange={e => handleOverride(`${op.id}-O-${day}`, e.target.value.toUpperCase())} className="w-full h-full bg-transparent text-center border-none outline-none p-0 no-print font-bold" />
                                                        <span className="only-print">{m}</span>
                                                    </td>
                                                );
                                            })}
                                            {[...Array(10)].map((_, i) => (
                                                <td key={i} className={`border border-black bg-white p-0 ${[2, 4, 7, 9].includes(i) ? 'border-r-[2px]' : ''}`}>
                                                    <input type="text" value={overrides[`${op.id}-O-sum-${i}`] || ''} onChange={e => handleOverride(`${op.id}-O-sum-${i}`, e.target.value.toUpperCase())} className="w-full h-full bg-transparent text-center border-none outline-none p-0 no-print font-bold" />
                                                    <span className="only-print">{overrides[`${op.id}-O-sum-${i}`]}</span>
                                                </td>
                                            ))}
                                            <td rowSpan={3} className="border border-black bg-white p-0 text-center font-bold">
                                                <input type="text" value={overrides[`${op.id}-RETR`] || ''} onChange={e => handleOverride(`${op.id}-RETR`, e.target.value)} className="w-full h-full bg-transparent text-center border-none outline-none p-0 no-print font-bold" />
                                                <span className="only-print">{overrides[`${op.id}-RETR`]}</span>
                                            </td>
                                        </tr>
                                        <tr className="h-[18px] bg-white text-center font-bold">
                                            <td className="border-r-[2px] border-black text-center text-[10px] font-black">S</td>
                                            {[...Array(31)].map((_, i) => {
                                                const day = i + 1;
                                                const dayDate = day <= daysOfMonth.length ? daysOfMonth[i] : null;
                                                let m = overrides[`${op.id}-S-${day}`];
                                                if (m === undefined && dayDate && (isSaturday(dayDate) || isSunday(dayDate))) m = '/';
                                                return (
                                                    <td key={i} className={`border border-black text-center p-0 ${day === 31 ? 'border-r-[2px]' : ''}`}>
                                                        <input type="text" value={m || ''} onChange={e => handleOverride(`${op.id}-S-${day}`, e.target.value.toUpperCase())} className="w-full h-full bg-transparent text-center border-none outline-none p-0 no-print font-bold" />
                                                        <span className="only-print">{m}</span>
                                                    </td>
                                                );
                                            })}
                                            {[...Array(10)].map((_, i) => (
                                                <td key={i} className={`border border-black bg-white p-0 ${[2, 4, 7, 9].includes(i) ? 'border-r-[2px]' : ''}`}>
                                                    <input type="text" value={overrides[`${op.id}-S-sum-${i}`] || ''} onChange={e => handleOverride(`${op.id}-S-sum-${i}`, e.target.value.toUpperCase())} className="w-full h-full bg-transparent text-center border-none outline-none p-0 no-print font-bold" />
                                                    <span className="only-print">{overrides[`${op.id}-S-sum-${i}`]}</span>
                                                </td>
                                            ))}
                                        </tr>
                                        <tr className="h-[18px] bg-white text-center font-bold border-b-2 border-black" style={{ borderBottomWidth: '2.5px' }}>
                                            <td className="border-r-[2px] border-black text-center text-[10px] font-black"></td>
                                            {[...Array(31)].map((_, i) => {
                                                const day = i + 1;
                                                const dayDate = day <= daysOfMonth.length ? daysOfMonth[i] : null;
                                                let m = overrides[`${op.id}-B-${day}`];
                                                if (m === undefined && dayDate && (isSaturday(dayDate) || isSunday(dayDate))) m = '/';
                                                return (
                                                    <td key={i} className={`border border-black text-center p-0 ${day === 31 ? 'border-r-[2px]' : ''}`}>
                                                        <input type="text" value={m || ''} onChange={e => handleOverride(`${op.id}-B-${day}`, e.target.value.toUpperCase())} className="w-full h-full bg-transparent text-center border-none outline-none p-0 no-print font-bold" />
                                                        <span className="only-print">{m}</span>
                                                    </td>
                                                );
                                            })}
                                            {[...Array(10)].map((_, i) => (
                                                <td key={i} className={`border border-black bg-white p-0 ${[2, 4, 7, 9].includes(i) ? 'border-r-[2px]' : ''}`}>
                                                    <input type="text" value={overrides[`${op.id}-B-sum-${i}`] || ''} onChange={e => handleOverride(`${op.id}-B-sum-${i}`, e.target.value.toUpperCase())} className="w-full h-full bg-transparent text-center border-none outline-none p-0 no-print font-bold" />
                                                    <span className="only-print">{overrides[`${op.id}-B-sum-${i}`]}</span>
                                                </td>
                                            ))}
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="mt-1 flex border-[2.5px] border-black text-[10px] font-black bg-white text-black h-16 overflow-hidden">
                        <div className="w-[30%] p-2 relative h-full border-r-0">
                            <div className="uppercase text-[8px] font-black leading-none">Ditta o Reparto</div>
                            <input type="text" value={overrides['f-ditta'] || 'SERVECO SRL'} onChange={e => handleOverride('f-ditta', e.target.value)} className="mt-1 font-black text-xl leading-none w-full bg-transparent border-none outline-none no-print" />
                            <span className="only-print mt-1 font-black text-xl block leading-none">{overrides['f-ditta'] || 'SERVECO SRL'}</span>
                            <div className="absolute bottom-1 left-2 text-[8px] font-bold leading-none text-black">1673C (f)</div>
                        </div>
                        <div className="w-[40%] p-2 h-full relative">
                            <div className="text-[8px] italic font-black leading-none">Annotazioni</div>
                            <textarea value={overrides['f-anno'] || ''} onChange={e => handleOverride('f-anno', e.target.value)} className="mt-1 w-full h-[60%] bg-transparent border-none outline-none text-[9px] resize-none no-print leading-tight font-bold" />
                            <span className="only-print mt-1 text-[9px] block leading-tight font-bold">{overrides['f-anno']}</span>
                            <div className="absolute bottom-1 left-2 right-2 border-b border-black"></div>
                        </div>
                        <div className="w-[30%] p-2 flex flex-col justify-between h-full relative border-l-0">
                            <div className="flex items-center gap-2">
                                <span className="uppercase font-black text-[11px]">Foglio Presenze n.</span>
                                <input type="text" value={overrides['f-num'] || ''} onChange={e => handleOverride('f-num', e.target.value)} className="border border-black w-10 h-5 text-center bg-transparent no-print font-bold" />
                                <span className="only-print border border-black w-10 h-5 text-center flex items-center justify-center font-bold">{overrides['f-num']}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="italic font-bold">Periodo:</span>
                                <span className="font-black underline uppercase text-[11px] ml-1">{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>
                            </div>
                            <div className="absolute top-1 right-2 border-[2px] border-black px-2 py-1 text-[8px] uppercase font-black bg-white">Vidimazione</div>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @media screen { .only-print { display: none; } }
                @media print {
                    @page { size: A4 landscape; margin: 3mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .no-print { display: none !important; }
                    .only-print { display: inline !important; }
                    .attendance-sheet-container { 
                        display: flex !important;
                        justify-content: center !important;
                        align-items: center !important;
                        height: 100vh;
                        width: 100vw;
                        background: white !important;
                        position: fixed;
                        top: 0;
                        left: 0;
                        z-index: 9999;
                    }
                    .attendance-sheet { 
                        transform: scale(0.9); 
                        transform-origin: center center;
                    }
                    table { border-width: 1.5px !important; }
                }
            `}</style>
        </div>
    );
}
