'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function OperatorEndOfMonthRedirect() {
    const params = useParams();
    const router = useRouter();
    const operatorId = Array.isArray(params.operatorId) ? params.operatorId[0] : params.operatorId;

    useEffect(() => {
        if (operatorId) {
            router.replace(`/dashboard/operators/${operatorId}/shifts?tab=report`);
        }
    }, [operatorId, router]);

    return (
        <div className="flex flex-1 items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
}
