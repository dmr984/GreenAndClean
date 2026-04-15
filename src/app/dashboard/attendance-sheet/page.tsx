'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/use-user';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { processMonthlyData } from '@/lib/calculations';
import { Loader2, Printer, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { format, subMonths, addMonths, startOfMonth, endOfMonth, isSaturday, isSunday, getDate } from 'date-fns';
import { it } from 'date-fns/locale';
import '@/styles/print-attendance.css'; 

export default function AttendanceSheetPage() {
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [loadingData, setLoadingData] = useState(false);
    
    // For query boundaries
    const queryStart = subMonths(startOfMonth(currentMonth), 1);
    const queryEnd = addMonths(endOfMonth(currentMonth), 1);
    
    // Grid state: Array of operator rows
    const [rows, setRows] = useState<any[]>([]);
    
    // Header/Footer editable fields
    const [meta, setMeta] = useState({
        ditta: 'SERVECO SRL',
        periodo: format(new Date(), 'MMMM yyyy', { locale: it }).toUpperCase(),
        foglioN: '',
        annotazioni: ''
    });

    useEffect(() => {
        setMeta(prev => ({
            ...prev,
            periodo: format(currentMonth, 'MMMM yyyy', { locale: it }).toUpperCase()
        }));
    }, [currentMonth]);

    useEffect(() => {
        if (!firestore || !user) return;
        if (user.role !== 'admin') return;

        const fetchData = async () => {
            setLoadingData(true);
            try {
                const startDate = startOfMonth(currentMonth);
                const endDate = endOfMonth(currentMonth);
                const monthDays = getDate(endDate); 

                const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
                const operatorsSnapshot = await getDocs(operatorsQuery);
                const allOperators = operatorsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
                allOperators.sort((a,b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));

                const processedRows = [];

                for (const operator of allOperators) {
                    const timbratureQuery = query(
                        collection(firestore, `app-users/${operator.id}/timbrature`),
                        where('timestamp', '>=', startDate),
                        where('timestamp', '<=', endDate)
                    );
                    const requestsQuery = query(
                        collection(firestore, `app-users/${operator.id}/requests`),
                        where('status', '==', 'approvato')
                    );
                    const straordinariQuery = query(
                        collection(firestore, `app-users/${operator.id}/straordinari`),
                        where('date', '>=', queryStart),
                        where('date', '<=', queryEnd)
                    );

                    const [timbratureSnap, requestsSnap, straordinariSnap] = await Promise.all([
                        getDocs(timbratureQuery),
                        getDocs(requestsQuery),
                        getDocs(straordinariQuery)
                    ]);

                    const timbratureData = timbratureSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                    const requestsData = requestsSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
                    const straordinariData = straordinariSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));

                    const data = processMonthlyData(currentMonth, operator, { 
                        timbrature: timbratureData, 
                        requests: requestsData, 
                        straordinari: straordinariData 
                    });
                    
                    const daysMap: Record<number, string> = {};
                    let totalDays = 0;
                    
                    data.dailyDetails.forEach(detail => {
                        const dayNum = getDate(detail.date);
                        
                        let code = '';
                        
                        if (detail.status === 'ferie') {
                            code = 'FE';
                        } else if (detail.status === 'malattia') {
                            code = 'M';
                        } else if (detail.status === 'festa') {
                            code = 'FG';
                        } else if (detail.status === 'lavorato') {
                             code = 'P'; 
                             totalDays++;
                        } else if (detail.status === 'mancata_timbratura') {
                             if (operator.scheduleType !== 'monthly') {
                                 code = 'A';
                             } else {
                                 code = '-'; 
                             }
                        }

                        // Override for Sat/Sun
                        if (isSaturday(detail.date) || isSunday(detail.date)) {
                            if (detail.status === 'lavorato') {
                                code = 'P';
                            } else {
                                code = '-';
                            }
                        }
                        
                        // Overwrite empty logic
                        if(!code) code = '-';

                        daysMap[dayNum] = code;
                    });

                    processedRows.push({
                        operator,
                        monthDays,
                        daysMap,
                        totalDays,
                        totals: data.monthlySummary
                    });
                }
                setRows(processedRows);
            } catch (err) {
                 console.error(err);
            } finally {
                setLoadingData(false);
            }
        };

        fetchData();
    }, [firestore, user, currentMonth]);

    const handlePreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

    const handleCellChange = (rowIndex: number, dayNum: number, value: string) => {
        setRows(prev => {
            const newRows = [...prev];
            newRows[rowIndex].daysMap[dayNum] = value;
            return newRows;
        });
    };

    const handleSummaryChange = (rowIndex: number, field: string, value: string) => {
        setRows(prev => {
            const newRows = [...prev];
            newRows[rowIndex].summaryOverrides = {
                ...(newRows[rowIndex].summaryOverrides || {}),
                [field]: value
            };
            return newRows;
        });
    };

    const handlePrint = () => {
        window.print();
    };

    if (isUserLoading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!user || user.role !== 'admin') {
        return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Accesso Negato.</p></div>;
    }

    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const monthDays = getDate(end);

    return (
        <div className="flex flex-col gap-4">
            {/* UI SETTINGS BLOCK - Hidden on Print */}
            <Card className="shadow-md no-print border-b">
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-3 rounded-full">
                            <FileSpreadsheet className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">Foglio Presenze</CardTitle>
                            <CardDescription>Visualizza e modifica le presenze prima della stampa.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-2">
                     <div className="flex flex-wrap items-center justify-between gap-4">
                         <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-xl border">
                             <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
                                 <ChevronLeft className="h-5 w-5" />
                             </Button>
                             <h2 className="text-xl font-bold capitalize min-w-[150px] text-center">
                                 {format(currentMonth, 'MMMM yyyy', { locale: it })}
                             </h2>
                             <Button variant="outline" size="icon" onClick={handleNextMonth}>
                                 <ChevronRight className="h-5 w-5" />
                             </Button>
                         </div>

                         <Button onClick={handlePrint} className="h-12 text-lg gap-2" size="lg" disabled={loadingData}>
                             <Printer className="h-5 w-5" /> Genera e Stampa Foglio
                         </Button>
                     </div>
                </CardContent>
            </Card>

            {/* PRINT-OPTIMIZED TABLE SECTION */}
            <div className="bg-white p-4 print-container">
                {loadingData ? (
                     <div className="flex flex-col items-center justify-center py-20 no-print">
                         <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                         <p className="text-black">Calcolo presenze in corso...</p>
                    </div>
                ) : (
                    <div className="attendance-sheet-container text-black text-[9px] w-full max-w-[297mm] mx-auto bg-white">
                        <table className="w-full border-collapse attendance-table table-fixed border-black">
                            <thead>
                                <tr className="h-4">
                                    <th colSpan={2} className="w-48 border border-black bg-white"></th>
                                    <th colSpan={31} className="text-center font-bold border border-black main-header uppercase py-1">PRESTAZIONI PER CIASCUNA GIORNATA</th>
                                    <th colSpan={3} className="text-center border border-black main-header uppercase text-[8px] py-1">ORE ORDINARIE</th>
                                    <th colSpan={2} className="text-center border border-black main-header uppercase text-[8px] py-1">ORE STR.</th>
                                    <th colSpan={3} className="text-center border border-black main-header uppercase text-[8px] py-1">MALATT.INFORT.</th>
                                    <th colSpan={2} className="text-center border border-black main-header uppercase text-[8px] py-1">GIORNI</th>
                                    <th className="border border-black main-header text-[7px] py-0 px-1 leading-tight">Retribuzione oraria €</th>
                                </tr>
                                <tr className="h-8">
                                    <th className="w-8 border border-black p-0 text-[7px] font-normal italic sub-header align-bottom">N. d'ord.</th>
                                    <th className="w-40 text-center border border-black p-1 text-[9px] sub-header">Cognome e Nome Qualifica</th>
                                    {Array.from({length: 31}, (_, i) => (
                                        <th key={`day-h-${i}`} className="text-center border border-black p-0 w-[2%] text-[9px] sub-header">{i + 1}</th>
                                    ))}
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header leading-tight">Lavorate</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header leading-tight">Festive</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header leading-tight">Per ferie</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header italic leading-tight">al %</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header italic leading-tight">al %</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header leading-tight">Carenza</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header italic leading-tight">al %</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header italic leading-tight">al %</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header leading-tight">Lavorati</th>
                                    <th className="border border-black p-0 text-[7px] font-normal sub-header italic leading-tight text-blue-800">Retribuiti</th>
                                    <th className="border border-black p-0 sub-header"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, idx) => {
                                    const daysInMonth = row.monthDays;
                                    const isBlueRow = idx % 2 !== 0;
                                    const overrides = row.summaryOverrides || {};

                                    return (
                                        <React.Fragment key={row.operator.id}>
                                            <tr className="h-6">
                                                <td rowSpan={2} className="border border-black text-center align-middle text-[8px]">{idx + 1}</td>
                                                <td rowSpan={2} className="border border-black px-1 font-bold whitespace-nowrap overflow-hidden text-ellipsis text-[9px] align-middle">
                                                    {row.operator.lastName} {row.operator.firstName}
                                                </td>
                                                {Array.from({length: 31}, (_, i) => {
                                                    const dayNum = i + 1;
                                                    const isDummy = dayNum > daysInMonth;
                                                    return (
                                                        <td key={`cell-o-${idx}-${dayNum}`} className={`text-center border border-black font-bold h-6 p-0 ${isDummy ? 'bg-gray-100' : ''}`}>
                                                            {!isDummy && (
                                                                 <input 
                                                                    className="w-full h-full text-center outline-none uppercase font-bold text-[10px] bg-transparent"
                                                                    value={row.daysMap[dayNum] || ''}
                                                                    onChange={(e) => handleCellChange(idx, dayNum, e.target.value.toUpperCase())}
                                                                    maxLength={2}
                                                                 />
                                                            )}
                                                        </td>
                                                    )
                                                })}
                                                {/* ORE ORDINARIE */}
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.ord_lav ?? (row.totals.ordinaryHours || '')} onChange={(e) => handleSummaryChange(idx, 'ord_lav', e.target.value)} />
                                                </td>
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.ord_fes ?? (row.totals.festiveHours || '')} onChange={(e) => handleSummaryChange(idx, 'ord_fes', e.target.value)} />
                                                </td>
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.ord_fer ?? (row.totals.ferieHours || '')} onChange={(e) => handleSummaryChange(idx, 'ord_fer', e.target.value)} />
                                                </td>
                                                
                                                {/* ORE STR */}
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.str_al1 ?? (row.totals.overtimeHours || '')} onChange={(e) => handleSummaryChange(idx, 'str_al1', e.target.value)} />
                                                </td>
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.str_al2 ?? ''} onChange={(e) => handleSummaryChange(idx, 'str_al2', e.target.value)} />
                                                </td>

                                                {/* MALATTIA */}
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.mal_car ?? ''} onChange={(e) => handleSummaryChange(idx, 'mal_car', e.target.value)} />
                                                </td>
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.mal_al1 ?? (row.totals.malattiaDays || '')} onChange={(e) => handleSummaryChange(idx, 'mal_al1', e.target.value)} />
                                                </td>
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.mal_al2 ?? ''} onChange={(e) => handleSummaryChange(idx, 'mal_al2', e.target.value)} />
                                                </td>

                                                {/* GIORNI */}
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center font-bold text-[8px] h-full" value={overrides.gg_lav ?? (row.workedDays || row.totalDays || '')} onChange={(e) => handleSummaryChange(idx, 'gg_lav', e.target.value)} />
                                                </td>
                                                <td className="border border-black p-0">
                                                    <input className="w-full text-center text-[8px] h-full" value={overrides.gg_ret ?? (row.workedDays || row.totalDays || '')} onChange={(e) => handleSummaryChange(idx, 'gg_ret', e.target.value)} />
                                                </td>

                                                <td className="border border-black p-0 text-center text-[8px]">
                                                    <input className="w-full text-center" value={overrides.retr ?? ''} onChange={(e) => handleSummaryChange(idx, 'retr', e.target.value)} />
                                                </td>
                                            </tr>
                                            <tr className="h-4">
                                                <td className="w-2 border border-black text-[7px] p-0 text-center font-normal sub-header">s</td>
                                                {Array.from({length: 31}, (_, i) => (
                                                    <td key={`cell-s-${idx}-${i}`} className="border border-black p-0"></td>
                                                ))}
                                                <td className="border border-black p-0" colSpan={3}></td>
                                                <td className="border border-black p-0" colSpan={2}></td>
                                                <td className="border border-black p-0" colSpan={3}></td>
                                                <td className="border border-black p-0" colSpan={2}></td>
                                                <td className="border border-black p-0"></td>
                                            </tr>
                                            <tr className="h-2 no-print">
                                                <td colSpan={50} className="border-none h-1"></td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div className="mt-4 grid grid-cols-2 gap-x-12 px-2 text-[9px] uppercase font-bold border-t border-black pt-4">
                            <div className="space-y-4">
                                <div className="flex gap-2 items-center">
                                    <span>DITTA O REPARTO:</span>
                                    <input className="flex-1 border-b border-black outline-none" value={meta.ditta} onChange={(e) => setMeta({...meta, ditta: e.target.value})} />
                                </div>
                                <div className="flex gap-2 items-start">
                                    <span>Annotazioni:</span>
                                    <textarea className="flex-1 border-b border-black outline-none resize-none h-16 bg-transparent" value={meta.annotazioni} onChange={(e) => setMeta({...meta, annotazioni: e.target.value})} />
                                </div>
                            </div>
                            <div className="space-y-4 text-right">
                                <div className="flex justify-end gap-2 items-center">
                                    <h2 className="text-xl font-black">FOGLIO PRESENZE n.</h2>
                                    <input className="w-16 border-b border-black outline-none text-xl text-center" value={meta.foglioN} onChange={(e) => setMeta({...meta, foglioN: e.target.value})} />
                                </div>
                                <div className="flex justify-end gap-2 items-center">
                                    <span>Periodo:</span>
                                    <input className="w-48 border-b border-black outline-none text-right" value={meta.periodo} onChange={(e) => setMeta({...meta, periodo: e.target.value})} />
                                </div>
                                <div className="mt-8">
                                    <div className="inline-block w-48 text-center border-t border-black pt-1">
                                        VIDIMAZIONE
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="text-[7px] mt-4 flex justify-between">
                            <span>1673C (F)</span>
                            <span className="border border-black px-2 py-1 font-bold">1</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
