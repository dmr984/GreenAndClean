'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore as getFirestoreSdk, Firestore } from 'firebase/firestore'
import { useFirebase } from './provider';

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (!getApps().length) {
    // Always initialize with the provided config for consistency.
    const firebaseApp = initializeApp(firebaseConfig);
    return getSdks(firebaseApp);
  }

  // If already initialized, return the SDKs with the already initialized App
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestoreSdk(firebaseApp)
  };
}

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore | null => {
  const context = useFirebase();
  return context.firestore;
};

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
// non-blocking-login is removed as we use a custom auth system now
export * from './errors';
export * from './error-emitter';
