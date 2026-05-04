const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../../serviceAccountKey.json'); // Replace with correct path if needed

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function checkOverrides() {
    const usersSnap = await db.collection('app-users').get();
    let fabioId = null;
    usersSnap.forEach(doc => {
        const data = doc.data();
        if (data.firstName === 'Fabio' && data.lastName === 'Sessa') {
            fabioId = doc.id;
        }
    });

    if (fabioId) {
        console.log(`Fabio ID: ${fabioId}`);
        const overrideDoc = await db.collection(`app-users/${fabioId}/monthly-overrides`).doc('2026-04').get();
        console.log('Overrides:', overrideDoc.data());
    } else {
        console.log('Fabio not found');
    }
}

checkOverrides();
