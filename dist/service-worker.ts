// src/service-worker.ts
// ✅ UPGRADE 9: Service Worker for offline support + Image Optimization Caching

const CACHE_NAME = 'panda-patches-v2';
const IMAGE_CACHE_NAME = 'panda-patches-images-v1';
const RUNTIME_CACHE_NAME = 'panda-patches-runtime-v1';

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

  const url = event.request.url;

  // ✅ NEW: Handle image requests with aggressive caching
  if (url.includes('/storage/v1/object') || url.includes('supabase.co') && (url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.png') || url.endsWith('.gif') || url.endsWith('.webp'))) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }

        return fetch(event.request).then((response) => {
          // Cache successful image responses
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(IMAGE_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        }).catch(() => {
          // Return a placeholder if offline
          return new Response(
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"%3EOffline%3C/text%3E%3C/svg%3E',
            {
              status: 200,
              headers: { 'Content-Type': 'image/svg+xml' },
            }
          );
        });
      })
    );
    return;
  }

  // Skip API calls - always go to network but cache successful responses
  if (url.includes('/rest/v1/') || url.includes('supabase.co/functions')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful API responses
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Return offline response for failed API calls
          return caches.match(event.request).then((response) => {
            if (response) {
              return response;
            }
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
          });
        })
    );
    return;
  }

  // For regular assets, use cache-first strategy
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(event.request).then((response) => {
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
      });
    })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          const validCaches = [CACHE_NAME, IMAGE_CACHE_NAME, RUNTIME_CACHE_NAME];
          if (!validCaches.includes(cacheName)) {
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
  
  // ✅ NEW: Handle cache clearing from app
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(IMAGE_CACHE_NAME).then(() => {
      console.log('[Service Worker] Image cache cleared');
    });
  }
});
