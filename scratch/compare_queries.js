const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "studio-9716245358-f94b8"
    });
}

const db = admin.firestore();
const operatorId = 'TzfQ87SIB7dwvbNIx9SC';

async function run() {
    console.log('--- Fetching all timbrature (ShiftsPage style) ---');
    const allSnap = await db.collection(`app-users/${operatorId}/timbrature`).get();
    console.log(`Total documents found: ${allSnap.size}`);

    console.log('\n--- Fetching ranged timbrature (EOMPage style) ---');
    const currentMonth = new Date('2026-06-01T00:00:00');
    // EOMPage date logic:
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    
    // queryStart = subMonths(monthStart, 1) -> May 1st
    const queryStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    // queryEnd = addMonths(monthEnd, 1) -> July 31st
    const queryEnd = new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 2, 0, 23, 59, 59, 999);

    console.log(`queryStart: ${queryStart.toISOString()}`);
    console.log(`queryEnd: ${queryEnd.toISOString()}`);

    const rangeSnap = await db.collection(`app-users/${operatorId}/timbrature`)
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(queryStart))
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(queryEnd))
        .get();
    console.log(`Range documents found: ${rangeSnap.size}`);

    const allIds = new Set(allSnap.docs.map(d => d.id));
    const rangeIds = new Set(rangeSnap.docs.map(d => d.id));

    const missingInRange = [];
    allSnap.docs.forEach(d => {
        if (!rangeIds.has(d.id)) {
            missingInRange.push({
                id: d.id,
                type: d.data().type,
                timestamp: d.data().timestamp.toDate().toISOString(),
                status: d.data().status
            });
        }
    });

    console.log(`\nMissing in range query: ${missingInRange.length}`);
    missingInRange.forEach(m => {
        console.log(`  Id: ${m.id} | Type: ${m.type} | Timestamp: ${m.timestamp} | Status: ${m.status}`);
    });
}

run().catch(console.error);
