'use client';

import React, { Suspense, useEffect, useState } from 'react';
import MonthlyReportPrintClient from './MonthlyReportPrintClient';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { format, isValid } from 'date-fns';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

function MonthlyReportTitleManager() {
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const [titleSet, setTitleSet] = useState(false);

    useEffect(() => {
        async function updateTitle() {
            const month = searchParams.get('month');
            const operatorIds = searchParams.get('operators');
            
            let datePart = '';
            if (month) {
                const [year, mIndex] = month.split('-').map(Number);
                const parsedDate = new Date(Date.UTC(year, mIndex - 1, 15));
                if (isValid(parsedDate)) {
                    datePart = format(parsedDate, 'yyyy-MM');
                }
            }

            let title = `Report_Mensile${datePart ? `_${datePart}` : ''}`;

            if (operatorIds) {
                const ids = operatorIds.split(',');
                if (ids.length === 1 && firestore) {
                    const opDoc = await getDoc(doc(firestore, 'app-users', ids[0]));
                    if (opDoc.exists()) {
                        const data = opDoc.data();
                        const firstName = (data.firstName || '').trim();
                        const lastName = (data.lastName || '').trim();
                        if (firstName || lastName) {
                            title = `${firstName}_${lastName}${datePart ? `_${datePart}` : ''}`;
                        }
                    }
                }
            }

            document.title = title;
            setTitleSet(true);
        }

        updateTitle();
    }, [searchParams, firestore]);

    return null;
}

export default function Page() {
  return (
    <Suspense fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    }>
        <MonthlyReportTitleManager />
        <MonthlyReportPrintClient />
    </Suspense>
  );
}
