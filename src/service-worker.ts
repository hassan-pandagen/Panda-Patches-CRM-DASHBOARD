// src/service-worker.ts

const CACHE_NAME = 'panda-crm-prod-v3'; // ✅ Bumped to v3 to clear previous errors
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// 1. INSTALL
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  (self as any).skipWaiting();
});

// 2. ACTIVATE (Clear old caches)
self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  (self as any).clients.claim();
});

// 3. FETCH
self.addEventListener('fetch', (event: any) => {
  const request = event.request;
  const url = new URL(request.url);

  // 🛑 SAFETY: Ignore non-http (chrome-extension://, etc)
  if (!url.protocol.startsWith('http')) return;

  // 🛑 SAFETY: Ignore API calls (Supabase)
  if (url.pathname.includes('/rest/v1/') || url.hostname.includes('supabase')) return;

  //  SAFETY: Only cache GET requests
  if (request.method !== 'GET') return;

  // ✅ STRATEGY 1: HTML/Navigation -> NETWORK FIRST
  // This fixes the "MIME type" error by ensuring we always get the latest index.html
  // which contains the correct links to the new JS files.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match('/index.html');
        })
    );
    return;
  }

  // ✅ STRATEGY 2: Assets (JS/CSS/Images) -> STALE-WHILE-REVALIDATE
  // Serve fast from cache, update in background
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        // Validation: Don't cache bad responses
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('message', (event: any) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    (self as any).skipWaiting();
  }
});