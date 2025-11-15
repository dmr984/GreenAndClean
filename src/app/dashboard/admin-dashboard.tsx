'use client';
import Link from 'next/link';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { ManageOperators } from './manage-operators';

export function AdminDashboard() {

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      
      <div className="mt-6">
        <ManageOperators />
      </div>
    </>
  );
}
