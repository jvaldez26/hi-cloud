/**
 * HiCloud ERP — Service Worker
 *
 * CACHE_NAME incluye __BUILD_DATE__ que vite.config.ts reemplaza en cada build.
 * Esto fuerza al navegador a detectar un SW nuevo en cada deploy
 * y descartar los caches viejos automáticamente.
 *
 * Estrategia de caching:
 *   - navigate (HTML)          → SIEMPRE red   (nunca devuelve HTML viejo)
 *   - assets con hash (JS/CSS) → cache-first   (hash garantiza unicidad)
 *   - API /api/*               → red-first     (datos siempre frescos)
 *   - resto                    → red-first     (por defecto seguro)
 */

const CACHE_NAME = 'hicloud-__BUILD_DATE__';
const API_PREFIX = '/api/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(['/manifest.json'])),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then(clients =>
          clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })),
        ),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(networkFirstAPI(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then(r => r || caches.match('/')),
      ),
    );
    return;
  }

  if (/\/assets\/[^/]+-[a-f0-9]{8,}\.[^/]+$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request)),
  );
});

async function networkFirstAPI(request) {
  try {
    const response = await fetch(request.clone());
    if (request.method === 'GET' && response.ok) {
      const url = new URL(request.url);
      const cacheable = ['/productos', '/clientes', '/vendedores', '/configuracion'];
      if (cacheable.some(p => url.pathname.includes(p))) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.method === 'POST') {
      return new Response(
        JSON.stringify({ offline: true, message: 'Sin conexión — venta guardada localmente' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('Sin conexión', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Sin conexión', { status: 503 });
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pos-sales') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SYNC_POS_SALES' })),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'HiCloud ERP', {
      body: data.body || '', icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png', data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => c.url === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
