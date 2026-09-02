#!/usr/bin/env node
/**
 * API falsa en :3000 para trabajar el frontend SIN backend.
 *
 *   npm run dev:mock     (en una terminal)
 *   npm run dev          (en otra)
 *
 * Para qué sirve: capturar una pantalla antes de pushearla, que es la regla de
 * la casa para cualquier cambio visual. Sin esto hay que levantar el backend
 * real, y eso NO se hace nunca contra la base de producción: `ScheduleModule
 * .forRoot()` no está condicionado y los crones de e-CF mandarían comprobantes
 * de verdad a la DGII.
 *
 * ── LAS TRES TRAMPAS, que costaron dos sesiones enteras ─────────────────────
 *
 * 1. CORS CON CREDENCIALES. `.env` trae
 *    `VITE_API_URL=http://localhost:3000/api/v1`, o sea que axios va
 *    CROSS-ORIGIN directo al :3000 y NO pasa por el proxy de Vite. Y el cliente
 *    va con `withCredentials: true`, así que `Access-Control-Allow-Origin: *`
 *    está PROHIBIDO por la especificación: hay que devolver el origen exacto y
 *    `Access-Control-Allow-Credentials: true`.
 *
 *    Cómo se manifiesta: el servidor registra la petición y responde 200, pero
 *    el navegador bloquea la respuesta. Axios ve un error de red SIN `response`,
 *    la hidratación de sesión falla, llama a `logout()` y acabas en /login una y
 *    otra vez creyendo que el problema es el login. Con `fetch()` a mano
 *    funciona —va por el proxy, mismo origen— lo que despista todavía más.
 *
 * 2. EL PREFIJO ES /api/v1, no /api.
 *
 * 3. GET /auth/2fa/status DEVUELVE `{ enabled }`. El panel de super admin está
 *    detrás de `SetupTwoFactorGate`, que mira exactamente ese campo: cualquier
 *    otra forma deja la pantalla de "configura el segundo factor".
 *
 * ── Y la sesión ────────────────────────────────────────────────────────────
 *
 * El token vive en cookie httpOnly, así que no se puede sembrar desde JS. Lo
 * que sí lee el store al arrancar es `localStorage.auth_user`. En la consola
 * del navegador, antes de entrar:
 *
 *   localStorage.setItem('auth_user', JSON.stringify({
 *     id: 1, nombre: 'Dev', email: 'dev@hicloudrd.com',
 *     role: 'super_admin', isActive: true,
 *   }));
 *
 * `role` decide a qué llegas: 'super_admin' para /super-admin, 'admin' para el
 * ERP normal. Después, recargar.
 *
 * Variables:
 *   PRECIO=0   deja el precio del excedente sin configurar (el estado de hoy)
 *   PORT=3000
 */
import http from 'http';

const PORT   = Number(process.env.PORT   ?? 3000);
const PRECIO = Number(process.env.PRECIO ?? 3);

const USER = {
  id: 1, nombre: 'Dev', email: 'dev@hicloudrd.com',
  role: 'super_admin', isActive: true, temaSidebar: 'light',
};

const PLANES = [
  { clave: 'emprendedor', nombre: 'Emprendedor', precioMensual: 1700, activo: true },
  { clave: 'pyme',        nombre: 'Pyme',        precioMensual: 3500, activo: true },
  { clave: 'pro',         nombre: 'Pro',         precioMensual: 5200, activo: true },
  { clave: 'plus',        nombre: 'Plus',        precioMensual: 7600, activo: true },
];

const EXCEDENTES = [
  { empresaId: 44, empresa: 'Ventas Populares R&M', plan: 'plus', planNombre: 'Plus',
    ciclo: { inicio: '2026-07-05', fin: '2026-08-05' },
    emitidos: 6412, cupo: 6000, excedente: 412,
    precioUnitario: PRECIO, monto: +(412 * PRECIO).toFixed(2) },
  { empresaId: 52, empresa: 'REPUESTOS CRANCHA SRL', plan: 'pyme', planNombre: 'Pyme',
    ciclo: { inicio: '2026-07-05', fin: '2026-08-05' },
    emitidos: 1030, cupo: 1000, excedente: 30,
    precioUnitario: PRECIO, monto: +(30 * PRECIO).toFixed(2) },
];

/**
 * Rutas SIN el prefijo /api/v1. Lo que no esté aquí devuelve [] y sale como
 * "SIN MOCK" en el log: así se ve de un vistazo qué le falta a la pantalla.
 */
const RUTAS = {
  '/version':               () => ({ version: 'dev' }),
  '/auth/me':               () => USER,
  '/auth/stats-plataforma': () => ({ empresas: 11, facturas: 14628 }),
  // OJO: el campo es `enabled`. Ver la trampa 3 de arriba.
  '/auth/2fa/status':       () => ({ enabled: true }),

  '/admin/planes':               () => PLANES,
  '/admin/cobros/configuracion': () => ({
    precioEcfExcedente: PRECIO, actualizadoPor: 1, updatedAt: new Date().toISOString(),
  }),
  '/admin/metricas':             () => ({ empresas: 11, usuarios: 34, facturas: 14628, mrrDop: 52300 }),
  '/admin/contadores':           () => ({ solicitudesPendientes: 0, registrosPendientes: 0, comprobantesPendientes: 0 }),
  '/admin/configuracion-global': () => [],
  '/admin/empresas':             () => [],
  '/admin/usuarios':             () => [],
  '/admin/suscripciones':        () => [],
  '/admin/modulos':              () => [],
  '/admin/modulos/activaciones': () => [],
  '/admin/backups':              () => ({ items: [], total: 0 }),
  '/admin/registros-pendientes': () => [],
  '/admin/empresas-pendientes-aprobacion': () => [],
  '/auditoria/modulos':          () => [],
  '/suscripciones/admin/pruebas':     () => [],
  '/suscripciones/admin/solicitudes': () => [],
  '/suscripciones/planes':       () => PLANES,
  '/suscripciones/mi-plan':      () => ({ plan: 'plus', estado: 'activa', diasRestantes: 20 }),

  '/admin/pagos-suscripcion':                         () => [],
  '/admin/pagos-suscripcion/excedentes-ecf':          () => EXCEDENTES,
  '/admin/pagos-suscripcion/comprobantes-pendientes': () => [],
  '/admin/pagos-suscripcion/config-bancaria':         () => ({ banco: 'Popular', cuenta: '000', activo: true }),
  '/admin/pagos-suscripcion/resumen-cobros':          () => ([
    { empresaId: 44, nombre: 'Ventas Populares R&M', email: 'cliente@ejemplo.com',
      plan: 'plus', estadoSuscripcion: 'activa', modalidad: 'mensual', diaCorte: 5,
      venceSuscripcion: '2026-10-05', precioMensual: 7600, saldo: 0,
      ultimoPago: null, pendientesConfirmacion: 0 },
  ]),
};

const PREFIJO = /^\/api(\/v1)?/;

http.createServer((req, res) => {
  const ruta = req.url.replace(PREFIJO, '').split('?')[0];
  const hay  = Boolean(RUTAS[ruta]);
  console.log(`${req.method.padEnd(6)} ${ruta.padEnd(48)} ${hay ? 'ok' : 'SIN MOCK'}`);

  res.setHeader('Content-Type', 'application/json');
  // Con `withCredentials: true` el origen NO puede ser '*'. Ver la trampa 1.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // Las escrituras se aceptan sin hacer nada: sirve para ver el camino feliz de
  // un formulario sin tocar ninguna base de datos.
  if (req.method !== 'GET') { res.writeHead(200); return res.end(JSON.stringify({ ok: true })); }

  res.writeHead(200);
  res.end(JSON.stringify(hay ? RUTAS[ruta]() : []));
}).listen(PORT, () => {
  console.log(`\n  API falsa en http://localhost:${PORT}  (prefijo /api/v1, precio ${PRECIO})`);
  console.log('  Siembra la sesión en la consola del navegador antes de entrar:\n');
  console.log(`    localStorage.setItem('auth_user', JSON.stringify(${JSON.stringify(USER)}))\n`);
});
