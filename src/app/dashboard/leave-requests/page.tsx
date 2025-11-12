"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveRequestForm } from "./components/leave-request-form";
import { LeaveRequestsList } from "./components/leave-requests-list";
import { Button } from "@/components/ui/button";
import { Bed } from "lucide-react";
import { AddSicknessDialog } from "./components/add-sickness-dialog";
import { useFirestore } from "@/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

// ==================================
// SHARED TYPES & UTILS
// ==================================

export type LeaveRequest = {
  id: string;
  user: string; // Kept for display, but logic will use operatorId
  operatorId: string;
  type: string;
  from: string;
  to: string;
  timeFrom?: string;
  timeTo?: string;
  status: 'In attesa' | 'Approvata' | 'Rifiutata';
  reason: string;
  adminNotes?: string;
};

// ==================================
// MAIN PAGE COMPONENT
// ==================================

export default function LeaveRequestsPage() {
    const [requests, setRequests] = React.useState<LeaveRequest[]>([]);
    const { toast } = useToast();
    const firestore = useFirestore();
    const [userRole, setUserRole] = React.useState<string|null>(null);
    const [userId, setUserId] = React.useState<string|null>(null);
    const [userName, setUserName] = React.useState<string|null>(null);
    const [isSicknessDialogOpen, setIsSicknessDialogOpen] = React.useState(false);

    React.useEffect(() => {
        if (!firestore) return;
        
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdmin = storedUser.role === 'admin';
        setUserRole(storedUser.role || null);
        setUserId(storedUser.id || null);
        setUserName(storedUser.username || null);
        
        let q = query(collection(firestore, 'leave-requests'));

        if (!isAdmin && storedUser.id) {
            q = query(collection(firestore, 'leave-requests'), where("operatorId", "==", storedUser.id));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest));
            setRequests(requestList.sort((a,b) => new Date(b.from).getTime() - new Date(a.from).getTime()));
        }, (error) => {
            console.error("Error fetching leave requests:", error);
            toast({
                title: "Errore di caricamento",
                description: "Impossibile caricare le richieste di ferie. Controlla i permessi.",
                variant: "destructive",
            });
        });

        return () => unsubscribe();

    }, [firestore, toast]);

    const isAdmin = userRole === 'admin';

    return (
        <div className="flex flex-col gap-8">
             <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">
                    {isAdmin ? "Gestione Richieste Ferie/Permessi" : "Le Tue Richieste di Ferie/Permessi"}
                </h2>
                 {isAdmin && (
                    <Button size="sm" onClick={() => setIsSicknessDialogOpen(true)}>
                        <Bed className="mr-2 h-4 w-4"/>
                        Aggiungi Malattia
                    </Button>
                )}
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>{isAdmin ? "Richieste in Attesa e Storico" : "Crea e visualizza le tue richieste"}</CardTitle>
                    <CardDescription>
                        {isAdmin ? "Gestisci le richieste di ferie e permessi degli operatori." : "Crea e visualizza lo storico delle tue richieste di assenza."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    {!isAdmin && userName && userId && (
                        <LeaveRequestForm
                            userName={userName}
                            userId={userId}
                         />
                    )}
                    <LeaveRequestsList
                        requests={requests}
                        isAdmin={isAdmin}
                    />
                </CardContent>
            </Card>

            {isAdmin && 
                <AddSicknessDialog 
                    isOpen={isSicknessDialogOpen}
                    onOpenChange={setIsSicknessDialogOpen}
                />
            }
        </div>
    );
};
