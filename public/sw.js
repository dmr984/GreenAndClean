// --- IndexedDB per la gestione dei dati utente ---
const DB_NAME = 'user-db';
const STORE_NAME = 'user-store';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject("Errore nell'apertura del DB");
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
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

  let pushData = {};
  if (event.data) {
    try {
      pushData = event.data.json();
    } catch (e) {
      pushData = { title: 'Notifica Turno', body: event.data.text() };
    }
  }

  const title = pushData.title || 'Nuova Notifica';
  const options = {
    body: pushData.body || '',
    icon: pushData.icon || 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
    badge: pushData.badge || 'https://i.postimg.cc/GhwM2hg1/1764199658760.png',
    vibrate: [200, 100, 200],
    data: pushData.data || { url: '/dashboard' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
