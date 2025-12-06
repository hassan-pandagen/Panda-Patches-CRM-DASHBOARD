// src/service-worker.ts
// ✅ UPGRADE 9: Service Worker for offline support

const CACHE_NAME = 'panda-patches-v1';
const urlsToCache = [
  '/',
  '/index.html',
];

// Install event: cache assets
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Opened cache');
      return cache.addAll(urlsToCache).catch((error) => {
        console.log('[Service Worker] Cache addAll error:', error);
        // Don't fail installation if caching fails
      });
    })
  );
  // Skip waiting - activate immediately
  (self as any).skipWaiting();
});

// Fetch event: serve from cache, fallback to network
self.addEventListener('fetch', (event: any) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API calls - always go to network
  if (event.request.url.includes('/rest/v1/') || event.request.url.includes('supabase')) {
    event.respondWith(
      (async () => {
        try {
          // ✅ DAY 2 FIX: Add timeout to API fetch calls (30 seconds)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          try {
            const response = await fetch(event.request, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
          } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            throw fetchErr;
          }
        } catch (err) {
          // Return offline response for failed API calls
          return new Response(
            JSON.stringify({ error: 'offline' }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'application/json',
              }),
            }
          );
        }
      })()
    );
    return;
  }

  // For regular assets, use cache-first strategy
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }

      return (async () => {
        try {
          // ✅ DAY 2 FIX: Add timeout to asset fetch (20 seconds)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);

          try {
            const response = await fetch(event.request, { signal: controller.signal });
            clearTimeout(timeoutId);

            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });

            return response;
          } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            throw fetchErr;
          }
        } catch (err) {
          // Fallback to offline page if asset fetch fails
          return caches.match('/index.html') || new Response('Offline');
        }
      })();
    })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Claim clients immediately
  (self as any).clients.claim();
});

// Handle messages from the main app
self.addEventListener('message', (event: any) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    (self as any).skipWaiting();
  }
});
