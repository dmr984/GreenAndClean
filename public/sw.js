// --- IndexedDB per la gestione dei dati utente ---
const DB_NAME = 'user-db';
const STORE_NAME = 'user-store';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject("Errore nell'apertura del DB");
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

async function setUserData(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ key: 'currentUser', ...data });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("Impossibile salvare i dati utente");
  });
}

async function getUserData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('currentUser');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("Impossibile leggere i dati utente");
  });
}


// --- Eventi del Service Worker ---

self.addEventListener('install', (event) => {
  console.log('Service Worker: installato.');
  self.skipWaiting(); // Forza l'attivazione immediata del nuovo SW
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: attivato.');
  // Prende il controllo immediato della pagina
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('Service Worker: Push ricevuto.');

  if (!event.data) {
    console.error('Push event ma nessun dato.');
    return;
  }

  const pushData = event.data.json();
  
  const title = pushData.title || 'Nuova Notifica';
  const options = {
    body: pushData.body || '',
    icon: pushData.icon || '/icon-192x192.png',
    data: pushData.data || {}
  };

  const notificationPromise = getUserData().then(user => {
      if (!user) {
          // Se non c'è utente, mostra solo notifiche generiche (senza role/userId)
          if (!pushData.role && !pushData.userId) {
              return self.registration.showNotification(title, options);
          }
          console.log('Nessun utente loggato, notifica ignorata:', pushData);
          return Promise.resolve();
      }

      // Controlla se la notifica è per un ruolo specifico
      if (pushData.role) {
          if (user.role === pushData.role) {
              return self.registration.showNotification(title, options);
          } else {
              console.log(`Notifica per ruolo ${pushData.role} ignorata, l'utente è ${user.role}`);
              return Promise.resolve();
          }
      }

      // Controlla se la notifica è per un utente specifico
      if (pushData.userId) {
          if (user.id === pushData.userId) {
              return self.registration.showNotification(title, options);
          } else {
              console.log(`Notifica per utente ${pushData.userId} ignorata, l'utente è ${user.id}`);
              return Promise.resolve();
          }
      }
      
      // Notifica generica, mostrata a tutti gli utenti loggati
      return self.registration.showNotification(title, options);

  }).catch(err => {
      console.error("Errore nel mostrare la notifica:", err);
      // Fallback per mostrare la notifica se il DB fallisce
      return self.registration.showNotification(title, options);
  });

  event.waitUntil(notificationPromise);
});


self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notifica cliccata.');
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus().then(c => c.navigate(urlToOpen));
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});


// Ascolta i messaggi dalla pagina per impostare l'utente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_USER') {
    console.log('Service Worker: Ricevuto utente dalla pagina:', event.data.user);
    event.waitUntil(setUserData(event.data.user));
  }
});
