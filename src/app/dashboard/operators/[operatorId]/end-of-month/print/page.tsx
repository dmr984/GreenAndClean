'use client';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope, AlertTriangle, Bed } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useParams, useSearchParams } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';

// Define types locally for standalone functionality
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = { [key in DayOfWeek]?: number };
type Operator = { id: string; username: string; workSchedule: WorkSchedule };
type Request = { id: string; type: 'ferie' | 'permesso' | 'malattia' | 'straordinario'; status: 'approvato'; startDate: Timestamp; endDate: Timestamp; hours?: number };
type Timbratura = { id: string; type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita'; timestamp: Timestamp; status: 'confermata'; isOvertime?: boolean };
type Shift = { date: Date; events: Timbratura[]; contractualHours: number; workedMinutes: number; ordinaryHours: number; overtimeHours: number; permissionHours: number };
type DailyDetail = { date: Date; status: 'lavorato' | 'ferie' | 'malattia' | 'mancata_timbratura' | 'riposo'; shift: Shift | null; request: Request | null };

// --- Reusable Components ---
const SummaryCard = ({ title, value, icon: Icon }: { title: string, value: string | number, icon: React.ElementType }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
);

const InfoBox = ({ label, value }: { label: string, value: string }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
    </div>
);

function PrintableSummary() {
    const firestore = useFirestore();
    const params = useParams();
    const searchParams = useSearchParams();

    const operatorId = params.operatorId as string;
    const monthQueryParam = searchParams.get('month');

    const [operator, setOperator] = useState<Operator | null>(null);
    const [currentMonth, setCurrentMonth] = useState(monthQueryParam ? new Date(monthQueryParam) : new Date());
    const [monthlyData, setMonthlyData] = useState<{ timbrature: Timbratura[], requests: Request[] }>({ timbrature: [], requests: [] });
    const [isLoading, setIsLoading] = useState(true);

    // Effect to trigger print on mount
    useEffect(() => {
        if (!isLoading) {
            setTimeout(() => window.print(), 500); // Timeout to allow rendering
        }
    }, [isLoading]);

    useEffect(() => {
        if (!firestore || !operatorId || !monthQueryParam) {
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch Operator
                const opDoc = await getDoc(doc(firestore, 'app-users', operatorId));
                if (opDoc.exists()) {
                    setOperator(opDoc.data() as Operator);
                }

                // Fetch Data for the month
                const monthStart = startOfMonth(currentMonth);
                const monthEnd = endOfMonth(currentMonth);

                const timbratureQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('timestamp', '>=', monthStart), where('timestamp', '<=', monthEnd));
                const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('status', '==', 'approvato'));

                const [timbratureSnap, requestsSnap] = await Promise.all([getDocs(timbratureQuery), getDocs(requestsQuery)]);

                const timbratureData = timbratureSnap.docs.map(d => d.data() as Timbratura).filter(t => t.status === 'confermata');
                const requestsData = requestsSnap.docs.map(d => d.data() as Request);

                setMonthlyData({ timbrature: timbratureData, requests: requestsData });
            } catch (error) {
                console.error("Error fetching print data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [firestore, operatorId, monthQueryParam, currentMonth]);
    
    // Calculation logic (Memoized)
     const { monthlySummary, dailyDetails } = useMemo(() => {
        if (!operator) return { monthlySummary: {} as any, dailyDetails: [] };

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

        const monthInterval = { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) };

        const dailyTimbrature = monthlyData.timbrature.reduce((acc, t) => {
            const dayString = t.timestamp.toDate().toDateString();
            if (!acc[dayString]) acc[dayString] = [];
            acc[dayString].push(t);
            return acc;
        }, {} as Record<string, Timbratura[]>);

        const allDaysOfMonth = eachDayOfInterval(monthInterval);
        const details: DailyDetail[] = [];

        for (const day of allDaysOfMonth) {
            const dayName = dayIndexToName[getDay(day)];
            const contractualHours = operator.workSchedule[dayName] || 0;
            const dayString = day.toDateString();

            const leaveRequest = monthlyData.requests.find(r =>
                (r.type === 'ferie' || r.type === 'malattia') &&
                isWithinInterval(day, { start: r.startDate.toDate(), end: r.endDate.toDate() })
            );

            const workedEvents = dailyTimbrature[dayString];

            if (workedEvents) {
                const events = workedEvents;
                let workedMinutes = 0;
                const startTime = events.find(e => e.type === 'entrata')?.timestamp;
                const endTime = events.find(e => e.type === 'uscita')?.timestamp;
                if (startTime && endTime) {
                    let totalMillis = endTime.toMillis() - startTime.toMillis();
                    let breakStart: Timestamp | null = null;
                    events.forEach(e => {
                        if (e.type === 'pausa') breakStart = e.timestamp;
                        if (e.type === 'fine_pausa' && breakStart) {
                            totalMillis -= (e.timestamp.toMillis() - breakStart.toMillis());
                            breakStart = null;
                        }
                    });
                    workedMinutes = totalMillis / (1000 * 60);
                }
                const isOvertimeShift = events.find(e => e.type === 'entrata')?.isOvertime ?? false;
                let ordinaryHours = 0, overtimeHours = 0;
                if (isOvertimeShift) {
                    overtimeHours = roundOvertimeHours(workedMinutes);
                } else {
                    const contractualMinutes = contractualHours * 60;
                    if (workedMinutes > contractualMinutes) {
                        ordinaryHours = roundOrdinaryHours(contractualMinutes);
                        overtimeHours = roundOvertimeHours(workedMinutes - contractualMinutes);
                    } else {
                        ordinaryHours = roundOrdinaryHours(workedMinutes);
                    }
                }
                 const permissionHours = monthlyData.requests
                    .filter(r => r.type === 'permesso' && isSameDay(r.startDate.toDate(), day))
                    .reduce((sum, r) => sum + (r.hours || 0), 0);

                details.push({
                    date: day, status: 'lavorato', request: null,
                    shift: { date: day, events, contractualHours, workedMinutes, ordinaryHours, overtimeHours, permissionHours },
                });
            } else if (leaveRequest && contractualHours > 0) {
                details.push({ date: day, status: leaveRequest.type, request: leaveRequest, shift: null });
            } else if (contractualHours > 0) {
                 details.push({ date: day, status: 'mancata_timbratura', request: null, shift: null });
            } else {
                 details.push({ date: day, status: 'riposo', request: null, shift: null });
            }
        }
        
        const shifts = details.filter(d => d.status === 'lavorato').map(d => d.shift!);
        let ferieDays = 0, malattiaDays = 0;
        const processedLeaveDays = new Set<string>();

        monthlyData.requests.forEach(req => {
            if (req.type === 'ferie' || req.type === 'malattia') {
                for (let day = req.startDate.toDate(); day <= req.endDate.toDate(); day.setDate(day.getDate() + 1)) {
                    const dayString = day.toDateString();
                    if (isWithinInterval(day, monthInterval) && !processedLeaveDays.has(dayString)) {
                        const dayName = dayIndexToName[getDay(day)];
                        if ((operator.workSchedule[dayName] || 0) > 0) {
                            if (req.type === 'ferie') ferieDays++;
                            if (req.type === 'malattia') malattiaDays++;
                            processedLeaveDays.add(dayString);
                        }
                    }
                }
            }
        });

        const totalOrdinary = shifts.reduce((sum, s) => sum + s.ordinaryHours, 0);
        const totalOvertimeFromShifts = shifts.reduce((sum, s) => sum + s.overtimeHours, 0);
        const totalOvertimeFromRequests = monthlyData.requests
             .filter(r => r.type === 'straordinario' && isWithinInterval(r.startDate.toDate(), monthInterval))
             .reduce((sum, r) => sum + (r.hours || 0), 0);
        const totalPermesso = monthlyData.requests
            .filter(r => r.type === 'permesso' && isWithinInterval(r.startDate.toDate(), monthInterval))
            .reduce((sum, r) => sum + (r.hours || 0), 0);

        return {
            monthlySummary: {
                workedDays: shifts.length, ordinaryHours: totalOrdinary, overtimeHours: totalOvertimeFromShifts + totalOvertimeFromRequests,
                ferieDays, permessoHours: totalPermesso, malattiaDays,
            },
            dailyDetails: details,
        };

    }, [operator, currentMonth, monthlyData]);

    const formatMinutes = (minutes: number) => {
        if (isNaN(minutes) || minutes < 0) return '00:00';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    if (isLoading || !operator) {
        return <div className="flex flex-1 items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
         <div className="bg-white text-black p-8 w-[210mm] min-h-[297mm] mx-auto">
            {/* Header */}
             <header className="flex justify-between items-center mb-8 pb-4 border-b">
                <Image src="https://i.ibb.co/cKq6nWLR/1762432288621.png" alt="Serveco Logo" width={60} height={60} className="h-15 w-15 rounded-full"/>
                <div className="text-right">
                    <h1 className="text-2xl font-bold">{operator.username}</h1>
                    <p className="text-lg capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</p>
                </div>
            </header>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <SummaryCard title="Giorni Lavorati" value={monthlySummary.workedDays} icon={Briefcase} />
                <SummaryCard title="Ore Ordinarie" value={monthlySummary.ordinaryHours.toLocaleString('it-IT')} icon={Clock} />
                <SummaryCard title="Ore Straordinarie" value={monthlySummary.overtimeHours.toLocaleString('it-IT')} icon={Plus} />
                <SummaryCard title="Ferie (giorni)" value={monthlySummary.ferieDays} icon={Plane} />
                <SummaryCard title="Permessi (ore)" value={monthlySummary.permessoHours.toLocaleString('it-IT')} icon={UserCheck} />
                <SummaryCard title="Malattia (giorni)" value={monthlySummary.malattiaDays} icon={Stethoscope} />
            </div>

            <Separator className="my-8" />

            {/* Daily Details */}
            <div>
                <h3 className="text-xl font-semibold mb-4">Dettaglio Giornaliero</h3>
                <div className="space-y-4">
                    {dailyDetails.filter(d => d.status !== 'riposo').map(detail => (
                        <div key={detail.date.toISOString()} className={cn("border rounded-lg p-3")}>
                            <h4 className={cn("font-bold text-base capitalize flex items-center gap-2")}>
                                {detail.status === 'ferie' && <Plane className="h-4 w-4 text-green-600" />}
                                {detail.status === 'malattia' && <Stethoscope className="h-4 w-4 text-red-600" />}
                                {detail.status === 'mancata_timbratura' && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                {detail.status === 'lavorato' && <Briefcase className="h-4 w-4 text-blue-600" />}
                                {format(detail.date, 'eeee dd MMMM', { locale: it })}
                            </h4>

                            {detail.status === 'lavorato' && detail.shift && (
                                <>
                                    <p className="text-xs text-gray-500 mt-1 mb-2">
                                        {detail.shift.events.map(e => `${e.type.replace('_', ' ')}: ${format(e.timestamp.toDate(), 'HH:mm')}`).join(' | ')}
                                    </p>
                                    <div className="grid grid-cols-5 gap-2">
                                        <InfoBox label="Previste" value={`${detail.shift.contractualHours}h`} />
                                        <InfoBox label="Lavorate" value={formatMinutes(detail.shift.workedMinutes)} />
                                        <InfoBox label="Ordinarie" value={`${detail.shift.ordinaryHours}h`} />
                                        <InfoBox label="Straord." value={`${detail.shift.overtimeHours}h`} />
                                        <InfoBox label="Permesso" value={`${detail.shift.permissionHours}h`} />
                                    </div>
                                </>
                            )}
                            {detail.status === 'ferie' && <p className="text-gray-600 mt-1 text-sm">Giorno di ferie approvato.</p>}
                            {detail.status === 'malattia' && <p className="text-gray-600 mt-1 text-sm">Giorno di malattia approvato.</p>}
                            {detail.status === 'mancata_timbratura' && <p className="text-yellow-700 font-semibold mt-1 text-sm">Nessuna timbratura registrata.</p>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}


export default function PrintPage() {
    return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <PrintableSummary />
        </Suspense>
    )
}
