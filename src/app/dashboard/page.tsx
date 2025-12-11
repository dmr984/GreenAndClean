'use client';
import { useUser } from '@/hooks/use-user';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
    const { user, isLoading } = useUser();

    if (isLoading || !user) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-muted-foreground">Caricamento...</p>
                </div>
            </div>
        );
    }

    if (user.role === 'admin') {
        return <AdminDashboard />;
    }

    if (user.role === 'operator') {
        return <OperatorDashboard user={user} />;
    }

    return <div>Ruolo utente non riconosciuto.</div>;
}
