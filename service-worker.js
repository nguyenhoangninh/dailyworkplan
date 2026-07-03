const CACHE_NAME = 'master-work-plan-v1';
const RUNTIME_CACHE = 'master-work-plan-runtime';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// Install event - cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Service Worker: Caching assets');
      // Cache critical assets, but don't fail if some are unavailable
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url))
      ).then(() => {
        console.log('Service Worker: Cache complete');
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // For HTML requests
  if (request.method === 'GET' && request.headers.get('accept')?.includes('text/html')) {
    return event.respondWith(
      fetch(request)
        .then(response => {
          if (response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(request) || caches.match('./index.html'))
    );
  }

  // For CSS, JS, images - cache first, network second
  if (request.method === 'GET') {
    return event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) return response;
          
          // Try network and cache successful responses
          return fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                const cloned = networkResponse.clone();
                caches.open(RUNTIME_CACHE).then(c => c.put(request, cloned));
              }
              return networkResponse;
            });
        })
        .catch(() => {
          // Offline fallback
          if (request.destination === 'image') {
            return new Response('', { status: 404 });
          }
          return caches.match('./index.html');
        })
    );
  }

  // For other requests (POST, etc), go straight to network
  event.respondWith(fetch(request).catch(() => {
    return new Response('Offline', { status: 503 });
  }));
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-tasks') {
    event.waitUntil(
      // Sync pending tasks when back online
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_TASKS',
            message: 'Ready to sync offline changes'
          });
        });
      })
    );
  }
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notifications (for future use)
self.addEventListener('push', event => {
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: '/icon-192.svg',
      badge: '/badge-72.svg',
      tag: 'work-plan-notification',
      requireInteraction: false
    };
    event.waitUntil(
      self.registration.showNotification('Master Work Plan', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if available
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if not available
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
