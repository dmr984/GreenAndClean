'use client';

import React from 'react';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';


type UserData = {
  id: string;
  username: string;
  role: 'admin' | 'operator';
};

// The user prop is passed down from DashboardLayout
export default function Dashboard({ user }: { user: UserData | null }) {

  if (user?.role === 'admin') {
    return <AdminDashboard user={user} />;
  }
  
  if (user?.role === 'operator') {
    return <OperatorDashboard user={user} />;
  }

  // Fallback or loading state is handled by the layout
  return null;
}
