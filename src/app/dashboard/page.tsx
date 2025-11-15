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
  // The loading state is handled by the layout.
  // We just need to render the correct dashboard based on the user role.
  if (!user) {
    // This can happen briefly while the layout is loading the user.
    // Returning null prevents rendering anything until the user is available.
    return null;
  }

  if (user.role === 'admin') {
    return <AdminDashboard user={user} />;
  }
  
  if (user.role === 'operator') {
    return <OperatorDashboard user={user} />;
  }

  // Fallback case, though it shouldn't be reached with valid user roles
  return null;
}
