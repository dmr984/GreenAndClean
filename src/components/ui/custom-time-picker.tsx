"use client";

import React, { useState, useEffect } from "react";
import { Clock, Check, X, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CustomTimePickerProps {
  value?: string; // Format "HH:mm"
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function CustomTimePicker({
  value = "",
  onChange,
  label,
  placeholder = "--:--",
  disabled = false,
  className,
  id,
}: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Parse initial hours and minutes from value or fallback to current time
  const [selectedHour, setSelectedHour] = useState<number>(() => {
    if (value && value.includes(":")) {
      const h = parseInt(value.split(":")[0], 10);
      return isNaN(h) ? 8 : Math.min(23, Math.max(0, h));
    }
    return new Date().getHours();
  });

  const [selectedMinute, setSelectedMinute] = useState<number>(() => {
    if (value && value.includes(":")) {
      const m = parseInt(value.split(":")[1], 10);
      return isNaN(m) ? 0 : Math.min(59, Math.max(0, m));
    }
    return Math.floor(new Date().getMinutes() / 5) * 5;
  });

  // Keep internal state in sync when value changes externally
  useEffect(() => {
    if (value && value.includes(":")) {
      const parts = value.split(":");
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h)) setSelectedHour(Math.min(23, Math.max(0, h)));
      if (!isNaN(m)) setSelectedMinute(Math.min(59, Math.max(0, m)));
    }
  }, [value]);

  const handleOpen = () => {
    if (disabled) return;
    if (value && value.includes(":")) {
      const parts = value.split(":");
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h)) setSelectedHour(Math.min(23, Math.max(0, h)));
      if (!isNaN(m)) setSelectedMinute(Math.min(59, Math.max(0, m)));
    } else {
      const now = new Date();
      setSelectedHour(now.getHours());
      setSelectedMinute(now.getMinutes());
    }
    setIsOpen(true);
  };

  const handleConfirm = () => {
    const formatted = `${String(selectedHour).padStart(2, "0")}:${String(
      selectedMinute
    ).padStart(2, "0")}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setIsOpen(false);
  };

  const setNow = () => {
    const now = new Date();
    setSelectedHour(now.getHours());
    setSelectedMinute(now.getMinutes());
  };

  const adjustHour = (delta: number) => {
    setSelectedHour((prev) => (prev + delta + 24) % 24);
  };

  const adjustMinute = (delta: number) => {
    setSelectedMinute((prev) => (prev + delta + 60) % 60);
  };

  const hoursList = Array.from({ length: 24 }, (_, i) => i);
  // Common 5-minute intervals for quick picking plus full scroll
  const minutesList = Array.from({ length: 60 }, (_, i) => i);

  return (
    <>
      {/* Clickable trigger button that replaces input[type="time"] */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={handleOpen}
        aria-label={label || "Seleziona orario"}
        className={cn(
          "flex h-12 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-left font-mono",
          value ? "text-foreground font-semibold" : "text-muted-foreground",
          className
        )}
      >
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          <span className="text-base tracking-wider">{value || placeholder}</span>
        </span>
        <span className="text-xs font-sans text-primary/80 font-normal">
          {value ? "Modifica" : "Imposta"}
        </span>
      </button>

      {/* Custom, responsive modal with 100% on-screen controls */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[340px] w-[92vw] p-4 sm:p-6 rounded-2xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader className="text-center pb-2">
            <DialogTitle className="text-lg font-bold">
              {label ? `Imposta ${label}` : "Imposta Orario"}
            </DialogTitle>
          </DialogHeader>

          {/* Big Digital Display with Steppers */}
          <div className="flex items-center justify-center gap-2 my-2 py-3 bg-muted/40 rounded-xl border">
            {/* Hours Box */}
            <div className="flex flex-col items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => adjustHour(1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <div className="text-3xl font-extrabold tracking-wider font-mono text-primary px-2">
                {String(selectedHour).padStart(2, "0")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => adjustHour(-1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mt-1">
                Ore
              </span>
            </div>

            <div className="text-3xl font-extrabold text-muted-foreground mb-4">:</div>

            {/* Minutes Box */}
            <div className="flex flex-col items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => adjustMinute(5)}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <div className="text-3xl font-extrabold tracking-wider font-mono text-primary px-2">
                {String(selectedMinute).padStart(2, "0")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => adjustMinute(-5)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mt-1">
                Minuti
              </span>
            </div>
          </div>

          {/* Quick Selection Columns for Hours and Minutes */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p className="text-[11px] font-semibold text-center text-muted-foreground mb-1">
                Seleziona Ora
              </p>
              <div className="h-32 overflow-y-auto rounded-lg border bg-background p-1 space-y-1">
                {hoursList.map((h) => {
                  const isSelected = h === selectedHour;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setSelectedHour(h)}
                      className={cn(
                        "w-full py-1 text-sm font-mono rounded font-medium transition-colors text-center",
                        isSelected
                          ? "bg-primary text-primary-foreground font-bold shadow-sm"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      {String(h).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-center text-muted-foreground mb-1">
                Seleziona Minuto
              </p>
              <div className="h-32 overflow-y-auto rounded-lg border bg-background p-1 space-y-1">
                {minutesList.map((m) => {
                  const isSelected = m === selectedMinute;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMinute(m)}
                      className={cn(
                        "w-full py-1 text-sm font-mono rounded font-medium transition-colors text-center",
                        isSelected
                          ? "bg-primary text-primary-foreground font-bold shadow-sm"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      {String(m).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="flex items-center justify-between gap-1 pt-3 border-t mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-8 px-2 flex-1"
              onClick={setNow}
            >
              Orario Attuale
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-8 px-2"
              onClick={() => {
                setSelectedMinute(0);
              }}
            >
              :00
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-8 px-2"
              onClick={() => {
                setSelectedMinute(30);
              }}
            >
              :30
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs h-8 px-2 text-destructive hover:bg-destructive/10"
                onClick={handleClear}
              >
                Cancella
              </Button>
            )}
          </div>

          {/* Dialog Action Buttons: 100% visible, centered, responsive */}
          <DialogFooter className="flex flex-row gap-2 mt-4 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 text-sm"
              onClick={() => setIsOpen(false)}
            >
              <X className="mr-1.5 h-4 w-4" />
              Annulla
            </Button>
            <Button
              type="button"
              className="flex-1 h-11 text-sm font-bold bg-primary text-primary-foreground shadow-md hover:opacity-90"
              onClick={handleConfirm}
            >
              <Check className="mr-1.5 h-4 w-4" />
              Imposta Orario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
