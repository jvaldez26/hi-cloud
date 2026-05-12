/**
 * HiCloud ERP — Service Worker v1.0
 * Estrategia: Cache-first para assets, Network-first para API, Offline queue para POS
 */

const CACHE_NAME   = 'hicloud-v1';
const API_PREFIX   = '/api/';
const OFFLINE_PAGE = '/offline.html';

// Assets del app shell que se cachean al instalar
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

// ── Instalación ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activación — limpiar caches viejos ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// ── Fetch — estrategia mixta ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first con fallback a cache
  if (url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(networkFirstAPI(request));
    return;
  }

  // Assets estáticos: cache-first
  if (request.method === 'GET') {
    event.respondWith(cacheFirst(request));
    return;
  }
});

async function networkFirstAPI(request) {
  try {
    const response = await fetch(request.clone());
    // Cachear GET de endpoints de catálogo (productos, clientes) para offline
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
    // Offline: devolver desde cache si existe
    const cached = await caches.match(request);
    if (cached) return cached;
    // Para POST (ventas POS): devolver indicador de offline
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

// ── Background Sync — sincronizar ventas offline ─────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pos-sales') {
    event.waitUntil(syncPendingSales());
  }
});

async function syncPendingSales() {
  // Notificar a todos los clientes para que inicien la sincronización
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'SYNC_POS_SALES' }));
}

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'HiCloud ERP', {
      body:    data.body || '',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      data:    { url: data.url || '/' },
      actions: data.actions || [],
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
