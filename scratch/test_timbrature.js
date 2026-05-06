const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function runTest() {
    console.log("--- Inizio Test ---");
    const usersSnap = await db.collection('app-users').get();
    let fabioId = null;
    usersSnap.forEach(doc => {
        const data = doc.data();
        if (data.firstName === 'Fabio' && data.lastName === 'Sessa') {
            fabioId = doc.id;
        }
    });

    if (!fabioId) {
        console.log('Fabio non trovato');
        return;
    }

    console.log(`Operatore di test trovato: Fabio (ID: ${fabioId})`);
    
    const timbratureRef = db.collection(`app-users/${fabioId}/timbrature`);

    // 1. Pulisci timbrature vecchie di test (sospese automatiche)
    const oldSnap = await timbratureRef.where('status', '==', 'sospesa').where('isAuto', '==', true).get();
    for (const doc of oldSnap.docs) {
        await doc.ref.delete();
    }
    console.log("Pulite eventuali timbrature automatiche precedenti.");

    // 2. Crea un'entrata per ieri
    const ieri = new Date();
    ieri.setDate(ieri.getDate() - 1);
    ieri.setHours(14, 0, 0, 0); // Ieri alle 14:00

    const shiftId = "test_shift_" + Date.now();
    await timbratureRef.add({
        userId: fabioId,
        type: 'entrata',
        timestamp: Timestamp.fromDate(ieri),
        status: 'confermata',
        latitude: 0,
        longitude: 0,
        viewedByOperator: true,
        shiftId: shiftId
    });
    console.log("Simulata entrata per ieri alle 14:00 senza uscita.");

    // 3. Simula l'esecuzione del frontend (checkAndVoidOpenShifts)
    const oggiInizio = new Date();
    oggiInizio.setHours(0, 0, 0, 0);

    const q = timbratureRef.where('timestamp', '<', Timestamp.fromDate(oggiInizio))
                           .orderBy('timestamp', 'desc')
                           .limit(1);
                           
    const snapshot = await q.get();
    if (!snapshot.empty) {
        const lastEvent = snapshot.docs[0].data();
        if (lastEvent.type !== 'uscita') {
            console.log("Rilevato turno non chiuso di ieri!");
            
            const eventDate = lastEvent.timestamp.toDate();
            const endOfEventDay = new Date(eventDate);
            endOfEventDay.setHours(23, 59, 59, 999);

            const voidClockOut = {
                userId: fabioId,
                type: 'uscita',
                timestamp: Timestamp.fromDate(endOfEventDay),
                latitude: 0,
                longitude: 0,
                status: 'sospesa',
                viewedByOperator: false,
                shiftId: lastEvent.shiftId,
                isAuto: true,
            };
            
            await timbratureRef.add(voidClockOut);
            console.log("Aggiunta uscita automatica annullata (23:59:59).");
        }
    }

    // 4. Simula il fetch dei pending (pendingVoidedShifts)
    const pendingSnap = await timbratureRef.where('status', '==', 'sospesa').where('isAuto', '==', true).get();
    console.log(`Trovate ${pendingSnap.size} timbrature in sospeso per l'operatore.`);
    
    if (!pendingSnap.empty) {
        const voided = pendingSnap.docs[0];
        console.log(`Stato iniziale: viewedByOperator=${voided.data().viewedByOperator}, suggestedTime=${voided.data().suggestedTime}`);
        
        // Simula l'inserimento dell'orario da parte dell'operatore
        await voided.ref.update({
            viewedByOperator: true,
            suggestedTime: "18:30"
        });
        console.log("Operatore ha inserito l'orario 18:30 e inviato.");

        // Rieffettua la query per vedere lo stato
        const updatedSnap = await voided.ref.get();
        const data = updatedSnap.data();
        console.log(`Stato aggiornato: viewedByOperator=${data.viewedByOperator}, suggestedTime=${data.suggestedTime}, isAuto=${data.isAuto}`);
        
        const isPendingAdmin = data.viewedByOperator && data.suggestedTime;
        console.log(`Nella UI dell'operatore, isPendingAdmin è: ${isPendingAdmin ? 'VERO (mostra messaggio in sovrimpressione)' : 'FALSO'}`);
        
        // Simula l'accettazione dell'admin
        await voided.ref.update({
            status: 'confermata',
            isAuto: false // L'admin rimuove il flag o lo conferma
        });
        console.log("L'amministratore ha approvato l'orario.");

        // Verifica finale
        const finalSnap = await timbratureRef.where('status', '==', 'sospesa').where('isAuto', '==', true).get();
        console.log(`Trovate ${finalSnap.size} timbrature in sospeso. L'avviso nella UI scompare.`);
    }

    console.log("--- Fine Test ---");
}

runTest();
