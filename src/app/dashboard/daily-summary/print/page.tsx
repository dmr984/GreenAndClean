'use client';

import React, { Suspense, useEffect } from 'react';
import DailySummaryPrintClient from './DailySummaryPrintClient';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';

function DailySummaryTitleManager() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const dateStr = searchParams.get('date');
        const title = dateStr ? `Report_Giornaliero_${dateStr}` : `Report_Giornaliero_${format(new Date(), 'yyyy-MM-dd')}`;
        document.title = title;
    }, [searchParams]);

    return null;
}

export default function Page() {
  return (
    <Suspense fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    }>
        <DailySummaryTitleManager />
        <DailySummaryPrintClient />
    </Suspense>
  );
}
