'use client';

import React from 'react';
import { OperatorDashboard } from './operator-dashboard';


export default function Dashboard() {
  // This page now simply renders the correct dashboard based on role.
  // The Admin dashboard is handled in the layout, this is for Operator.
  return <OperatorDashboard />;
}
