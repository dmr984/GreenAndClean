'use client';
import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

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
  logout: () => void;
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
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleForceLogout = useCallback((message: string) => {
    try {
      sessionStorage.setItem('code_changed_logout', message);
    } catch (e) {
      console.error("Failed to set sessionStorage", e);
    }
    localStorage.removeItem('user');
    sendUserToServiceWorker(null);
    setUser(null);
    setIsLoading(false);
    toast({
      variant: "destructive",
      title: "Accesso scaduto",
      description: message,
      duration: 8000,
    });
    router.replace('/');
  }, [router, toast]);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem('code_changed_logout');
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('user');
    sendUserToServiceWorker(null);
    setUser(null);
    setIsLoading(false);
    router.replace('/');
  }, [router]);

  useEffect(() => {
    let initialUser: User | null = null;
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        initialUser = JSON.parse(storedUser);
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem('user');
    }

    if (!initialUser || !initialUser.id) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setUser(initialUser);

    if ('serviceWorker' in navigator && navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then(() => {
        sendUserToServiceWorker(initialUser);
      });
    }

    if (!firestore) {
      setIsLoading(false);
      return;
    }

    // Monitor the user document in Firestore in real time
    const userDocRef = doc(firestore, 'app-users', initialUser.id);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      setIsLoading(false);

      if (!docSnap.exists()) {
        console.warn("User document deleted from Firestore, forcing logout.");
        handleForceLogout("Il tuo account non è più attivo. Effettua l'accesso o contatta l'amministratore.");
        return;
      }

      const data = docSnap.data();
      const serverUsername = data?.username;

      // Read currently stored user from localStorage
      let currentLocalUser: User = initialUser!;
      try {
        const currentRaw = localStorage.getItem('user');
        if (currentRaw) {
          currentLocalUser = JSON.parse(currentRaw);
        }
      } catch (err) {
        // fallback
      }

      // If the administrator changed the operator code (username), force operator to log in again
      if (
        serverUsername &&
        currentLocalUser?.username &&
        serverUsername.trim() !== currentLocalUser.username.trim()
      ) {
        console.warn(
          "Operator code was changed on server from",
          currentLocalUser.username,
          "to",
          serverUsername
        );
        handleForceLogout(
          "Il tuo codice operatore è stato modificato dall'amministratore. Effettua nuovamente l'accesso con il nuovo codice."
        );
        return;
      }

      // Keep user state in sync if other info changed (firstName, lastName, role)
      if (
        data.firstName !== currentLocalUser.firstName ||
        data.lastName !== currentLocalUser.lastName ||
        data.role !== currentLocalUser.role
      ) {
        const updatedUser: User = {
          ...currentLocalUser,
          firstName: data.firstName ?? currentLocalUser.firstName,
          lastName: data.lastName ?? currentLocalUser.lastName,
          role: data.role ?? currentLocalUser.role,
        };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        sendUserToServiceWorker(updatedUser);
      }
    }, (error) => {
      console.error("Error listening to user document in UserProvider:", error);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [firestore, handleForceLogout]);

  // Gatekeeper routing logic
  useEffect(() => {
    if (isLoading) return;

    if (!user && !pathname.startsWith('/_next') && pathname !== '/') {
      router.replace('/');
    }

    if (user && pathname === '/') {
      router.replace('/dashboard');
    }
  }, [user, isLoading, pathname, router]);

  // Sync across browser tabs
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'user') {
        if (!event.newValue) {
          setUser(null);
          router.replace('/');
        } else {
          try {
            setUser(JSON.parse(event.newValue));
          } catch {
            setUser(null);
            router.replace('/');
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [router]);

  return (
    <UserContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </UserContext.Provider>
  );
};
