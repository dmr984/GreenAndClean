"use client";

import { useState, useEffect } from "react";
import { Clock, LogIn, LogOut, Coffee, Play, LoaderCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function ClockWidget({ userId, userName }: { userId: string, userName: string }) {
  const [currentTime, setCurrentTime] = useState("");
  const { toast } = useToast();

  // Effect for the live clock
  useEffect(() => {
    const timer = setInterval(() => {
        setCurrentTime(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    }, 1000); // Update every second

    return () => clearInterval(timer); // Cleanup
  }, []);

  const handleAction = () => {
    toast({
        title: "Funzionalità Disabilitata",
        description: "La timbratura è temporaneamente disabilitata per manutenzione.",
        variant: "destructive"
    });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Gestione Turno</CardTitle>
        </div>
        <CardDescription>
          La timbratura è temporaneamente non disponibile.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-6">
        <div className="text-6xl font-bold font-mono tracking-tight text-foreground">
          {currentTime || "--:--"}
        </div>
        <Button onClick={handleAction} className="w-full font-bold" size="lg" disabled>
            <LoaderCircle className="mr-2 h-4 w-4" />
            Timbratura in Manutenzione
        </Button>
      </CardContent>
    </Card>
  );
}
