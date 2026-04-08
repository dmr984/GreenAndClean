'use client';

import React, { Suspense, useEffect, useState } from 'react';
import PrintClient from './PrintClient';
import { Loader2 } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

function PrintTitleManager() {
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();

    useEffect(() => {
        const updateTitle = async () => {
            const operatorId = params.operatorId as string;
            const month = searchParams.get('month');
            
            if (operatorId && firestore) {
                try {
                    const opDoc = await getDoc(doc(firestore, 'app-users', operatorId));
                    if (opDoc.exists()) {
                        const data = opDoc.data();
                        const firstName = (data.firstName || '').trim();
                        const lastName = (data.lastName || '').trim();
                        document.title = `${firstName}_${lastName}_${month || 'Report'}`;
                    }
                } catch (error) {
                    console.error("Error updating print title:", error);
                    document.title = `Report_${month || 'Operatore'}`;
                }
            }
        };

        updateTitle();
    }, [params.operatorId, searchParams, firestore]);

    return null;
}

export default function Page() {
  return (
    <Suspense fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    }>
        <PrintTitleManager />
        <PrintClient />
    </Suspense>
  );
}
