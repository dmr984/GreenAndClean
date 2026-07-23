import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '../src/firebase/config';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function listUsers() {
  console.log('Querying app-users collection in project:', firebaseConfig.projectId);
  try {
    const querySnapshot = await getDocs(collection(db, 'app-users'));
    console.log(`Found ${querySnapshot.size} documents:`);
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`ID: ${doc.id} | Name: ${data.firstName || ''} ${data.lastName || ''} | Username: ${data.username || ''}`);
    });
  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

listUsers();
