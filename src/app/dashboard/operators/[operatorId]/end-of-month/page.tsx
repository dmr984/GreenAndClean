'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, getDocs, writeBatch } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, AlertTriangle, Bed, Printer, Share2, Archive, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useParams, useRouter } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay, addDays, subDays, parse, set, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import jspdf from 'jspdf';
import html2canvas from 'html2canvas';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { isPublicHoliday } from '@/lib/holidays';


type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
    startTime?: string; // "HH:mm"
    endTime?: string;
    breakMinutes?: number;
};

type WorkSchedule = {
    [key in DayOfWeek]?: DailySchedule;
};

type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    workSchedule: WorkSchedule;
    contractType?: 'weekly' | 'monthly';
    totalMonthlyHours?: number;
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'sospesa' | 'confermata' | 'rifiutata';
    isOvertime?: boolean;
    isAuto?: boolean; // Flag for automatic entries
};

type Shift = {
    date: Date;
    events: Timbratura[];
    contractualHours: number;
    workedMinutes: number;
    ordinaryHours: number;
    overtimeHours: number;
    permissionHours: number;
    isPureOvertime: boolean;
};

type DailyDetail = {
    date: Date;
    status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo' | 'festa';
    shift: Shift | null;
    request: Request | null;
};

const SummaryCard = ({ title, value, icon: Icon }: { title: string, value: string | number, icon: React.ElementType }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

const InfoBox = ({ label, value }: { label: string, value: string }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
    </div>
);

export default function EndOfMonthPage() {
    const firestore = useFirestore();
    const params = useParams();
    const { toast } = useToast();
    const operatorId = params.operatorId as string;
    const [isProcessing, setIsProcessing] = useState(false);
    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[] }>({ timbrature: [], requests: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [isCleanConfirmOpen, setIsCleanConfirmOpen] = useState(false);

    useEffect(() => {
        if (!firestore || !operatorId) return;

        const fetchOperator = async () => {
            const opDoc = await getDoc(doc(firestore, 'app-users', operatorId));
            if (opDoc.exists()) {
                setOperator(opDoc.data() as Operator);
            }
        };
        fetchOperator();
    }, [firestore, operatorId]);

    const fetchDataForMonth = useCallback(async () => {
        if (!firestore || !operatorId) {
            setIsLoading(false);
            return;
        };
        setIsLoading(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        try {
            const timbratureQuery = query(
                collection(firestore, `app-users/${operatorId}/timbrature`),
                where('timestamp', '>=', monthStart),
                where('timestamp', '<=', monthEnd)
            );
            const requestsQuery = query(
                collection(firestore, `app-users/${operatorId}/requests`),
                where('status', '==', 'approvato')
            );
    
            const [timbratureSnapshot, requestsSnapshot] = await Promise.all([
                getDocs(timbratureQuery),
                getDocs(requestsQuery)
            ]);

            const timbratureData = timbratureSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Timbratura)).filter(t => t.status === 'confermata');
            const requestsData = requestsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Request));

            setMonthlyData({ timbrature: timbratureData, requests: requestsData });
        } catch (error) {
            console.error("Error fetching monthly data:", error);
            toast({ title: 'Errore', description: 'Impossibile caricare i dati del mese.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, operatorId, currentMonth, toast]);

    useEffect(() => {
        fetchDataForMonth();
    }, [fetchDataForMonth]);
    
     const calculateShiftDetails = (events: Timbratura[], schedule: DailySchedule | undefined): { workedMinutes: number, calculationStart: Date | null, calculationEnd: Date| null } => {
        if (!Array.isArray(events) || events.length === 0) {
            return { workedMinutes: 0, calculationStart: null, calculationEnd: null };
        }
        const clockInEvent = events.find(e => e.type === 'entrata');
        const clockOutEvent = events.find(e => e.type === 'uscita');

        if (!clockInEvent || !clockOutEvent) return { workedMinutes: 0, calculationStart: null, calculationEnd: null };

        const clockInTime = clockInEvent.timestamp.toDate();
        const clockOutTime = clockOutEvent.timestamp.toDate();

        let calculationStartTime = clockInTime;
        
        if (schedule?.startTime) {
            const [contractualH, contractualM] = schedule.startTime.split(':').map(Number);
            const contractualStartDateTime = set(clockInTime, { hours: contractualH, minutes: contractualM, seconds: 0, milliseconds: 0 });
             if (calculationStartTime < contractualStartDateTime) {
                calculationStartTime = contractualStartDateTime;
            }
        }
        
        let calculationEndTime = clockOutTime;

        let totalMillis = calculationEndTime.getTime() - calculationStartTime.getTime();
        
        let breakDurationMillis = 0;
        let breakStartTs: Timestamp | null = null;
        
        const sortedEvents = [...events].sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

        for (const e of sortedEvents) {
            if (e.type === 'pausa') breakStartTs = e.timestamp;
            if (e.type === 'fine_pausa' && breakStartTs) {
                breakDurationMillis += e.timestamp.toMillis() - breakStartTs.toMillis();
                breakStartTs = null;
            }
        }
        totalMillis -= breakDurationMillis;

        if (totalMillis < 0) totalMillis = 0;
        
        const totalWorkedMinutes = Math.round(totalMillis / (1000 * 60));
       
        let finalCalculationEnd = clockOutTime;
        if(schedule?.endTime) {
            const [h, m] = schedule.endTime.split(':').map(Number);
            const contractualEnd = set(clockInTime, {hours: h, minutes: m, seconds: 0});
            if(calculationEndTime > contractualEnd) {
                finalCalculationEnd = contractualEnd;
            }
        } else if (schedule?.totalHours) {
             const breakMinutes = schedule.breakMinutes || (breakDurationMillis / 60000);
             const effectiveWorkMs = (schedule.totalHours * 60 + breakMinutes) * 60 * 1000;
             const calculatedEnd = new Date(calculationStartTime.getTime() + effectiveWorkMs);
             if (clockOutTime > calculatedEnd) {
                 finalCalculationEnd = calculatedEnd;
             }
        }
        
        return { 
            workedMinutes: totalWorkedMinutes, 
            calculationStart: calculationStartTime,
            calculationEnd: finalCalculationEnd
        };
    };

    const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator) return { monthlySummary: {} as any, dailyDetails: [] };

        const monthInterval = { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) };

        const dailyTimbrature = monthlyData.timbrature.reduce((acc, t) => {
            const dayString = t.timestamp.toDate().toDateString();
            if (!acc[dayString]) acc[dayString] = [];
            acc[dayString].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);

        const allDaysOfMonth = eachDayOfInterval(monthInterval);
        const details: DailyDetail[] = [];
        const today = startOfDay(new Date());
        
        const roundOrdinaryHours = (minutes: number): number => {
            if (minutes <= 0) return 0;
            const totalHalfHours = Math.floor(minutes / 30);
            const remainingMinutes = minutes % 30;
            return (totalHalfHours / 2) + (remainingMinutes >= 25 ? 0.5 : 0);
        };

        const roundOvertimeHours = (minutes: number): number => {
            if (minutes <= 0) return 0;
            const totalHours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return totalHours + (remainingMinutes >= 50 ? 1 : 0);
        };

        for (const day of allDaysOfMonth) {
            if (day > today) continue;

            const dayName = dayIndexToName[getDay(day)];
            const dailySchedule = operator.workSchedule[dayName];
            const contractualHours = dailySchedule?.totalHours || 0;
            const dayString = day.toDateString();
            const isHoliday = isPublicHoliday(day);
            const isWorkDay = contractualHours > 0 && !isHoliday;


            const leaveRequest = monthlyData.requests.find(r =>
                (r.type === 'ferie' || r.type === 'malattia') &&
                isWithinInterval(day, { start: r.startDate.toDate(), end: r.endDate.toDate() })
            );

            const workedEventsRaw = dailyTimbrature[dayString];
            
            if (isHoliday) {
                 details.push({
                    date: day,
                    status: 'festa',
                    request: null,
                    shift: null,
                });
            } else if (workedEventsRaw) {
                const events = [...workedEventsRaw].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
                
                const isPureOvertime = events.find(e => e.type === 'entrata')?.isOvertime || !isWorkDay;
                
                const { workedMinutes } = calculateShiftDetails(events, dailySchedule);
               
                let ordinaryMinutes = 0;
                let overtimeMinutes = 0;

                 if (isPureOvertime) {
                    overtimeMinutes = workedMinutes;
                } else {
                    const contractualMinutes = contractualHours * 60;
                    ordinaryMinutes = Math.min(workedMinutes, contractualMinutes);
                    if (workedMinutes > contractualMinutes) {
                       overtimeMinutes = workedMinutes - contractualMinutes;
                    }
                }
                
                const ordinaryHours = roundOrdinaryHours(ordinaryMinutes);
                const overtimeHours = roundOvertimeHours(overtimeMinutes);


                 const permissionHours = monthlyData.requests
                    .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
                    .reduce((sum, r) => sum + (r.hours || 0), 0);

                const manualOvertimeForDay = monthlyData.requests
                    .filter(r => r.type === 'straordinario' && isSameDay(r.startDate.toDate(), day))
                    .reduce((sum, r) => sum + (r.hours || 0), 0);

                details.push({
                    date: day,
                    status: 'lavorato',
                    request: null,
                    shift: {
                        date: day, events, contractualHours, workedMinutes, ordinaryHours, overtimeHours: overtimeHours + manualOvertimeForDay, permissionHours, isPureOvertime
                    },
                });
            } else if (leaveRequest && isWorkDay) {
                details.push({
                    date: day,
                    status: leaveRequest.type,
                    request: leaveRequest,
                    shift: null,
                });
            } else if (isWorkDay) {
                 details.push({
                    date: day,
                    status: 'mancata_timbratura',
                    request: null,
                    shift: null,
                });
            } else {
                 details.push({
                    date: day,
                    status: 'riposo',
                    request: null,
                    shift: null,
                });
            }
        }
        
        const shifts = details.filter(d => d.status === 'lavorato').map(d => d.shift!);
        
        let ferieDays = 0;
        let malattiaDays = 0;

        const processedLeaveDays = new Set<string>();

        monthlyData.requests.forEach(req => {
            if (req.type === 'ferie' || req.type === 'malattia') {
                for (let day = req.startDate.toDate(); day <= req.endDate.toDate(); day.setDate(day.getDate() + 1)) {
                    if (day > today) continue;
                    const dayString = day.toDateString();
                    if (isWithinInterval(day, monthInterval) && !processedLeaveDays.has(dayString)) {
                        const dayName = dayIndexToName[getDay(day)];
                        if ((operator.workSchedule[dayName]?.totalHours || 0) > 0 && !isPublicHoliday(day)) {
                            if (req.type === 'ferie') ferieDays++;
                            if (req.type === 'malattia') malattiaDays++;
                            processedLeaveDays.add(dayString);
                        }
                    }
                }
            }
        });


        let totalOrdinary = shifts.reduce((sum, s) => sum + s.ordinaryHours, 0);
        let totalOvertime = shifts.reduce((sum, s) => sum + s.overtimeHours, 0);
        
        const totalPermesso = monthlyData.requests
            .filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval))
            .reduce((sum, r) => sum + (r.hours || 0), 0);
            
        if (operator.contractType === 'monthly') {
            const monthlyThreshold = operator.totalMonthlyHours || 0;
            const totalHoursWithPermission = totalOrdinary + totalPermesso;

            if (totalHoursWithPermission > monthlyThreshold) {
                totalOvertime += totalHoursWithPermission - monthlyThreshold;
                totalOrdinary = monthlyThreshold - totalPermesso;
            }
        }

        return {
            monthlySummary: {
                workedDays: shifts.length,
                ordinaryHours: totalOrdinary,
                overtimeHours: totalOvertime,
                ferieDays,
                permessoHours: totalPermesso,
                malattiaDays,
            },
            dailyDetails: details.sort((a, b) => a.date.getTime() - b.date.getTime()),
        };

    }, [operator, currentMonth, monthlyData]);

    const handleMonthChange = (offset: number) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const handlePrintAndShare = () => {
        if (isProcessing) return;
        setIsProcessing(true);

        const printWindow = window.open('', '_blank', 'width=800,height=800');

        if (printWindow) {
            const stylesheets = Array.from(document.styleSheets)
                .map(sheet => sheet.href ? `<link rel="stylesheet" href="${sheet.href}">` : '')
                .join('');
            
            const summaryHTML = `
                 <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 1rem; text-align: center;">
                    <div style="border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.25rem;"><div style="font-size: 0.7rem; color: #6b7280;">Giorni Lavorati</div><div style="font-size: 1.0rem; font-weight: 700; color: #6b7280;">${monthlySummary.workedDays}</div></div>
                    <div style="border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.25rem;"><div style="font-size: 0.7rem; color: #6b7280;">Ore Ordinarie</div><div style="font-size: 1.0rem; font-weight: 700; color: #6b7280;">${monthlySummary.ordinaryHours.toLocaleString('it-IT')}</div></div>
                    <div style="border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.25rem;"><div style="font-size: 0.7rem; color: #6b7280;">Ore Straordinarie</div><div style="font-size: 1.0rem; font-weight: 700; color: #6b7280;">${monthlySummary.overtimeHours.toLocaleString('it-IT')}</div></div>
                    <div style="border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.25rem;"><div style="font-size: 0.7rem; color: #6b7280;">Giorni Ferie</div><div style="font-size: 1.0rem; font-weight: 700; color: #6b7280;">${monthlySummary.ferieDays}</div></div>
                    <div style="border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.25rem;"><div style="font-size: 0.7rem; color: #6b7280;">Ore Permessi</div><div style="font-size: 1.0rem; font-weight: 700; color: #6b7280;">${monthlySummary.permessoHours.toLocaleString('it-IT')}</div></div>
                    <div style="border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.25rem;"><div style="font-size: 0.7rem; color: #6b7280;">Giorni Malattia</div><div style="font-size: 1.0rem; font-weight: 700; color: #6b7280;">${monthlySummary.malattiaDays}</div></div>
                </div>
            `;
            
            const detailsHTML = dailyDetails.filter(d => d.status !== 'riposo').map(detail => {
                let contentHTML = '';
                const dateText = format(detail.date, 'eeee dd/MM/yyyy', { locale: it });

                if (detail.status === 'lavorato' && detail.shift) {
                    const { shift } = detail;
                    
                    let statusText = '';
                     if (shift.isPureOvertime) {
                        statusText = 'Straordinario';
                    } else if (shift.ordinaryHours > 0 && shift.overtimeHours > 0) {
                        statusText = 'Ordinario / Straordinario';
                    } else if (shift.ordinaryHours > 0 && shift.permissionHours > 0) {
                        statusText = 'Ordinario / Permesso';
                    } else {
                        statusText = 'Lavorativo';
                    }
                    
                    const timbratureText = shift.events.sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis()).map(e => {
                        const originalTime = format(e.timestamp.toDate(), 'HH:mm');
                        let referenceTime = '';
                        if (operator && (e.type === 'entrata' || e.type === 'uscita') && Array.isArray(shift.events)) {
                            const { calculationStart, calculationEnd } = calculateShiftDetails(shift.events, operator.workSchedule[dayIndexToName[getDay(shift.date)]]);
                            if (e.type === 'entrata' && calculationStart && Math.abs(calculationStart.getTime() - e.timestamp.toDate().getTime()) > 60000) {
                                referenceTime = `(${format(calculationStart, 'HH:mm')})`;
                            } else if (e.type === 'uscita' && calculationEnd && Math.abs(calculationEnd.getTime() - e.timestamp.toDate().getTime()) > 60000) {
                                referenceTime = `(${format(calculationEnd, 'HH:mm')})`;
                            }
                        }
                        
                        return `<span>${e.type.charAt(0).toUpperCase() + e.type.slice(1).replace('_', ' ')}: ${originalTime} ${referenceTime}</span>`;
                    }).join(' | ');
                    
                    const hoursText = `
                        <span style="font-weight: 700; color: #6b7280;">Ore Previste:</span> ${shift.contractualHours}h | 
                         <span style="font-weight: 700; color: #6b7280;">Ore Lavorate:</span> ${formatMinutes(shift.workedMinutes)} | 
                         <span style="font-weight: 700; color: #6b7280;">Ore Ordinarie:</span> ${shift.ordinaryHours}h | 
                         <span style="font-weight: 700; color: #6b7280;">Straordinario:</span> ${shift.overtimeHours}h | 
                         <span style="font-weight: 700; color: #6b7280;">Permesso:</span> ${shift.permissionHours}h
                    `;

                     contentHTML = `
                        <div>
                             <div style="min-width: 180px; vertical-align: top; font-size: 14px; text-transform: capitalize;">
                                <b style="color: #6b7280;">${dateText}</b>
                                <br>
                                <span style="font-size: 13px; font-weight: 500; color: #6b7280;">${statusText}</span>
                            </div>
                            <div style="vertical-align: top; font-size: 13px; margin-top: 4px;">
                                ${timbratureText}
                                <br>
                                ${hoursText}
                            </div>
                        </div>
                    `;
                } else {
                    let statusText = '';
                    switch (detail.status) {
                        case 'ferie': statusText = 'Giorno di ferie'; break;
                        case 'malattia': statusText = 'Giorno di malattia'; break;
                        case 'festa': statusText = 'Giorno Festivo'; break;
                        case 'mancata_timbratura': statusText = 'Nessuna timbratura registrata'; break;
                        default: statusText = '';
                    }
                     contentHTML = `
                       <div>
                           <div style="min-width: 180px; vertical-align: top; font-size: 14px; text-transform: capitalize;">
                               <b style="color: #6b7280;">${dateText}</b>
                                <br>
                               <span style="font-size: 13px; font-weight: 500; color: #6b7280;">${statusText}</span>
                           </div>
                       </div>
                   `;
                }
                return `<div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; padding-top: 0.5rem;">${contentHTML}</div>`;
            }).join('');


            const content = `
                <div id="printable-content" style="background-color: white; color: black; padding: 2rem; width: 210mm; min-height: 297mm; margin: auto;">
                    <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #d1d5db; padding-bottom: 1rem; margin-bottom: 1rem;">
                         <img src="https://i.postimg.cc/GhwM2hg1/1764199658760.png" alt="Serveco Logo" width="100" height="100" crossOrigin="anonymous" />
                         <div style="text-align: right;">
                             <h1 style="font-size: 1.875rem; font-weight: 700; color: #6b7280;">${operator?.firstName} ${operator?.lastName}</h1>
                             <p style="font-size: 1.25rem; text-transform: capitalize; color: #6b7280; margin-top: 0.5rem;">${format(currentMonth, 'MMMM yyyy', { locale: it })}</p>
                         </div>
                    </header>
                    <section>${summaryHTML}</section>
                    <section>
                        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; border-bottom: 1px solid #d1d5db; padding-bottom: 0.25rem; color: #6b7280;">Dettaglio Giornaliero</h3>
                        <div style="width: 100%; border-collapse: collapse;">
                           ${detailsHTML}
                        </div>
                    </section>
                </div>
            `;
            
            const script = `
                <script>
                    function handlePrint() {
                        window.print();
                    }
                    async function handleShare() {
                        try {
                           const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
                           const printContent = document.getElementById('printable-content');
                           if (!printContent) return;
                        
                           document.getElementById('printBtn').disabled = true;
                           document.getElementById('shareBtn').disabled = true;

                            const canvas = await html2canvas(printContent, { useCORS: true, allowTaint: true, scale: 2 });
                            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                            
                            const pdfWidth = pdf.internal.pageSize.getWidth();
                            
                            const imgProps = pdf.getImageProperties(canvas);
                            const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
                            let heightLeft = imgHeight;
                            let position = 0;

                            pdf.addImage(canvas, 'PNG', 0, position, pdfWidth, imgHeight, undefined, 'FAST');
                            heightLeft -= pdf.internal.pageSize.getHeight();

                            while (heightLeft > 0) {
                                position = heightLeft - imgHeight;
                                pdf.addPage();
                                pdf.addImage(canvas, 'PNG', 0, position, pdfWidth, imgHeight, undefined, 'FAST');
                                heightLeft -= pdf.internal.pageSize.getHeight();
                            }
                            
                            const blob = pdf.output('blob');
                            const file = new File([blob], 'Riepilogo.pdf', { type: 'application/pdf' });

                            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                await navigator.share({
                                    title: 'Riepilogo Mensile',
                                    text: 'Ecco il riepilogo di questo mese.',
                                    files: [file],
                                });
                            } else {
                                 pdf.output('dataurlnewwindow');
                            }
                        } catch (error) {
                            console.error('Error sharing:', error);
                            alert('Impossibile condividere il file PDF.');
                        } finally {
                           document.getElementById('printBtn').disabled = false;
                           document.getElementById('shareBtn').disabled = false;
                        }
                    }
                    
                    window.onload = () => {
                         setTimeout(() => {
                            const printButton = document.getElementById('printBtn');
                            const shareButton = document.getElementById('shareBtn');
                            if(printButton) printButton.disabled = false;
                            if(shareButton) shareButton.disabled = false;
                        }, 500); 
                    };
                <\/script>
            `;

            printWindow.document.write(`
                <html>
                    <head>
                        <title>Riepilogo Mensile - ${operator?.username}</title>
                        ${stylesheets}
                        <style>
                            @import url('https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap');
                            @media print { 
                                #controls { display: none !important; } 
                                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            }
                            body { 
                                background-color: #f3f4f6; 
                                font-family: 'PT Sans', sans-serif;
                             }
                             table, tr, td {
                                 border-collapse: collapse;
                             }
                        </style>
                        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
                        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
                        ${script}
                    </head>
                    <body>
                        <div id="controls" style="padding: 1rem; text-align: center; border-bottom: 1px solid #ccc; background-color: #fff; display: flex; justify-content: center; gap: 1rem;">
                            <button id="printBtn" onclick="handlePrint()" disabled style="padding: 8px 16px; font-size: 16px; background-color: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Stampa</button>
                            <button id="shareBtn" onclick="handleShare()" disabled style="padding: 8px 16px; font-size: 16px; background-color: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Condividi</button>
                        </div>
                        ${content}
                    </body>
                </html>
            `);

            printWindow.document.close();
        }
        setIsProcessing(false);
    };

    const handleCleanMonth = async () => {
        if (!firestore || !operatorId || !currentMonth) return;
        setIsCleaning(true);

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        const batch = writeBatch(firestore);

        // Delete timbrature for the month
        const timbratureQuery = query(
            collection(firestore, `app-users/${operatorId}/timbrature`),
            where('timestamp', '>=', monthStart),
            where('timestamp', '<=', monthEnd)
        );
        const timbratureSnap = await getDocs(timbratureQuery);
        timbratureSnap.forEach(doc => batch.delete(doc.ref));

        // Delete straordinari for the month
        const straordinariQuery = query(
            collection(firestore, `app-users/${operatorId}/straordinari`),
            where('date', '>=', monthStart),
            where('date', '<=', monthEnd)
        );
        const straordinariSnap = await getDocs(straordinariQuery);
        straordinariSnap.forEach(doc => batch.delete(doc.ref));

        // Delete requests for the month
        const requestsQuery = query(
            collection(firestore, `app-users/${operatorId}/requests`),
            where('startDate', '>=', monthStart),
            where('startDate', '<=', monthEnd)
        );
        const requestsSnap = await getDocs(requestsQuery);
        requestsSnap.forEach(doc => batch.delete(doc.ref));

        try {
            await batch.commit();
            toast({
                title: "Successo!",
                description: `I dati di ${format(currentMonth, 'MMMM yyyy', { locale: it })} sono stati eliminati.`
            });
            fetchDataForMonth(); // Refetch data to update the view
        } catch (error) {
            console.error("Errore pulizia mese:", error);
            toast({
                title: "Errore",
                description: "Impossibile completare la pulizia del mese.",
                variant: "destructive"
            });
        } finally {
            setIsCleaning(false);
            setIsCleanConfirmOpen(false);
        }
    };


    if (!operator) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <>
        <Card className="p-4 sm:p-6">
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                         <h1 className="text-3xl font-bold tracking-tight">{operator.firstName} {operator.lastName}</h1>
                        <p className="text-muted-foreground">Calcolo Fine Mese (Codice: {operator.username})</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                         <Button onClick={handlePrintAndShare} disabled={isProcessing} className="w-full sm:w-auto">
                            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                            Stampa/Condividi Riepilogo
                        </Button>
                         <Button variant="destructive" onClick={() => setIsCleanConfirmOpen(true)} disabled={isCleaning} className="w-full sm:w-auto">
                            {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                            Pulisci Mese
                        </Button>
                     </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                 <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                    <Button variant="outline" size="sm" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                        <Button variant="ghost" size="icon" onClick={fetchDataForMonth} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleMonthChange(1)}>Succ.</Button>
                </div>

                {isLoading ? (
                     <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                ) : (
                <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SummaryCard title="Giorni Lavorati" value={monthlySummary.workedDays} icon={Briefcase} />
                    <SummaryCard title="Ore Ordinarie" value={monthlySummary.ordinaryHours.toLocaleString('it-IT')} icon={Clock} />
                    <SummaryCard title="Ore Straordinarie" value={monthlySummary.overtimeHours.toLocaleString('it-IT')} icon={Plus} />
                    <SummaryCard title="Ferie (giorni)" value={monthlySummary.ferieDays} icon={Plane} />
                    <SummaryCard title="Permessi (ore)" value={monthlySummary.permessoHours.toLocaleString('it-IT')} icon={UserCheck} />
                    <SummaryCard title="Malattia (giorni)" value={monthlySummary.malattiaDays} icon={Stethoscope} />
                </div>

                <Separator />

                <div>
                    <h3 className="text-xl font-semibold mb-4">Dettaglio Giornaliero</h3>
                    {dailyDetails.length > 0 ? (
                        <div className="space-y-2">
                            {dailyDetails.map(detail => {
                                 if (detail.status === 'riposo') return null;

                                 const isSunday = getDay(detail.date) === 0;

                                return (
                                <div key={detail.date.toISOString()} className={cn("border rounded-lg p-3", isSunday && "border-red-500/30 bg-red-500/5")}>
                                    <h4 className={cn("font-bold text-lg capitalize flex items-center gap-3", isSunday && "text-red-600")}>
                                        {detail.status === 'ferie' && <Plane className="h-5 w-5 text-green-500" />}
                                        {detail.status === 'malattia' && <Stethoscope className="h-5 w-5 text-red-500" />}
                                        {detail.status === 'mancata_timbratura' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                                        {detail.status === 'lavorato' && <Briefcase className="h-5 w-5 text-blue-500" />}
                                        {detail.status === 'festa' && <Briefcase className="h-5 w-5 text-purple-500" />}

                                        {format(detail.date, 'eeee dd MMMM', { locale: it })}
                                    </h4>

                                    <div className="border-b my-2"></div>
                                    
                                    {detail.status === 'lavorato' && detail.shift ? (
                                        <>
                                            <div className="text-sm text-muted-foreground mt-1 mb-3">
                                                 {detail.shift.events.map(e => {
                                                    const originalTime = format(e.timestamp.toDate(), 'HH:mm:ss');
                                                    let referenceTime = '';

                                                    if (operator && (e.type === 'entrata' || e.type === 'uscita')) {
                                                        const { calculationStart, calculationEnd } = calculateShiftDetails(detail.shift!.events, operator.workSchedule[dayIndexToName[getDay(detail.date)]]);
                                                        if (e.type === 'entrata' && calculationStart && Math.abs(calculationStart.getTime() - e.timestamp.toDate().getTime()) > 1000) {
                                                            referenceTime = `(${format(calculationStart, 'HH:mm')})`;
                                                        } else if (e.type === 'uscita' && calculationEnd && Math.abs(calculationEnd.getTime() - e.timestamp.toDate().getTime()) > 60000) {
                                                            referenceTime = `(${format(calculationEnd, 'HH:mm')})`;
                                                        }
                                                    }


                                                    return (
                                                        <span key={e.id} className={cn('mr-2')}>
                                                            {`${e.type.replace('_', ' ')}: ${originalTime} ${referenceTime}`.trim()}
                                                            {` | `}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                <InfoBox label="Ore Previste" value={`${detail.shift.contractualHours}h`} />
                                                <InfoBox label="Ore Lavorate" value={formatMinutes(detail.shift.workedMinutes)} />
                                                <InfoBox label="Ore Ordinarie" value={`${detail.shift.ordinaryHours}h`} />
                                                <InfoBox label="Straordinario" value={`${detail.shift.overtimeHours}h`} />
                                                <InfoBox label="Permesso" value={`${detail.shift.permissionHours}h`} />
                                            </div>
                                        </>
                                    ) : detail.status === 'ferie' ? (
                                        <p className="text-muted-foreground mt-1">Giorno di ferie approvato.</p>
                                    ) : detail.status === 'malattia' ? (
                                        <p className="text-muted-foreground mt-1">Giorno di malattia approvato.</p>
                                    ) : detail.status === 'festa' ? (
                                        <p className="text-muted-foreground mt-1">Giorno festivo.</p>
                                    ) : detail.status === 'mancata_timbratura' ? (
                                        <p className="text-yellow-600 font-semibold mt-1">Nessuna timbratura registrata in un giorno lavorativo.</p>
                                    ) : null}

                                </div>
                            )})}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Nessun dato da mostrare per questo mese.</p>
                    )}
                </div>
                </>
                )}
            </CardContent>
        </Card>
        <AlertDialog open={isCleanConfirmOpen} onOpenChange={setIsCleanConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Questa azione è irreversibile. Verranno eliminate tutte le timbrature, richieste e straordinari dell'operatore per il mese di{' '}
                        <span className="font-bold">{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCleanMonth} disabled={isCleaning}>
                        {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Conferma e Pulisci
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}

    


