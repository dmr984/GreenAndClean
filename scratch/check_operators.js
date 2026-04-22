import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "dummy",
    authDomain: "dummy",
    projectId: "greenandclean-376518",
    storageBucket: "dummy",
    messagingSenderId: "dummy",
    appId: "dummy"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
    const q = query(collection(db, 'app-users'), where('role', '==', 'operator'), limit(5));
    const snap = await getDocs(q);
    snap.docs.forEach(doc => {
        console.log(doc.id, Object.keys(doc.data()), doc.data().createdAt);
    });
}
check();
