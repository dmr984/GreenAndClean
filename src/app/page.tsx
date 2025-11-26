'use client';
import Image from 'next/image';
import LoginForm from '@/components/login-form';
import { useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDocs, query, collection, where, setDoc } from 'firebase/firestore';

export default function LoginPage() {
  const firestore = useFirestore();

  // Effect to ensure default admin exists
  useEffect(() => {
    if (!firestore) return;
    
    const checkAndCreateAdmin = async () => {
        try {
            // Check if an admin user already exists by username
            const docSnap = await getDocs(query(collection(firestore, 'app-users'), where('username', '==', 'admin')));

            if (docSnap.empty) {
                 // If no admin user, create one with a known ID for consistency
                 const adminId = "admin_user_default_id";
                 const adminDocRef = doc(firestore, 'app-users', adminId);
                 const adminData = {
                    username: "admin",
                    role: "admin" as const,
                    firstName: "Admin",
                    lastName: "User",
                    workSchedule: {},
                };
                await setDoc(adminDocRef, adminData, { merge: true });
            }
        } catch (error) {
            console.error("Error ensuring admin user exists:", error);
        }
    };
    
    checkAndCreateAdmin();

  }, [firestore]);


  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 text-center">
          <Image 
            src="https://i.ibb.co/cKq6nWLR/1762432288621.png"
            alt="Serveco Logo" 
            width={40} 
            height={40} 
            className="h-10 w-10 mx-auto rounded-full"
          />
          <h1 className="text-3xl font-bold font-headline tracking-wider uppercase">Serveco Cleaning</h1>
          <p className="text-balance text-muted-foreground">
            Inserisci il tuo codice operatore per accedere.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
