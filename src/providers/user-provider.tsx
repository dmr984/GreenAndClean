'use client';
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

type User = {
  id: string;
  username: string;
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
  const router = useRouter(); // Using router for potential redirects

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        // Invia i dati utente al SW quando l'app si carica
        if (navigator.serviceWorker.ready) {
           navigator.serviceWorker.ready.then(() => {
              sendUserToServiceWorker(parsedUser);
           });
        }
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem('user'); // Clear corrupted data
    } finally {
      setIsLoading(false);
    }

    // Optional: Listen for storage changes to sync across tabs
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'user') {
        setIsLoading(true);
        const storedUser = event.newValue;
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
           if (navigator.serviceWorker.ready) {
             navigator.serviceWorker.ready.then(() => {
                sendUserToServiceWorker(parsedUser);
             });
           }
        } else {
          setUser(null);
           if (navigator.serviceWorker.ready) {
             navigator.serviceWorker.ready.then(() => {
                sendUserToServiceWorker(null);
             });
           }
        }
        setIsLoading(false);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <UserContext.Provider value={{ user, isLoading }}>
      {children}
    </UserContext.Provider>
  );
};
