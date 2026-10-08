import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { adminFirestore } from '@/lib/firebase-admin';

const VAPID_PUBLIC_KEY = 'BNpjt10Qajh1JTCFZfe2fJtfNBG1SKFoxBnowhfvW0o0oOMLZjLrIvjsyr5RWBAZ8Qr79NfiZav1QTGFVUPWotA';
const VAPID_PRIVATE_KEY = '_iRSH-DU27JgosEh7qPxW4R6crJd-kIAAmr7N12Ttec';

webpush.setVapidDetails(
  'mailto:info@greenandclean.it',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export async function POST(req: NextRequest) {
  try {
    const { operatorId, title, body, url } = await req.json();

    if (!operatorId || !title) {
      return NextResponse.json({ error: 'operatorId e title sono obbligatori' }, { status: 400 });
    }

    // Recupera le sottoscrizioni push dell'operatore da Firestore
    const subsSnap = await adminFirestore
      .collection(`app-users/${operatorId}/push-subscriptions`)
      .get();

    if (subsSnap.empty) {
      console.log(`Nessuna sottoscrizione push trovata per operatore ${operatorId}`);
      return NextResponse.json({ success: true, count: 0 });
    }

    const payload = JSON.stringify({
      title: title || 'Notifica Turno',
      body: body || '',
      icon: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
      badge: 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
      data: { url: url || '/dashboard' },
    });

    const sendPromises = subsSnap.docs.map(async (docSnap) => {
      const sub = docSnap.data();
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              auth: sub.keys?.auth,
              p256dh: sub.keys?.p256dh,
            },
          },
          payload
        );
      } catch (err: any) {
        console.error('Errore invio push al singolo dispositivo:', err);
        // Se la sottoscrizione è scaduta (410 o 404), rimuovila dal database
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try {
            await docSnap.ref.delete();
          } catch (e) {}
        }
      }
    });

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, count: subsSnap.size });
  } catch (error: any) {
    console.error('Errore globale send-push API:', error);
    return NextResponse.json({ error: error.message || 'Errore interno' }, { status: 500 });
  }
}
