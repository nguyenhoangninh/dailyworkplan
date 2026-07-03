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

// Fetch event - simpler approach
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip chrome extensions and non-http requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // For HTML requests - network first
  if (request.method === 'GET' && request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request) || caches.match('./index.html'))
    );
    return;
  }

  // For everything else - cache first, then network
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        
        return fetch(request)
          .then(response => {
            // Don't cache failed responses
            if (!response || response.status !== 200) {
              return response;
            }
            
            // Cache successful responses
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, responseClone))
              .catch(() => {}); // Silently fail if cache fails
            
            return response;
          })
          .catch(() => {
            // Return offline fallback
            if (request.destination === 'image') {
              return new Response('', { status: 404 });
            }
            return caches.match('./index.html');
          });
      })
      .catch(() => {
        // Fallback
        if (request.destination === 'image') {
          return new Response('', { status: 404 });
        }
        return caches.match('./index.html');
      })
  );
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
