// src/service-worker.ts

const CACHE_NAME = 'panda-crm-v2'; // Bumped version to force refresh
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 1. INSTALL: Cache basic static assets
self.addEventListener('install', (event: any) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Force this SW to become the active one immediately
  (self as any).skipWaiting();
});

// 2. ACTIVATE: Clean up old caches
self.addEventListener('activate', (event: any) => {
  console.log('[Service Worker] Activating...');
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
  // Take control of all open tabs immediately
  (self as any).clients.claim();
});

// 3. FETCH: The smart logic
self.addEventListener('fetch', (event: any) => {
  const request = event.request;
  const url = new URL(request.url);

  // 🛑 CRITICAL FIX: Ignore chrome-extensions, basic auth, and non-http schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 🛑 Ignore POST/PUT/DELETE requests (never cache these)
  if (request.method !== 'GET') {
    return;
  }

  // 🔄 API STRATEGY: Network Only (with Offline Fallback)
  // We NEVER cache Supabase API responses because CRM data changes constantly.
  if (url.pathname.includes('/rest/v1/') || url.hostname.includes('supabase')) {
    event.respondWith(
      fetch(request).catch(() => {
        // If network fails, return a JSON error
        return new Response(
            JSON.stringify({ error: 'offline_mode', message: 'You are currently offline.' }),
            { 
              status: 503, 
              headers: { 'Content-Type': 'application/json' } 
            }
        );
      })
    );
    return;
  }

  // 🖼️ ASSET STRATEGY: Stale-While-Revalidate
  // Serve from cache immediately, but update cache in background
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        // Check if valid response
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      });

      // Return cached response if found, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. MESSAGE: Handle skip waiting manually if needed
self.addEventListener('message', (event: any) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    (self as any).skipWaiting();
  }
});