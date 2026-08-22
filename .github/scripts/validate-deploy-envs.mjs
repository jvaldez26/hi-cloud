#!/usr/bin/env node
/**
 * Comprueba que la lista de variables inyectadas al servidor esté completa.
 *
 * CONTEXTO — por qué existe este check
 * ------------------------------------
 * Un deploy exportó SENTRY_DSN vacía al shell remoto, esa variable pisó el .env
 * del servidor (dotenv no sobrescribe lo que ya está en process.env), Joi la
 * rechazó por no ser una URI y el backend dejó de arrancar: 45 minutos de caída.
 *
 * El arreglo tiene dos piezas, y esta valida la segunda:
 *
 *   1. El script del deploy hace `unset` de toda variable inyectada que llegue
 *      vacía, para que gane el .env. Itera VARS_INYECTADAS, la MISMA lista que
 *      alimenta `envs:`, así que esas dos no pueden desincronizarse.
 *
 *   2. Pero VARS_INYECTADAS se mantiene a mano junto al bloque `env:` del step.
 *      Si alguien añade un secreto al `env:` y olvida ponerlo en la lista, esa
 *      variable no se inyecta y el deploy no avisa: falla en silencio, con la
 *      configuración a medias. Eso es lo que se comprueba aquí.
 *
 * Es un check de TEXTO: no necesita dependencias, ni base de datos, ni entorno.
 * Corre al principio de CI para fallar en segundos, antes de la suite completa.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI     = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = join(AQUI, '..', 'workflows', 'deploy.yml');

/** Variables del `env:` que NO viajan al servidor y no deben estar en la lista. */
const NO_SE_INYECTAN = new Set([
  'VARS_INYECTADAS',   // es la lista misma
]);

const yml = readFileSync(WORKFLOW, 'utf8');

// ── 1. El bloque `env:` del step que abre la sesión SSH ─────────────────────
const iniSSH = yml.indexOf('uses: appleboy/ssh-action');
if (iniSSH === -1) {
  console.error('✗ No se encontró el step de appleboy/ssh-action en deploy.yml');
  process.exit(1);
}
const finSSH   = yml.indexOf('\n        with:', iniSSH);
const bloqueEnv = yml.slice(iniSSH, finSSH);

// Claves `NOMBRE: ${{ secrets.X }}` — las que reciben un secreto.
const declaradas = [...bloqueEnv.matchAll(/^\s{10}([A-Z0-9_]+):\s*\$\{\{\s*secrets\./gm)]
  .map(m => m[1])
  .filter(v => !NO_SE_INYECTAN.has(v));

// ── 2. La lista VARS_INYECTADAS ─────────────────────────────────────────────
const mLista = yml.match(/^\s+VARS_INYECTADAS:\s*(.+)$/m);
if (!mLista) {
  console.error('✗ No se encontró VARS_INYECTADAS en deploy.yml.');
  console.error('  Es la fuente única de la lista de variables inyectadas.');
  process.exit(1);
}
const enLista = mLista[1].trim().split(',').map(s => s.trim()).filter(Boolean);

// ── 3. `envs:` debe DERIVAR de la lista, no repetirla ───────────────────────
const mEnvs = yml.match(/^\s+envs:\s*(.+)$/m);
if (!mEnvs || !mEnvs[1].includes('env.VARS_INYECTADAS')) {
  console.error('✗ `envs:` ya no deriva de VARS_INYECTADAS.');
  console.error('  Debe ser: envs: ${{ env.VARS_INYECTADAS }},VARS_INYECTADAS');
  console.error('  Volver a escribir la lista a mano reabre el fallo que este check evita.');
  process.exit(1);
}

// ── 4. El script no puede repetir la lista ──────────────────────────────────
if (/for _var in [A-Z0-9_]+ [A-Z0-9_]+/.test(yml)) {
  console.error('✗ El script del deploy vuelve a enumerar variables a mano.');
  console.error('  Debe iterar $VARS_INYECTADAS, no una copia de la lista.');
  process.exit(1);
}

// ── 5. Toda variable declarada tiene que estar en la lista ──────────────────
const faltan = declaradas.filter(v => !enLista.includes(v));
const sobran = enLista.filter(v => !declaradas.includes(v));

if (faltan.length > 0) {
  console.error('');
  console.error('✗ Variables en el `env:` del deploy que NO están en VARS_INYECTADAS:');
  for (const v of faltan) console.error(`      ${v}`);
  console.error('');
  console.error('  Esas variables NO llegan al servidor: el deploy las ignora en');
  console.error('  silencio y el backend arranca con la configuración a medias.');
  console.error('');
  console.error('  Arreglo: añádelas a VARS_INYECTADAS en .github/workflows/deploy.yml');
  console.error('');
  process.exit(1);
}

if (sobran.length > 0) {
  console.error('');
  console.error('✗ Variables en VARS_INYECTADAS que no se declaran en el `env:` del step:');
  for (const v of sobran) console.error(`      ${v}`);
  console.error('');
  console.error('  Se exportarían siempre VACÍAS y pisarían el .env del servidor.');
  console.error('  Es exactamente lo que tumbó producción 45 minutos.');
  console.error('');
  process.exit(1);
}

console.log(`✅ deploy.yml: ${declaradas.length} variables inyectadas, lista sincronizada`);
console.log(`   ${enLista.join(', ')}`);
