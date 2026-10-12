/*
 * ATBUBusTransportSystem Service Worker
 *
 * Caching policy:
 *  - Static assets (css/js/images/fonts/manifest): cache-first with background refresh.
 *  - HTML navigations: network-first, cached copy as offline fallback.
 *  - API responses (/api/): NEVER cached. Booking, payment, ticket and verification
 *    data must always come from the live server so users never see stale or
 *    unconfirmed transaction states. Offline API calls fail fast in the app.
 */

const VERSION = 'v4';
const STATIC_CACHE = `atbu-static-${VERSION}`;
const PAGE_CACHE = `atbu-pages-${VERSION}`;
const API_CACHE = `atbu-api-${VERSION}`; // intentionally kept empty; reserved to block old API caches

const STATIC_ASSETS = [
  '/css/style.css',
  '/js/auth.js',
  '/js/pwa.js',
  '/manifest.json',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/maskable-512.png',
  '/images/apple-touch-icon.png',
  '/images/school_logo.jpg'
];

const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
      const pageCache = await caches.open(PAGE_CACHE);
      await pageCache.add(new Request(OFFLINE_PAGE, { cache: 'reload' })).catch(() => {});
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.json'
  );
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_PAGE);
    if (offline) return offline;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Refresh in the background; serve the cached copy immediately.
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
        }
      })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: always live network. Never serve cached booking/payment/ticket data.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Page navigations: network-first with offline fallback.
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  // Static assets: cache-first with background refresh.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Anything else: try network, fall back to cache.
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw new Error('offline');
    })
  );
});
