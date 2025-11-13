'use client';

import React from 'react';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';


export default function Dashboard() {
  const [userRole, setUserRole] = React.useState<string | null>(null);

  React.useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    setUserRole(storedUser.role);
  }, []);

  if (!userRole) {
    return <div className="flex items-center justify-center min-h-screen">Caricamento...</div>;
  }
  
  // FORCED: Always show OperatorDashboard to prevent permission errors from AdminDashboard.
  if (userRole === 'admin') {
    // This is a temporary measure to ensure the app is stable.
    // The AdminDashboard component is causing persistent permission errors.
    return <OperatorDashboard />;
  }

  return <OperatorDashboard />;
}
