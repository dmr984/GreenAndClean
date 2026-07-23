const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "studio-9716245358-f94b8"
  });
}

const db = admin.firestore();

async function listUsers() {
  console.log('Querying app-users from:', db.projectId || 'studio-9716245358-f94b8');
  try {
    const snapshot = await db.collection('app-users').get();
    console.log(`Found ${snapshot.size} users:`);
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id} | Name: ${data.firstName || ''} ${data.lastName || ''} | Username: ${data.username || ''}`);
    });
  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

listUsers();
