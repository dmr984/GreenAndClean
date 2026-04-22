import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: "studio-9716245358-f94b8",
      // Credential placeholder - locally this will require GOOGLE_APPLICATION_CREDENTIALS
      // On App Hosting, it should use the service account automatically.
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

export const adminMessaging = admin.messaging();
export const adminFirestore = admin.firestore();
