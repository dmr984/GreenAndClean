const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "studio-9716245358-f94b8"
    });
}

const db = admin.firestore();
const operatorId = 'TzfQ87SIB7dwvbNIx9SC';

async function run() {
    const doc = await db.doc(`app-users/${operatorId}`).get();
    console.log(JSON.stringify(doc.data(), null, 2));
}

run().catch(console.error);
