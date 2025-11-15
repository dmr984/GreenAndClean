'use client';
import React from 'react';

export function AdminDashboard() {

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Admin</h2>
      </div>
      
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm mt-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">
              Nessun elemento da visualizzare
            </h3>
            <p className="text-sm text-muted-foreground">
              Il pannello di controllo è attualmente vuoto.
            </p>
          </div>
        </div>
    </>
  );
}
