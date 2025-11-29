'use client';
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type User = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'operator';
};

interface UserContextType {
  user: User | null;
  isLoading: boolean;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

// Funzione per inviare i dati dell'utente al Service Worker
function sendUserToServiceWorker(user: User | null) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_USER',
      user: user,
    });
  }
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUser = () => {
      let userFound = null;
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          userFound = JSON.parse(storedUser);
          setUser(userFound);
          if (navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(() => {
              sendUserToServiceWorker(userFound);
            });
          }
        }
      } catch (error) {
        console.error("Failed to parse user from localStorage", error);
        localStorage.removeItem('user');
      } finally {
        setIsLoading(false);
      }
      
      // Gatekeeper logic
      // If loading is finished and no user is found, redirect to login page,
      // but only if we are not already on the login page.
      if (!userFound && !pathname.startsWith('/_next') && pathname !== '/') {
          router.replace('/');
      }
       // If a user IS found, but they are on the login page, redirect to dashboard.
      if (userFound && pathname === '/') {
        router.replace('/dashboard');
      }
    };

    checkUser();

    // Optional: Listen for storage changes to sync across tabs
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'user') {
        window.location.reload(); // Simplest way to re-evaluate auth state across tabs
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pathname, router]);

  return (
    <UserContext.Provider value={{ user, isLoading }}>
      {children}
    </UserContext.Provider>
  );
};
