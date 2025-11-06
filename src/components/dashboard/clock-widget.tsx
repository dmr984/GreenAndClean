"use client";

import { useState, useEffect } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function ClockWidget() {
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [shiftStartTime, setShiftStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const { toast } = useToast();

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isClockedIn && shiftStartTime) {
      intervalId = setInterval(() => {
        const now = new Date();
        const diff = now.getTime() - shiftStartTime.getTime();

        const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, "0");
        const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0");
        const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, "0");

        setElapsedTime(`${hours}:${minutes}:${seconds}`);
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isClockedIn, shiftStartTime]);

  const handleClockInOut = () => {
    const newClockInState = !isClockedIn;
    setIsClockedIn(newClockInState);
    
    if (newClockInState) {
      const startTime = new Date();
      setShiftStartTime(startTime);
      toast({
        title: "Shift Started",
        description: `You clocked in at ${startTime.toLocaleTimeString()}.`,
      });
    } else {
      toast({
        title: "Shift Ended",
        description: `You clocked out at ${new Date().toLocaleTimeString()}.`,
      });
      setShiftStartTime(null);
      setElapsedTime("00:00:00");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Shift Management</CardTitle>
        </div>
        <CardDescription>
          {isClockedIn ? "You are currently on the clock." : "Tap to start your shift."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-4">
        <div className="text-5xl font-bold font-mono tracking-tighter text-center p-4 rounded-lg bg-muted w-full">
          {isClockedIn ? elapsedTime : "00:00:00"}
        </div>
        <Button onClick={handleClockInOut} className="w-full font-bold" size="lg">
          {isClockedIn ? (
            <>
              <LogOut className="mr-2 h-4 w-4" /> Clock Out
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" /> Clock In
            </>
          )}
        </Button>
        {isClockedIn && shiftStartTime && (
          <p className="text-sm text-muted-foreground">
            Shift started at {shiftStartTime.toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
