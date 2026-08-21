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

/**
 * Destinos para los que el SW NUNCA debe fabricar una respuesta.
 *
 * Un 503 con `Content-Type: application/json` es la PEOR respuesta posible para
 * una petición de script: el navegador la recibe como éxito de red, intenta
 * parsear JSON como módulo ES, y el módulo no ejecuta. Cuando eso le pasa al
 * bundle principal, React nunca monta y el loader de index.html se queda fijo
 * para siempre — el "Cargando..." eterno que solo se arreglaba borrando los
 * datos del sitio.
 *
 * Dejando que el fallo sea un fallo de red REAL, cada capa hace su trabajo:
 * el navegador rechaza el import, vite:preloadError dispara la auto-recarga y,
 * si aun así no arranca, la red de seguridad de index.html da la salida.
 */
const SIN_RESPUESTA_FABRICADA = ['script', 'style', 'document', 'worker', 'sharedworker'];

function noFabricar(request) {
  // `destination` es '' en navegadores muy viejos: ahí caemos en la heurística
  // por extensión antes que arriesgarnos a fabricar un JSON para un .js.
  const d = request.destination;
  if (d) return SIN_RESPUESTA_FABRICADA.indexOf(d) !== -1;
  return /\.(js|mjs|css)(\?|$)/i.test(new URL(request.url).pathname);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(['/manifest.json'])),
  );
});

self.addEventListener('activate', (event) => {
  // Sin clients.claim(): las pestañas abiertas se quedan bajo el SW anterior,
  // que aún tiene sus chunks en cache. Las nuevas pestañas usan este SW.
  //
  // Retención por antigüedad Y por cantidad. Las dos reglas juntas, porque
  // ninguna basta sola con el ritmo de deploys real:
  //
  //   - Solo por antigüedad: con 8-10 deploys en un día se acumulaban 12+ cachés
  //     (medido en un navegador real), cada una con su copia del bundle.
  //   - Solo por cantidad: si un día no hay deploys, una caché vieja sobrevive
  //     indefinidamente.
  //
  // Se conservan las 2 más recientes (la actual y la anterior, que es la que
  // puede seguir usando una pestaña abierta) y, de las demás, solo las de menos
  // de 1 día. El servidor guarda los assets 7 días, así que una pestaña cuya
  // caché se purgue puede volver a descargarlos.
  //
  // El timestamp en base-36 tiene largo fijo (8 chars) para el año 2026:
  //   36^7 ≈ 78 B ms (año 1972) < Date.now() ≈ 1.75 T ms < 36^8 ≈ 2.8 T ms (año 2059)
  // Se parsea directamente en lugar de depender del orden lexicográfico.
  const UN_DIA_MS   = 24 * 60 * 60 * 1000;
  const CONSERVAR_N = 2;
  event.waitUntil(
    caches.keys().then(keys => {
      const ts = k => parseInt(k.slice('hicloud-'.length), 36);
      const otras = keys
        .filter(k => k.startsWith('hicloud-') && k !== CACHE_NAME)
        // Más recientes primero. Las de nombre corrupto (NaN) van al final
        // para que se eliminen antes que cualquier caché válida.
        .sort((a, b) => (isNaN(ts(b)) ? -Infinity : ts(b)) - (isNaN(ts(a)) ? -Infinity : ts(a)));

      const aBorrar = otras.filter((k, i) => {
        if (isNaN(ts(k))) return true;              // nombre no reconocible
        if (i >= CONSERVAR_N) return true;          // tope por cantidad
        return (Date.now() - ts(k)) > UN_DIA_MS;    // tope por antigüedad
      });
      return Promise.all(aBorrar.map(k => caches.delete(k)));
    }),
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
    // Si la red falla Y no hay nada cacheado, `caches.match` resuelve a
    // undefined y respondWith(undefined) lanza un TypeError que deja la
    // navegación colgada. Relanzar el error de red original hace que el
    // navegador muestre su propia página de error, que sí es recuperable.
    event.respondWith(
      fetch(request).catch(err =>
        caches.match(request)
          .then(r => r || caches.match('/'))
          .then(r => { if (r) return r; throw err; }),
      ),
    );
    return;
  }

  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[^/]+$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Camino por defecto. Cae aquí cualquier asset cuyo nombre no encaje con el
  // patrón de hash de arriba — incluidos scripts servidos desde otra ruta — así
  // que necesita la misma protección: nunca resolver a undefined.
  event.respondWith(
    fetch(request).catch(err =>
      caches.match(request).then(r => { if (r) return r; throw err; }),
    ),
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
  } catch (err) {
    // Si el fetch fue abortado por navegación (AbortError), propagar el error real
    // en vez de fabricar un 503: el fetch ya fue cancelado intencionalmente y
    // el mensaje "venta guardada localmente" sería mentira — el cajero no hizo nada.
    if (err && err.name === 'AbortError') throw err;

    const cached = await caches.match(request);
    if (cached) return cached;
    // X-SW-Offline identifica esta respuesta como generada por el SW (no por el backend).
    // El cliente axios la detecta y omite el reporte a Sentry — un corte de red
    // del dispositivo del usuario no es un bug de la aplicación.
    const swHeaders = { 'Content-Type': 'application/json', 'X-SW-Offline': '1' };
    if (request.method === 'POST') {
      return new Response(
        JSON.stringify({ offline: true, swGenerated: true, message: 'Sin conexión — venta guardada localmente' }),
        { status: 503, headers: swHeaders },
      );
    }
    return new Response(
      JSON.stringify({ offline: true, swGenerated: true, message: 'Sin conexión' }),
      { status: 503, headers: swHeaders },
    );
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
    // Un 404 se devuelve tal cual: el chunk ya no existe en el servidor y el
    // navegador debe verlo como el fallo que es, no disfrazado de otra cosa.
    return response;
  } catch (err) {
    // Scripts, estilos y documentos: propagar el fallo de red REAL.
    // Fabricar aquí un 503 con JSON rompía el arranque de la aplicación.
    if (noFabricar(request)) throw err;
    return new Response(
      JSON.stringify({ offline: true, swGenerated: true, message: 'Sin conexión' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-SW-Offline': '1' } },
    );
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
