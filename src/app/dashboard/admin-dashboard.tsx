'use client';
import Link from 'next/link';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Settings } from 'lucide-react';

export function AdminDashboard() {

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover:bg-muted/50 transition-colors text-center h-full flex flex-col justify-center cursor-not-allowed opacity-50">
              <CardHeader>
                  <Users className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-primary"/>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <CardTitle className="text-xl sm:text-2xl">Gestione Operatori</CardTitle>
              </CardContent>
          </Card>
      </div>
    </>
  );
}
