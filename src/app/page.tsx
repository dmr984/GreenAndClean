'use client';
import Image from 'next/image';
import LoginForm from '@/components/login-form';
import { useEffect, useRef } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDocs, query, collection, where, setDoc } from 'firebase/firestore';

export default function LoginPage() {
  const firestore = useFirestore();
  const ranOnce = useRef(false);

  // Effect to ensure default admin exists
  useEffect(() => {
    if (!firestore || ranOnce.current) return;
    
    ranOnce.current = true;
    const checkAndCreateAdmin = async () => {
        try {
            // Check if an admin user already exists by username "070380"
            const docSnap = await getDocs(query(collection(firestore, 'app-users'), where('username', '==', '070380')));

            if (docSnap.empty) {
                 // If no admin user, create one with a known ID for consistency
                 const adminId = "admin_user_default_id";
                 const adminDocRef = doc(firestore, 'app-users', adminId);
                 const adminData = {
                    username: "070380",
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
    
  }, []);


  return (
    <div className="flex items-start justify-center min-h-screen bg-background pt-16 sm:pt-24">
      <div className="mx-auto grid w-full max-w-md gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 text-center">
          <Image
            src="https://i.postimg.cc/CLXQbsxc/1764199275620.png"
            alt="Serveco Logo"
            width={240}
            height={240}
            className="h-60 w-60 mx-auto rounded-full"
            priority
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
