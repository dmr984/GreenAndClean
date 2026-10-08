'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function AntiScreenshotShield() {
  const pathname = usePathname();
  const isPrintPage = pathname?.includes('/print');

  useEffect(() => {
    // 1. Protezione base: disabilita selezione testo selvaggia e trascinamento immagini
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

    // 2. Disabilita tasto destro (menu contestuale) per prevenire salvataggi diretti
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    };

    // 3. Intercetta scorciatoie tastiera da desktop (PrintScreen, Win+Shift+S)
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const isPrintKey = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      const isPrintShortcut = (e.ctrlKey || (isMac && e.metaKey)) && (e.key === 'p' || e.key === 'P');
      const isScreenshotShortcut =
        (e.shiftKey && (e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) ||
        (isMac && e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key));

      if (isPrintKey || isScreenshotShortcut || (isPrintShortcut && !isPrintPage)) {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('');
          }
        } catch (_) {}
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      const el = document.getElementById('anti-screenshot-styles');
      if (el) el.remove();
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPrintPage]);

  // Nessun testo, nessun overlay e nessuna schermata "Schermata protetta" invasiva
  return null;
}
