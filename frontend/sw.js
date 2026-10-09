const CACHE_NAME = 'atbu-shuttle-v2';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/register',
  '/dashboard',
  '/trips',
  '/booking',
  '/bookings',
  '/css/style.css',
  '/js/auth.js',
  '/manifest.json',
  '/images/icon-192.svg',
  '/images/icon-512.svg'
];

const API_CACHE = 'atbu-shuttle-api-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((response) => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetched;
    })
  );
});
