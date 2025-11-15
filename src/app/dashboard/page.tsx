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
  // The loading state is now handled by the layout.
  // We just need to render the correct dashboard based on the user role.
  if (!user) {
    return null; // Or a fallback if the layout doesn't provide a user
  }

  if (user.role === 'admin') {
    return <AdminDashboard user={user} />;
  }
  
  if (user.role === 'operator') {
    return <OperatorDashboard user={user} />;
  }

  return null;
}
