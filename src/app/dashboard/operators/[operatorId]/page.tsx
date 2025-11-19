'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Loader2, User, ClipboardList, ListChecks, Calendar as CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useParams, useRouter } from 'next/navigation';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
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

        const shiftsQuery = query(collection(firestore, `app-users/${operatorId}/timbrature`), where('status', '==', 'sospesa'));
        const leavesQuery = query(collection(firestore, `app-users/${operatorId}/requests`), where('status', '==', 'in_attesa'));

        const unsubShifts = onSnapshot(shiftsQuery, snapshot => {
             const pendingDays = new Set(snapshot.docs.map(d => d.data().timestamp.toDate().toDateString()));
             setPendingShiftsCount(pendingDays.size);
        });

        const unsubLeaves = onSnapshot(leavesQuery, snapshot => {
            setPendingLeaveCount(snapshot.size);
        });

        return () => {
            unsubShifts();
            unsubLeaves();
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

    const getAvatarFallback = (username: string) => {
        const parts = username.split(' ');
        if (parts.length > 1 && parts[0] && parts[1]) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return username.substring(0, 2).toUpperCase();
    };
    
    const formatWorkSchedule = (schedule?: WorkSchedule) => {
        if (!schedule) return 'Nessun programma impostato.';
        const dayMapping: Record<DayOfWeek, string> = { monday: 'Lun', tuesday: 'Mar', wednesday: 'Mer', thursday: 'Gio', friday: 'Ven', saturday: 'Sab', sunday: 'Dom' };
        
        const scheduleString = dayIndexToName
            .filter(day => schedule[day] && schedule[day]! > 0)
            .map(day => `${dayMapping[day]}: ${schedule[day]}h`)
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
                    <AvatarFallback className="text-xl">{getAvatarFallback(operator.username)}</AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{operator.username}</h1>
                    <p className="text-muted-foreground">{formatWorkSchedule(operator.workSchedule)}</p>
                </div>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <NavCard 
                    title="Gestione Turni" 
                    description="Approva turni e straordinari." 
                    icon={ListChecks} 
                    link={`/dashboard/operators/${operatorId}/shifts`} 
                    badgeCount={pendingShiftsCount}
                />
                 <NavCard 
                    title="Gestione Richieste" 
                    description="Approva ferie e permessi." 
                    icon={ClipboardList} 
                    link={`/dashboard/operators/${operatorId}/requests`} 
                    badgeCount={pendingLeaveCount}
                />
                <NavCard 
                    title="Riepilogo Attività" 
                    description="Visualizza lo storico completo." 
                    icon={CalendarIcon} 
                    link={`/dashboard/operators/${operatorId}/summary`}
                />
            </div>
        </div>
    );
}
