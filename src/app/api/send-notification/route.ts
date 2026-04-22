import { NextResponse } from 'next/server';
import { adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { tokens, title, body, data } = await request.json();

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ error: 'Nessun token fornito' }, { status: 400 });
    }

    const message = {
      notification: {
        title: title || 'Notifica Serveco',
        body: body || '',
      },
      data: data || {},
      tokens: tokens,
    };

    const response = await adminMessaging.sendEachForMulticast(message);
    
    return NextResponse.json({ 
      success: true, 
      successCount: response.successCount,
      failureCount: response.failureCount 
    });

  } catch (error: any) {
    console.error('Errore invio notifica:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
