'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page has been deprecated. The content was moved to the admin dashboard.
// This component now just redirects to the main dashboard.
export default function DeprecatedManageOperatorsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/dashboard');
    }, [router]);

    return null;
}

    