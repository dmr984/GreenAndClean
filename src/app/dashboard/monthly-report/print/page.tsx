// src/app/dashboard/monthly-report/print/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense } from 'react';
import MonthlyReportPrintClient from './MonthlyReportPrintClient';
import { Loader2 } from 'lucide-react';

export default function PrintPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        }>
            <MonthlyReportPrintClient />
        </Suspense>
    );
}
