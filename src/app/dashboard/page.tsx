'use client';

import React from 'react';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';

export default function Dashboard() {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    // This check is to prevent errors during server-side rendering
    if (typeof window !== 'undefined') {
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const user = JSON.parse(storedUser);
          setUserRole(user.role);
        } else {
          // If no user, maybe redirect or handle as unauthenticated
          setUserRole(null);
        }
      } catch (e) {
        console.error("Failed to parse user from localStorage", e);
        setUserRole(null);
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Caricamento...</div>;
  }

  if (userRole === 'admin') {
    return <AdminDashboard />;
  }

  return <OperatorDashboard />;
}
