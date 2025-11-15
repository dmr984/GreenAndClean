'use client';
import { useContext } from 'react';
import { UserContext } from '@/providers/user-provider';

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
