// self è il Service Worker stesso
const self = this;

// Nome univoco per la cache, che cambia ad ogni build
const CACHE_NAME = `serveco-cache-v${new Date().getTime()}`;

// Evento di installazione: il Service Worker viene installato
self.addEventListener("install", (event) => {
  // Forza il nuovo Service Worker a diventare attivo immediatamente,
  // senza attendere che il vecchio Service Worker venga deregistrato.
  event.waitUntil(self.skipWaiting());
});

// Evento di attivazione: il nuovo Service Worker prende il controllo
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Prendi il controllo di tutte le pagine/client aperti senza doverli ricaricare.
      // Questo assicura che il nuovo SW gestisca le richieste subito.
      await self.clients.claim();

      // Rimuovi le vecchie cache per fare pulizia e liberare spazio.
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })()
  );
});

// Evento di fetch: intercetta tutte le richieste di rete
self.addEventListener("fetch", (event) => {
  // Per le richieste di navigazione (pagine HTML), usa una strategia "network first".
  // Questo garantisce che l'utente ottenga sempre la versione più recente della pagina se online.
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Prova prima a ottenere la risorsa dalla rete.
          const networkResponse = await fetch(event.request);
          // Se la richiesta ha successo, clona la risposta e mettila in cache.
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          // Se la rete fallisce (offline), prova a servire dalla cache.
          const cachedResponse = await caches.match(event.request);
          return cachedResponse;
        }
      })()
    );
    return;
  }

  // Per tutte le altre richieste (CSS, JS, immagini), usa una strategia "cache first".
  // Questo rende l'app veloce e funzionante offline.
  event.respondWith(
    (async () => {
      // Prova a trovare la risorsa nella cache.
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse; // Se trovata, restituiscila subito.
      }

      // Se non è in cache, vai alla rete.
      const networkResponse = await fetch(event.request);
      // Metti la nuova risorsa in cache per le prossime volte.
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, networkResponse.clone());
      return networkResponse;
    })()
  );
});
