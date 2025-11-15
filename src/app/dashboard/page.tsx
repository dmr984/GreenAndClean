'use client';

import React from 'react';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';
import { useRouter } from 'next/navigation';


type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

// The user prop is passed down from DashboardLayout
export default function Dashboard({ user }: { user: UserData | null }) {

  if (!user) {
    return <div className="flex items-center justify-center h-full">Caricamento...</div>;
  }

  if (user.role === 'admin') {
    return <AdminDashboard user={user} />;
  }

  return <OperatorDashboard user={user} />;
}
