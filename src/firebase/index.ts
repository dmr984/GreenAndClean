'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore as getFirestoreSdk, Firestore } from 'firebase/firestore';
// Auth is not used directly in the simplified login, but we keep the SDK structure for future use.
import { getAuth as getAuthSdk, Auth } from 'firebase/auth';
import { useFirebase } from './provider';
import { DependencyList, useMemo } from 'react';

import { getMessaging, Messaging } from 'firebase/messaging';

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
    messaging: typeof window !== 'undefined' ? getMessaging(firebaseApp) : null,
  };
}

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore => {
  const context = useFirebase();
  if (!context || !context.firestore) {
    // This should not happen in practice if the provider is set up correctly.
    // We'll throw an error to make it clear something is wrong.
    throw new Error('useFirestore must be used within a FirebaseProvider with a valid Firestore instance.');
  }
  return context.firestore;
};

/** Hook to access Auth instance. */
export const useAuth = (): Auth => {
    const context = useFirebase();
    if (!context || !context.auth) {
        throw new Error('useAuth must be used within a FirebaseProvider with a valid Auth instance.');
    }
    return context.auth;
};

/** Hook to access Messaging instance. */
export const useMessaging = (): Messaging | null => {
    const context = useFirebase();
    if (!context) {
        throw new Error('useMessaging must be used within a FirebaseProvider.');
    }
    return (context as any).messaging;
};

type MemoFirebase<T> = T & { __memo?: boolean };

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoized = useMemo(factory, deps);

  if (typeof memoized === 'object' && memoized !== null) {
    (memoized as MemoFirebase<T>).__memo = true;
  }

  return memoized;
}


export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './errors';
export * from './error-emitter';
