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
  templateShiftApprovedBody: "Ciao {operatore}. Il tuo turno del {data} è stato approvato dall'amministratore. Totale: {ordinarie} {straordinarie}.",

  templateShiftRejectedTitle: 'Turno Rifiutato ❌',
  templateShiftRejectedBody: 'Il tuo turno del {data} è stato rifiutato o annullato.',

  templateRequestApprovedTitle: 'Richiesta {tipo} Approvata ✅',
  templateRequestApprovedBody: 'La tua richiesta di {tipo} del {data} è stata approvata con successo.',

  templateRequestRejectedTitle: 'Richiesta {tipo} Rifiutata ❌',
  templateRequestRejectedBody: 'La tua richiesta di {tipo} è stata rifiutata dall\'amministratore.',

  templateShiftModifiedTitle: 'Nuovo Turno Inserito 📋',
  templateShiftModifiedBody: 'L\'amministratore ha registrato o modificato un turno per te ({data}).',
};

export function applyTemplate(template: string, vars: Record<string, string | undefined>): string {
  let result = template;
  const todayFormatted = format(new Date(), 'dd MMMM', { locale: it });

  // Normalizza straordinarie: se 0 o assente, non deve apparire
  let rawStraordinarie = vars.straordinarie;
  let formattedStraordinarie = '';
  if (rawStraordinarie) {
    const trimmed = rawStraordinarie.trim();
    if (trimmed !== '0' && trimmed !== '0h' && trimmed !== '0h straordinarie' && trimmed !== '0 straordinari' && !trimmed.startsWith('0')) {
      formattedStraordinarie = trimmed;
    }
  }

  // Normalizza ordinarie
  let rawOrdinarie = vars.ordinarie;
  let formattedOrdinarie = '';
  if (rawOrdinarie) {
    formattedOrdinarie = rawOrdinarie.trim();
  }

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

  // Pulizia automatica: spazi multipli, spazi prima di punteggiatura (es. "8h ordinarie ." -> "8h ordinarie.")
  result = result.replace(/[ \t]{2,}/g, ' ');
  result = result.replace(/\s+([.,;:!?])/g, '$1');
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

    // Calcola titolo e corpo finali applicando i template personalizzati se presenti
    let finalTitle = templateTitle ? applyTemplate(templateTitle, vars) : (notification.title || 'Notifica');
    let finalBody = templateBody ? applyTemplate(templateBody, vars) : (notification.body || '');

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
