'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Shield, ShieldAlert } from 'lucide-react';
import { useUser } from '@/hooks/use-user';

export function AntiScreenshotShield() {
  const pathname = usePathname();
  const { user } = useUser();
  const [isBlurred, setIsBlurred] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const isPrintPage = pathname?.includes('/print');

  useEffect(() => {
    // 1. Inietta stili CSS globali per bloccare copia, selezione testo, trascinamento immagini e menu contestuale
    const styleEl = document.createElement('style');
    styleEl.id = 'anti-screenshot-styles';
    styleEl.innerHTML = `
      body {
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-touch-callout: default !important;
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      img {
        -webkit-user-drag: none !important;
        user-drag: none !important;
      }
      ${!isPrintPage ? `
      @media print {
        body {
          display: none !important;
        }
      }
      ` : ''}
    `;
    document.head.appendChild(styleEl);

    // 2. Disabilita tasto destro (menu contestuale) per prevenire salvataggi
    const handleContextMenu = (e: MouseEvent) => {
      // Consenti tasto destro solo se non è un elemento critico
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    };

    // 3. Intercetta scorciatoie da tastiera per screenshot e stampa
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const isPrintKey = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      const isPrintShortcut = (e.ctrlKey || (isMac && e.metaKey)) && (e.key === 'p' || e.key === 'P');
      const isScreenshotShortcut =
        // Windows Snipping Tool (Win + Shift + S) or Ctrl + Shift + S
        (e.shiftKey && (e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) ||
        // Mac screenshot (Cmd + Shift + 3/4/5)
        (isMac && e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key));

      if (isPrintKey || isScreenshotShortcut || (isPrintShortcut && !isPrintPage)) {
        e.preventDefault();
        e.stopPropagation();

        // Cancella clipboard se supportato
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('');
          }
        } catch (_) {}

        setShowWarning(true);
        setTimeout(() => setShowWarning(false), 3000);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('');
          }
        } catch (_) {}
      }
    };

    // 4. Privacy Shield quando l'app perde il focus o viene aperto il task switcher sul telefono
    const handleBlur = () => {
      // Attiva schermata protettiva temporanea quando l'utente passa ad altra app o tenta cattura esterna
      setIsBlurred(true);
    };

    const handleFocus = () => {
      setIsBlurred(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsBlurred(true);
      } else {
        setIsBlurred(false);
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      const el = document.getElementById('anti-screenshot-styles');
      if (el) el.remove();
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPrintPage]);

  return (
    <>
      {/* Overlay Privacy Shield quando la finestra perde il focus (previene anteprime nel task switcher mobile) */}
      {isBlurred && !isPrintPage && (
        <div 
          className="fixed inset-0 z-[99999] bg-background/98 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center select-none"
          onClick={() => setIsBlurred(false)}
        >
          <div className="flex flex-col items-center gap-4 max-w-sm">
            <div className="relative h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Schermata Protetta</h2>
            <p className="text-xs text-muted-foreground">
              La visualizzazione è oscurata per proteggere i dati aziendali e i turni del personale da screenshot e registrazioni non autorizzate.
            </p>
            <p className="text-[11px] text-primary/80 font-medium">Tocca per riattivare la schermata</p>
          </div>
        </div>
      )}

      {/* Banner / Avviso se viene rilevato un tentativo di cattura */}
      {showWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100000] bg-destructive text-destructive-foreground px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-4">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Cattura schermo bloccata per la protezione dei dati.</span>
        </div>
      )}
      {/* Filigrana forense dinamica: impressa sottilmente in sottofondo (visibile in eventuali screenshot/foto) */}
      {!isPrintPage && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none select-none z-[9990] overflow-hidden opacity-[0.03] dark:opacity-[0.04] grid grid-cols-2 sm:grid-cols-3 gap-y-24 gap-x-12 p-6"
        >
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="transform -rotate-12 text-[10px] sm:text-xs font-mono font-semibold text-foreground tracking-wider select-none"
            >
              SERVECO • {user ? `${user.firstName} ${user.lastName}`.trim() || user.username : 'GREEN & CLEAN'}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
