import { NextResponse } from 'next/server';
import { adminFirestore, adminMessaging } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export async function GET(request: Request) {
  try {
    const now = new Date();
    const notificationsRef = adminFirestore.collection('scheduled-notifications');
    
    const snapshot = await notificationsRef
      .where('status', '==', 'pending')
      .where('scheduledTime', '<=', now)
      .limit(50)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ message: 'Nessuna notifica da inviare' });
    }

    const results = [];

    for (const notificationDoc of snapshot.docs) {
      const notif = notificationDoc.data();
      const operatorId = notif.operatorId;
      
      const userDoc = await adminFirestore.collection('app-users').doc(operatorId).get();
      
      if (!userDoc.exists) {
        await notificationDoc.ref.update({ 
          status: 'failed', 
          error: 'Operatore non trovato' 
        });
        results.push({ id: notificationDoc.id, status: 'failed', reason: 'User not found' });
        continue;
      }

      const userData = userDoc.data();
      const tokens = userData?.notificationTokens || [];

      if (tokens.length === 0) {
        await notificationDoc.ref.update({ 
          status: 'failed', 
          error: 'Nessun dispositivo registrato' 
        });
        results.push({ id: notificationDoc.id, status: 'failed', reason: 'No tokens' });
        continue;
      }

      const message = {
        notification: {
          title: notif.title,
          body: notif.body,
        },
        tokens: tokens,
      };

      try {
        const response = await adminMessaging.sendEachForMulticast(message);
        
        await notificationDoc.ref.update({ 
          status: 'sent', 
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          successCount: response.successCount,
          failureCount: response.failureCount
        });
        
        results.push({ 
          id: notificationDoc.id, 
          status: 'sent', 
          success: response.successCount, 
          failed: response.failureCount 
        });
      } catch (sendError: any) {
        console.error(`Errore invio notifica ${notificationDoc.id}:`, sendError);
        await notificationDoc.ref.update({ 
          status: 'failed', 
          error: sendError.message 
        });
        results.push({ id: notificationDoc.id, status: 'failed', error: sendError.message });
      }
    }

    return NextResponse.json({ 
      processed: snapshot.size,
      results 
    });

  } catch (error: any) {
    console.error('Errore nel Cron delle notifiche:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
