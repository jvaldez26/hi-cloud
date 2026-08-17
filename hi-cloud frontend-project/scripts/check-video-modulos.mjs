#!/usr/bin/env node
/**
 * scripts/check-video-modulos.mjs
 *
 * Verifica que cada clave en VIDEO_TUTORIAL_MODULOS tenga una ruta registrada
 * en App.tsx (primer segmento de ruta). Si alguna clave no tiene ruta →
 * exit 1 y el CI falla.
 *
 * Por qué existe: la lista de claves en constants/video-tutorial-modulos.ts
 * debe derivarse de las rutas reales del router. Este script falla el CI
 * si ambas listas se desincronizaron, evitando videos "huérfanos" sin ruta.
 *
 * Uso:  node scripts/check-video-modulos.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── 1. Leer y parsear VIDEO_TUTORIAL_MODULOS de constants/ ──────────────────

const constantsPath = path.join(ROOT, 'src', 'constants', 'video-tutorial-modulos.ts');
const constantsText = fs.readFileSync(constantsPath, 'utf8');

// Extraer todos los strings del array VIDEO_TUTORIAL_MODULOS
// Soporta strings con comillas simples o dobles, separados por comas/whitespace
const arrayMatch = constantsText.match(/export const VIDEO_TUTORIAL_MODULOS\s*=\s*\[([\s\S]*?)\]\s*as const/);
if (!arrayMatch) {
  console.error('❌  No se encontró VIDEO_TUTORIAL_MODULOS en constants/video-tutorial-modulos.ts');
  process.exit(1);
}

const modulosRaw = arrayMatch[1];
const MODULOS = [...modulosRaw.matchAll(/['"]([a-z0-9-]+)['"]/g)].map(m => m[1]);

if (MODULOS.length === 0) {
  console.error('❌  VIDEO_TUTORIAL_MODULOS está vacío');
  process.exit(1);
}

console.log(`📋  ${MODULOS.length} claves en VIDEO_TUTORIAL_MODULOS`);

// ── 2. Leer App.tsx y extraer primer segmento de cada ruta ──────────────────

const appPath = path.join(ROOT, 'src', 'App.tsx');
const appText = fs.readFileSync(appPath, 'utf8');

// Extrae todo lo que aparezca como path="/<algo>" o path='/<algo>'
const pathMatches = [...appText.matchAll(/path=["'](\/?[^"']+)["']/g)];
const routeSegments = new Set();

for (const [, p] of pathMatches) {
  // Normalizar: quitar barra inicial
  const clean = p.replace(/^\//, '').trim();
  if (!clean) continue;

  // Primer segmento (antes del siguiente /)
  const firstSegment = clean.split('/')[0];

  // Ignorar segmentos dinámicos (:id, :token, etc.)
  if (firstSegment.startsWith(':')) continue;

  // Ignorar rutas públicas/sistema que no son módulos de negocio
  const PUBLIC_SKIP = new Set([
    'login', 'registrar', 'solicitar-demo', 'precios',
    'recuperar-contrasena', 'restablecer', 'verificar-correo',
    'auth', 'pending-approval', 'onboarding', 'pending-empresa',
    'setup-password', 'portal', 'invitacion', 'portal-empleado',
    'super-admin', 'sin-empresa', 'suscripcion', 'mi-suscripcion',
    'profile', 'asistente', 'soporte', 'plan-cuentas',
    'periodo-contable', 'reportes-financieros', 'balance-comprobacion',
    'kpi', 'analytics', 'generador-reportes', 'flujo-caja', 'calendario',
    'conteo-inventario', 'planeacion-demanda', 'distribucion-costos',
    'facturas-recurrentes', 'ecf-recibidos', 'wms',
  ]);

  if (PUBLIC_SKIP.has(firstSegment)) continue;

  routeSegments.add(firstSegment);
}

console.log(`🗺️   ${routeSegments.size} segmentos de ruta extraídos de App.tsx`);

// ── 3. Verificar: cada clave de VIDEO_TUTORIAL_MODULOS tiene ruta ────────────

const huerfanos = MODULOS.filter(m => !routeSegments.has(m));

if (huerfanos.length > 0) {
  console.error('');
  console.error(`❌  ${huerfanos.length} clave(s) en VIDEO_TUTORIAL_MODULOS sin ruta en App.tsx:`);
  for (const m of huerfanos) {
    console.error(`     · "${m}"  — agrega la ruta o elimina la clave`);
  }
  console.error('');
  console.error('   INSTRUCCIONES:');
  console.error('   • Si la ruta existe con otro nombre → actualiza la clave en');
  console.error('     src/constants/video-tutorial-modulos.ts');
  console.error('   • Si la ruta aún no existe → elimina la clave por ahora');
  console.error('   • Si la ruta es nueva → agrégala a App.tsx primero');
  process.exit(1);
}

console.log('✅  Todas las claves tienen una ruta válida en App.tsx');

// ── 4. Info extra: rutas en App.tsx sin clave en VIDEO_TUTORIAL_MODULOS ──────

const modulosSet = new Set(MODULOS);
const sinClave = [...routeSegments].filter(s => !modulosSet.has(s)).sort();
if (sinClave.length > 0) {
  console.log('');
  console.log(`ℹ️   ${sinClave.length} ruta(s) en App.tsx sin clave en VIDEO_TUTORIAL_MODULOS:`);
  console.log('   (Esto está bien — no todas las rutas necesitan video tutorial)');
  for (const s of sinClave) {
    console.log(`     · /${s}`);
  }
}

console.log('');
console.log('✅  check-video-modulos OK');
