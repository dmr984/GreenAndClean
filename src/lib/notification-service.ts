import { Firestore, doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

export interface NotificationSettings {
  // Flag di abilitazione per evento
  notifyShiftApproved: boolean;
  notifyShiftRejected: boolean;
  notifyRequestApproved: boolean;
  notifyRequestRejected: boolean;
  notifyShiftModified: boolean;

  // Modelli / Struttura personalizzata dei messaggi
  templateShiftApprovedTitle?: string;
  templateShiftApprovedBody?: string;

  templateShiftRejectedTitle?: string;
  templateShiftRejectedBody?: string;

  templateRequestApprovedTitle?: string;
  templateRequestApprovedBody?: string;

  templateRequestRejectedTitle?: string;
  templateRequestRejectedBody?: string;

  templateShiftModifiedTitle?: string;
  templateShiftModifiedBody?: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notifyShiftApproved: true,
  notifyShiftRejected: true,
  notifyRequestApproved: true,
  notifyRequestRejected: true,
  notifyShiftModified: true,

  templateShiftApprovedTitle: 'Turno Approvato ✅',
  templateShiftApprovedBody: "Ciao {operatore}. Il tuo turno del {data} è stato approvato dall'amministratore. Totale: {ordinarie} e {straordinarie}.",

  templateShiftRejectedTitle: 'Turno Rifiutato ❌',
  templateShiftRejectedBody: 'Il tuo turno del {data} è stato rifiutato o annullato.',

  templateRequestApprovedTitle: 'Richiesta {tipo} Approvata ✅',
  templateRequestApprovedBody: 'La tua richiesta di {tipo} del {data} è stata approvata con successo.',

  templateRequestRejectedTitle: 'Richiesta {tipo} Rifiutata ❌',
  templateRequestRejectedBody: 'La tua richiesta di {tipo} è stata rifiutata dall\'amministratore.',

  templateShiftModifiedTitle: 'Nuovo Turno Inserito 📋',
  templateShiftModifiedBody: 'L\'amministratore ha registrato o modificato un turno per te ({data}).',
};

export function parseHoursInput(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function formatHoursLabel(rawVal: string | number | undefined | null, type: 'ordinarie' | 'straordinarie' | 'totale' = 'totale'): string {
  const hoursNum = parseHoursInput(rawVal);
  if (hoursNum <= 0) return '';

  const integerHours = Math.floor(hoursNum);
  const minutes = Math.round((hoursNum - integerHours) * 60);

  if (type === 'straordinarie') {
    if (integerHours === 0 && minutes > 0) {
      return `${minutes} minuti di straordinari`;
    }
    if (integerHours > 0 && minutes > 0) {
      const hourWord = integerHours === 1 ? '1 ora' : `${integerHours} ore`;
      return `${hourWord} e ${minutes} minuti di straordinari`;
    }
    if (integerHours === 1) {
      return `1 ora di straordinario`;
    }
    return `${integerHours} ore di straordinari`;
  } else if (type === 'ordinarie') {
    if (integerHours === 0 && minutes > 0) {
      return `${minutes} minuti ordinari`;
    }
    if (integerHours > 0 && minutes > 0) {
      const hourWord = integerHours === 1 ? '1 ora' : `${integerHours} ore`;
      return `${hourWord} e ${minutes} minuti ordinarie`;
    }
    if (integerHours === 1) {
      return `1 ora ordinaria`;
    }
    return `${integerHours} ore ordinarie`;
  } else {
    // totale
    if (integerHours === 0 && minutes > 0) {
      return `${minutes} minuti`;
    }
    if (integerHours > 0 && minutes > 0) {
      const hourWord = integerHours === 1 ? '1 ora' : `${integerHours} ore`;
      return `${hourWord} e ${minutes} minuti`;
    }
    if (integerHours === 1) {
      return `1 ora`;
    }
    return `${integerHours} ore`;
  }
}

export function applyTemplate(template: string, vars: Record<string, string | undefined>): string {
  let result = template;
  const todayFormatted = format(new Date(), 'dd MMMM', { locale: it });

  // Normalizza straordinarie: se 0 o assente, non deve apparire (stringa vuota)
  let rawStraordinarie = vars.straordinarie;
  let formattedStraordinarie = '';
  if (rawStraordinarie) {
    const trimmed = rawStraordinarie.trim();
    const isZero = trimmed === '0' || trimmed === '0h' || trimmed === '0,0' || trimmed === '0.0' || trimmed === '0 ore' || trimmed === '0 minuti' || trimmed === '0h straordinarie' || trimmed === '0 straordinari';
    if (!isZero) {
      formattedStraordinarie = trimmed;
    }
  }

  // Normalizza ordinarie: se 0 o assente, non deve apparire (stringa vuota)
  let rawOrdinarie = vars.ordinarie;
  let formattedOrdinarie = '';
  if (rawOrdinarie) {
    const trimmed = rawOrdinarie.trim();
    const isZero = trimmed === '0' || trimmed === '0h' || trimmed === '0,0' || trimmed === '0.0' || trimmed === '0 ore' || trimmed === '0h ordinarie' || trimmed === '0 ordinari';
    if (!isZero) {
      formattedOrdinarie = trimmed;
    }
  }

  // 1. Gestione Intelligente della coppia {ordinarie} e {straordinarie} con congiunzioni ("e", "ed", "e/o", "+", "più", ",")
  // Se l'utente scrive "{ordinarie} e {straordinarie}" nel template:
  // - Se entrambe > 0: "8h ordinarie e 2h straordinarie"
  // - Se solo ordinarie > 0: "8h ordinarie" (la congiunzione "e" scompare automaticamente!)
  // - Se solo straordinarie > 0: "2h straordinarie" (la congiunzione "e" scompare automaticamente!)
  // - Se entrambe 0: scompare l'intero blocco
  const pairRegexOrdStr = /\{ordinarie\}\s*(e|ed|e\/o|\+|più|,)?\s*\{straordinarie\}/gi;
  result = result.replace(pairRegexOrdStr, (_match, conj) => {
    const conjunction = conj ? conj.trim() : 'e';
    if (formattedOrdinarie && formattedStraordinarie) {
      return `${formattedOrdinarie} ${conjunction} ${formattedStraordinarie}`;
    } else if (formattedOrdinarie) {
      return formattedOrdinarie;
    } else if (formattedStraordinarie) {
      return formattedStraordinarie;
    }
    return '';
  });

  const pairRegexStrOrd = /\{straordinarie\}\s*(e|ed|e\/o|\+|più|,)?\s*\{ordinarie\}/gi;
  result = result.replace(pairRegexStrOrd, (_match, conj) => {
    const conjunction = conj ? conj.trim() : 'e';
    if (formattedStraordinarie && formattedOrdinarie) {
      return `${formattedStraordinarie} ${conjunction} ${formattedOrdinarie}`;
    } else if (formattedStraordinarie) {
      return formattedStraordinarie;
    } else if (formattedOrdinarie) {
      return formattedOrdinarie;
    }
    return '';
  });

  // 2. Sostituzione delle variabili residue
  const defaultVars: Record<string, string> = {
    data: vars.data || todayFormatted,
    operatore: vars.operatore || 'Operatore',
    tipo: vars.tipo || 'turno',
    ore: vars.ore || '',
    ordinarie: formattedOrdinarie,
    straordinarie: formattedStraordinarie,
    totale: vars.totale || vars.ore || '',
  };
  const merged = { ...defaultVars, ...vars, ordinarie: formattedOrdinarie, straordinarie: formattedStraordinarie };

  for (const [key, val] of Object.entries(merged)) {
    if (val !== undefined && val !== null) {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      result = result.replace(regex, String(val));
    }
  }

  // 3. Pulizia automatica delle congiunzioni rimaste isolate:
  // Es: "Totale: 8h ordinarie e." -> "Totale: 8h ordinarie."
  result = result.replace(/\s+(e|ed|e\/o|\+|più|,)\s*([.,;:!?\n]|$)/gi, '$2');
  // Es: "Totale: e 2h straordinarie." -> "Totale: 2h straordinarie."
  result = result.replace(/([:;]\s*)(e|ed|e\/o|\+|più|,)\s+/gi, '$1');

  // 4. Pulizia spazi e punteggiatura
  result = result.replace(/[ \t]{2,}/g, ' ');
  result = result.replace(/\s+([.,;:!?])/g, '$1');
  result = result.replace(/,\s*\./g, '.');
  result = result.trim();

  return result;
}

export async function getNotificationSettings(firestore: Firestore): Promise<NotificationSettings> {
  try {
    const settingsDoc = await getDoc(doc(firestore, 'settings', 'notifications'));
    if (settingsDoc.exists()) {
      return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...settingsDoc.data(),
      };
    }
  } catch (err) {
    console.error('Error fetching notification settings:', err);
  }
  return DEFAULT_NOTIFICATION_SETTINGS;
}

export async function saveNotificationSettings(firestore: Firestore, settings: NotificationSettings): Promise<void> {
  await setDoc(doc(firestore, 'settings', 'notifications'), settings, { merge: true });
}

export type NotificationType =
  | 'shift_approved'
  | 'shift_rejected'
  | 'request_approved'
  | 'request_rejected'
  | 'shift_modified';

export interface NotificationPayload {
  type: NotificationType;
  title?: string;
  body?: string;
  customTitle?: string;
  customBody?: string;
  url?: string;
  variables?: {
    operatore?: string;
    data?: string;
    ore?: string;
    ordinarie?: string;
    straordinarie?: string;
    totale?: string;
    tipo?: string;
    dal?: string;
    al?: string;
    [key: string]: string | undefined;
  };
}

export async function sendNotificationToOperator(
  firestore: Firestore,
  operatorId: string,
  notification: NotificationPayload
): Promise<boolean> {
  try {
    const settings = await getNotificationSettings(firestore);

    // Controlla se la specifica notifica è abilitata nelle impostazioni admin
    let isEnabled = true;
    let templateTitle = '';
    let templateBody = '';

    switch (notification.type) {
      case 'shift_approved':
        isEnabled = settings.notifyShiftApproved;
        templateTitle = settings.templateShiftApprovedTitle || DEFAULT_NOTIFICATION_SETTINGS.templateShiftApprovedTitle!;
        templateBody = settings.templateShiftApprovedBody || DEFAULT_NOTIFICATION_SETTINGS.templateShiftApprovedBody!;
        break;
      case 'shift_rejected':
        isEnabled = settings.notifyShiftRejected;
        templateTitle = settings.templateShiftRejectedTitle || DEFAULT_NOTIFICATION_SETTINGS.templateShiftRejectedTitle!;
        templateBody = settings.templateShiftRejectedBody || DEFAULT_NOTIFICATION_SETTINGS.templateShiftRejectedBody!;
        break;
      case 'request_approved':
        isEnabled = settings.notifyRequestApproved;
        templateTitle = settings.templateRequestApprovedTitle || DEFAULT_NOTIFICATION_SETTINGS.templateRequestApprovedTitle!;
        templateBody = settings.templateRequestApprovedBody || DEFAULT_NOTIFICATION_SETTINGS.templateRequestApprovedBody!;
        break;
      case 'request_rejected':
        isEnabled = settings.notifyRequestRejected;
        templateTitle = settings.templateRequestRejectedTitle || DEFAULT_NOTIFICATION_SETTINGS.templateRequestRejectedTitle!;
        templateBody = settings.templateRequestRejectedBody || DEFAULT_NOTIFICATION_SETTINGS.templateRequestRejectedBody!;
        break;
      case 'shift_modified':
        isEnabled = settings.notifyShiftModified;
        templateTitle = settings.templateShiftModifiedTitle || DEFAULT_NOTIFICATION_SETTINGS.templateShiftModifiedTitle!;
        templateBody = settings.templateShiftModifiedBody || DEFAULT_NOTIFICATION_SETTINGS.templateShiftModifiedBody!;
        break;
    }

    if (!isEnabled) {
      console.log(`Notifica di tipo ${notification.type} disabilitata dall'amministratore.`);
      return false;
    }

    const vars = notification.variables || {};

    // Calcola titolo e corpo finali: se sono forniti customTitle o customBody espliciti (dall'anteprima modificata dall'admin), usali direttamente!
    let finalTitle = notification.customTitle || (templateTitle ? applyTemplate(templateTitle, vars) : (notification.title || 'Notifica'));
    let finalBody = notification.customBody || (templateBody ? applyTemplate(templateBody, vars) : (notification.body || ''));

    // Se per qualche motivo il template non ha variabili o fallisce, fai fallback su title e body espliciti
    if (!finalTitle && notification.title) finalTitle = notification.title;
    if (!finalBody && notification.body) finalBody = notification.body;

    const notifCol = collection(firestore, `app-users/${operatorId}/user-notifications`);
    await addDoc(notifCol, {
      title: finalTitle,
      body: finalBody,
      type: notification.type,
      url: notification.url || '/dashboard',
      createdAt: serverTimestamp(),
      read: false,
    });

    // Invia vera notifica Push Web al browser/dispositivo dell'operatore (anche ad app chiusa o schermo bloccato)
    try {
      if (typeof window !== 'undefined') {
        fetch('/api/send-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operatorId,
            title: finalTitle,
            body: finalBody,
            url: notification.url || '/dashboard',
          }),
        }).catch((err) => {
          console.warn('Errore invio push notification via /api/send-push:', err);
        });
      }
    } catch (pushErr) {
      console.warn('Errore chiamata push notification:', pushErr);
    }

    return true;
  } catch (error) {
    console.error('Errore nell\'invio della notifica all\'operatore:', error);
    return false;
  }
}
