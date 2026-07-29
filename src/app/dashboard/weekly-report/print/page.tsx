'use client';

import React, { Suspense, useEffect } from 'react';

export const dynamic = 'force-dynamic';
import WeeklyReportPrintClient from './WeeklyReportPrintClient';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { format, startOfWeek, isValid } from 'date-fns';

function WeeklyReportTitleManager() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const start = searchParams.get('startDate');
        let title = 'Report_Settimanale';
        if (start) {
            const parsed = new Date(start);
            if (isValid(parsed)) {
                const startOfW = startOfWeek(parsed, { weekStartsOn: 1 });
                title = `Report_Settimanale_${format(startOfW, 'yyyy-MM-dd')}`;
            }
        }
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
        <WeeklyReportTitleManager />
        <WeeklyReportPrintClient />
    </Suspense>
  );
}
