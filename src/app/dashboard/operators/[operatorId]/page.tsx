'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Loader2, User, ClipboardList, ListChecks, Calculator } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useParams, useRouter } from 'next/navigation';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type DailySchedule = {
    totalHours?: number;
    startTime?: string;
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
};

export default function OperatorDetailPage() {
    const params = useParams();
    const router = useRouter();
    const operatorId = Array.isArray(params.operatorId) ? params.operatorId[0] : params.operatorId;
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [pendingShiftsCount, setPendingShiftsCount] = useState(0);
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
    const [pendingOvertimeCount, setPendingOvertimeCount] = useState(0);


    const operatorDocRef = useMemo(() => {
        if (!firestore || !operatorId) return null;
        return doc(firestore, 'app-users', operatorId);
    }, [firestore, operatorId]);
    
    useEffect(() => {
        if (!operatorDocRef) return;
        const unsubscribe = onSnapshot(operatorDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [operatorDocRef]);
    
    useEffect(() => {
        if (!firestore || !operatorId) return;

        // Pending Shifts
        const shiftsQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('status', '==', 'sospesa'));
        const unsubShifts = onSnapshot(shiftsQuery, snapshot => {
             const pendingDays = new Set(snapshot.docs.map(d => d.data().timestamp.toDate().toDateString()));
             setPendingShiftsCount(pendingDays.size);
        });

        // Pending Leave Requests
        const leavesQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('status', '==', 'in_attesa'));
        const unsubLeaves = onSnapshot(leavesQuery, snapshot => {
            setPendingLeaveCount(snapshot.size);
        });

        // Pending Overtime Shifts
        const overtimeQuery = query(collection(firestore, `app-users/${operatorId}/straordinari`), where('status', '==', 'in_attesa_di_approvazione'));
        const unsubOvertime = onSnapshot(overtimeQuery, snapshot => {
            setPendingOvertimeCount(snapshot.size);
        });


        return () => {
            unsubShifts();
            unsubLeaves();
            unsubOvertime();
        }
    }, [firestore, operatorId]);


    if (isLoading || isUserLoading) {
        return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!user || user.role !== 'admin') {
        return <div className="text-center text-muted-foreground">Accesso Negato.</div>;
    }

    if (!operator) {
        return <div className="text-center text-muted-foreground">Operatore non trovato.</div>;
    }

    const getAvatarFallback = (firstName: string, lastName: string) => {
        const firstInitial = firstName ? firstName[0] : '';
        const lastInitial = lastName ? lastName[0] : '';
        return `${firstInitial}${lastInitial}`.toUpperCase();
    };
    
    const formatWorkSchedule = (schedule?: WorkSchedule) => {
        if (!schedule) return 'Nessun programma impostato.';
        const dayMapping: Record<DayOfWeek, string> = { monday: 'Lun', tuesday: 'Mar', wednesday: 'Mer', thursday: 'Gio', friday: 'Ven', saturday: 'Sab', sunday: 'Dom' };
        
        const scheduleString = dayIndexToName
            .filter(day => schedule[day]?.totalHours && schedule[day]!.totalHours! > 0)
            .map(day => {
                const s = schedule[day]!;
                let display = `${dayMapping[day]}: ${s.totalHours}h`;
                if (s.startTime) {
                    display += ` (${s.startTime})`;
                }
                return display;
            })
            .join(' | ');

        return scheduleString || 'Nessun giorno lavorativo impostato.';
    };
    
    const NavCard = ({ title, description, icon: Icon, link, badgeCount }: { title: string, description: string, icon: React.ElementType, link: string, badgeCount?: number }) => (
        <Card onClick={() => router.push(link)} className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle className="text-xl">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                <div className="relative">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                    {badgeCount && badgeCount > 0 && <Badge variant="destructive" className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full p-0">{badgeCount > 9 ? '9+' : badgeCount}</Badge>}
                </div>
            </CardHeader>
        </Card>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-xl">{getAvatarFallback(operator.firstName, operator.lastName)}</AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-4xl font-bold tracking-tight">{`${operator.firstName} ${operator.lastName}`}</h1>
                    <p className="text-md text-muted-foreground">Codice: {operator.username}</p>
                    <p className="text-muted-foreground">{formatWorkSchedule(operator.workSchedule)}</p>
                </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
                <NavCard 
                    title="Gestione Turni" 
                    description="Approva turni e straordinari." 
                    icon={ListChecks} 
                    link={`/dashboard/operators/${operatorId}/shifts`} 
                    badgeCount={pendingShiftsCount + pendingOvertimeCount}
                />
                 <NavCard 
                    title="Gestione Richieste" 
                    description="Approva ferie e permessi." 
                    icon={ClipboardList} 
                    link={`/dashboard/operators/${operatorId}/requests`} 
                    badgeCount={pendingLeaveCount}
                />
                 <NavCard
                    title="Calcolo Fine Mese"
                    description="Riepilogo mensile e stampa."
                    icon={Calculator}
                    link={`/dashboard/operators/${operatorId}/end-of-month`}
                />
            </div>
        </div>
    );
}
