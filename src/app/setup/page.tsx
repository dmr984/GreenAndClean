
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';

const adminEmail = "admin@serveco.it";
const adminPassword = "070380"; // The 'code'

export default function SetupPage() {
    const auth = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isDone, setIsDone] = useState(false);

    const handleRegisterAdmin = async () => {
        setIsLoading(true);
        try {
            await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
            toast({
                title: "Amministratore Registrato",
                description: "L'utente admin è stato creato. Ora puoi effettuare il login.",
            });
            setIsDone(true);
            setTimeout(() => router.push('/'), 2000);
        } catch (error: any) {
            if (error.code === 'auth/email-already-in-use') {
                 toast({
                    variant: "default",
                    title: "Admin già esistente",
                    description: "L'utente amministratore è già registrato. Puoi procedere al login.",
                });
                setIsDone(true);
                setTimeout(() => router.push('/'), 2000);
            } else {
                toast({
                    variant: "destructive",
                    title: "Errore di Registrazione",
                    description: error.message,
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <KeyRound className="h-6 w-6 text-primary" />
                        Setup Amministratore
                    </CardTitle>
                    <CardDescription>
                        Questo processo registrerà l'utente amministratore predefinito nel sistema di autenticazione.
                        Questa operazione è necessaria solo una volta.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-4">
                    {isDone ? (
                         <div className="text-center text-green-500">
                            <p>Operazione completata! Verrai reindirizzato al login a breve...</p>
                        </div>
                    ) : (
                        <>
                        <div className="text-sm text-muted-foreground text-center">
                            <p>Verrà creato un utente con le seguenti credenziali:</p>
                            <p>Email: <span className="font-mono">{adminEmail}</span></p>
                            <p>Codice/Password: <span className="font-mono">{adminPassword}</span></p>
                        </div>
                        <Button 
                            onClick={handleRegisterAdmin} 
                            disabled={isLoading}
                            className="w-full"
                        >
                            {isLoading ? 'Registrazione in corso...' : 'Registra Utente Admin'}
                        </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
