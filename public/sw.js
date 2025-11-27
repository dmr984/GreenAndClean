// This is a basic service worker for PWA functionality.

// The version of the cache.
const CACHE_VERSION = 1;
const CACHE_NAME = `serveco-cache-v${CACHE_VERSION}`;

// The URLs to cache when the service worker is installed.
const urlsToCache = [
  '/',
  '/dashboard',
  '/manifest.json',
  // Add other important assets here, like CSS, JS, and key images.
];

// Install the service worker and cache the assets.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate the service worker and clean up old caches.
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});


// Intercept fetch requests and serve from cache if available.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request to use it in the cache and for the network request.
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});


// Listen for push notifications.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Serveco Green & Clean', body: 'Hai una nuova notifica.' };
  
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png', // Main app icon
    badge: '/icons/icon-192x192.png', // Icon for the notification bar
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Focus the client if it's already open.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
