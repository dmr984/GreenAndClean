'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore as getFirestoreSdk, Firestore } from 'firebase/firestore';
import { getAuth as getAuthSdk, Auth } from 'firebase/auth';
import { useFirebase } from './provider';

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (!getApps().length) {
    const firebaseApp = initializeApp(firebaseConfig);
    return getSdks(firebaseApp);
  }
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    firestore: getFirestoreSdk(firebaseApp),
    auth: getAuthSdk(firebaseApp),
  };
}

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore | null => {
  const context = useFirebase();
  if (!context) return null;
  return context.firestore;
};

/** Hook to access Auth instance. */
export const useAuth = (): Auth | null => {
    const context = useFirebase();
    if (!context) return null;
    return context.auth;
};


export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './errors';
export * from './error-emitter';
