/**
 * Service Worker — Sorteo de Cadena PWA
 * Estrategia: Cache-first para assets estáticos, Network-first para la app GAS.
 */

const CACHE_NAME    = 'cadena-pwa-v1';
const GAS_URL       = 'https://script.google.com';

// Assets propios del wrapper que sí podemos cachear
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png'
];

/* ───── INSTALL ───── */
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando v1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cachear assets uno a uno para no fallar si alguno no existe aún
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
        )
      );
    }).then(() => {
      console.log('[SW] Assets cacheados.');
      return self.skipWaiting(); // Activar inmediatamente
    })
  );
});

/* ───── ACTIVATE ───── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList
          .filter(key => key !== CACHE_NAME) // Borrar caches viejos
          .map(key => {
            console.log('[SW] Borrando cache viejo:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim()) // Tomar control inmediato
  );
});

/* ───── FETCH ───── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ── Requests a Google Apps Script: SIEMPRE red (no se puede cachear)
  if (url.origin.includes('script.google.com') ||
      url.origin.includes('google.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si falla (offline), devolver página de error offline
        return caches.match('/index.html');
      })
    );
    return;
  }

  // ── Assets propios: Cache-first, fallback a red
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Actualizar en background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {}); // Silenciar error en background

        return cachedResponse; // Devolver cache inmediatamente
      }

      // No está en cache: ir a red
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 &&
            event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback final
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ───── MENSAJE desde la app ───── */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
