// v3 — bumped so the activate handler purges the v2 cache, which could still hold a stale
// index.html from before documents were excluded from caching (see the fetch handler below).
const CACHE_NAME = 'panda-patches-v3';

// Install — skip waiting immediately so new SW activates right away
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate — delete all old caches so stale assets never get served
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first for EVERYTHING
// Cache is only used as a fallback when the user is offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and browser-extension / chrome-extension URLs
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // Skip third-party requests (Supabase, ZeptoMail, Vercel analytics, etc.)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // NEVER cache or serve the HTML document. index.html points at content-hashed entry chunks
  // (/assets/index-<hash>.js), so a stale copy references files that no longer exist after a
  // deploy — no JS runs at all and the user gets a blank screen, which the React error boundary
  // cannot catch because it never mounts. Let the browser fetch the document normally; the
  // hashed assets below are still cached for offline use.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful same-origin responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback — serve from cache if available
        return caches.match(event.request);
      })
  );
});

// Listen for manual update trigger from the app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
