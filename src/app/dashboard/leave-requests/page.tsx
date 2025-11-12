"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveRequestForm } from "./components/leave-request-form";
import { LeaveRequestsList } from "./components/leave-requests-list";

// ==================================
// SHARED TYPES & UTILS
// ==================================

export type LeaveRequest = {
  id: string;
  user: string;
  type: string;
  from: string;
  to: string;
  timeFrom?: string;
  timeTo?: string;
  status: 'In attesa' | 'Approvata' | 'Rifiutata';
  reason: string;
  adminNotes?: string;
};

// Generic function to get data from localStorage
export const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    console.error(`Failed to parse ${key} from storage`, e);
    return defaultValue;
  }
};

// Generic function to save data to localStorage
export const saveToStorage = <T,>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('storage'));
};


// ==================================
// MAIN PAGE COMPONENT
// ==================================

export default function LeaveRequestsPage() {
    const [requests, setRequests] = React.useState<LeaveRequest[]>([]);
    const { toast } = useToast();
    const [userRole, setUserRole] = React.useState<string|null>(null);
    const [userName, setUserName] = React.useState<string|null>(null);

    React.useEffect(() => {
        const storedUser = getFromStorage<{role?: string, username?: string}>('user', {});
        setRequests(getFromStorage<LeaveRequest[]>('leave-requests', []));
        setUserRole(storedUser.role || null);
        setUserName(storedUser.username || null);
    }, []);
    
    const updateAllRequests = (updatedRequests: LeaveRequest[]) => {
        setRequests(updatedRequests);
        saveToStorage('leave-requests', updatedRequests);
    };

    const handleNewRequest = (newRequest: LeaveRequest) => {
        const updatedRequests = [newRequest, ...requests];
        updateAllRequests(updatedRequests);
        toast({ title: "Richiesta Inviata", description: "La tua richiesta è stata inviata per l'approvazione." });
    };

    const handleUpdateRequest = (updatedRequest: LeaveRequest) => {
        const updatedRequests = requests.map(r => r.id === updatedRequest.id ? updatedRequest : r);
        updateAllRequests(updatedRequests);
    }
    
    const handleDeleteRequest = (requestId: string) => {
        const updatedRequests = requests.filter(r => r.id !== requestId);
        updateAllRequests(updatedRequests);
    }

    const isAdmin = userRole === 'admin';
    const userRequests = isAdmin ? requests : requests.filter(r => r.user === userName);

    return (
        <div className="flex flex-col gap-8">
             <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">
                    {isAdmin ? "Gestione Richieste Ferie/Permessi" : "Le Tue Richieste di Ferie/Permessi"}
                </h2>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>{isAdmin ? "Richieste in Attesa e Storico" : "Crea e visualizza le tue richieste"}</CardTitle>
                    <CardDescription>
                        {isAdmin ? "Gestisci le richieste di ferie e permessi degli operatori." : "Crea e visualizza lo storico delle tue richieste di assenza."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    {!isAdmin && userName && (
                        <LeaveRequestForm
                            userName={userName}
                            onNewRequest={handleNewRequest}
                         />
                    )}
                    <LeaveRequestsList
                        requests={userRequests}
                        isAdmin={isAdmin}
                        onUpdateRequest={handleUpdateRequest}
                        onDeleteRequest={handleDeleteRequest}
                    />
                </CardContent>
            </Card>
        </div>
    );
};
