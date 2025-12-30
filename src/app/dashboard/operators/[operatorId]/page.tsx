'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { doc, onSnapshot, collection, query, where, Timestamp } from 'firebase/firestore';
import { Loader2, User, ClipboardList, ListChecks, Calculator } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';

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

type PendingCounts = {
    shifts: number;
    requests: number;
    overtime: number;
};

export default function OperatorDetailPage() {
    const params = useParams();
    const router = useRouter();
    const operatorId = Array.isArray(params.operatorId) ? params.operatorId[0] : params.operatorId;
    const { user, isLoading: isUserLoading } = useUser();
    const firestore = useFirestore();
    const [operator, setOperator] = useState<Operator | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingCounts, setPendingCounts] = useState<PendingCounts>({ shifts: 0, requests: 0, overtime: 0 });


    useEffect(() => {
        if (!firestore || !operatorId) {
             setIsLoading(false);
            return;
        }

        const operatorDocRef = doc(firestore, 'app-users', operatorId);
        const unsubOperator = onSnapshot(operatorDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setOperator({ id: docSnap.id, ...docSnap.data() } as Operator);
            }
             setIsLoading(false);
        });

        const shiftsQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('status', '==', 'sospesa'));
        const unsubShifts = onSnapshot(shiftsQuery, (snapshot) => {
            const pendingDays = new Set(snapshot.docs.map(d => d.data().timestamp.toDate().toDateString()));
            setPendingCounts(prev => ({ ...prev, shifts: pendingDays.size }));
        });
        
        const requestsQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('status', '==', 'in_attesa'));
        const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
             setPendingCounts(prev => ({ ...prev, requests: snapshot.size }));
        });

        const overtimeQuery = query(collection(firestore, `app-users/${operatorId}/straordinari`), where('status', 'in', ['in_attesa_di_approvazione', 'in_corso']));
        const unsubOvertime = onSnapshot(overtimeQuery, (snapshot) => {
            setPendingCounts(prev => ({ ...prev, overtime: snapshot.size }));
        });

        return () => {
            unsubOperator();
            unsubShifts();
            unsubRequests();
            unsubOvertime();
        };
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
    
    const NavCard = ({ title, description, icon: Icon, link, notificationCount }: { title: string, description: string, icon: React.ElementType, link: string, notificationCount?: number }) => (
        <Card onClick={() => router.push(link)} className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle className="text-xl">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                <div className="relative">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                     {notificationCount && notificationCount > 0 && (
                        <Badge variant="destructive" className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full p-0">
                            {notificationCount > 9 ? '9+' : notificationCount}
                        </Badge>
                    )}
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
                    notificationCount={(pendingCounts.shifts || 0) + (pendingCounts.overtime || 0)}
                />
                 <NavCard 
                    title="Gestione Richieste" 
                    description="Approva ferie e permessi." 
                    icon={ClipboardList} 
                    link={`/dashboard/operators/${operatorId}/requests`} 
                    notificationCount={pendingCounts.requests || 0}
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
