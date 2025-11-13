'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore as getFirestoreSdk, Firestore } from 'firebase/firestore';
import { getAuth as getAuthSdk, Auth } from 'firebase/auth';
import { useFirebase } from './provider';
import { DependencyList, useMemo } from 'react';

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
