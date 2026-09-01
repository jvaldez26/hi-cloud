/**
 * Verifica cómo el panel de respaldos juzga el tamaño de un dump.
 *
 * Se ejecuta con `npm run verificar:backups`. El frontend no tiene runner de
 * tests, así que esto importa la lógica REAL de src/utils/tamanioBackup.ts —no
 * una copia— y comprueba lo que no puede romperse en silencio: que un respaldo
 * truncado no se vea igual que uno bueno.
 *
 * Lo que se vigila:
 *
 *   1. La unidad cuenta. "500K" no es 500 de lo mismo que "20M". El código
 *      anterior hacía parseFloat() y pintaba medio mega como si fuera grande.
 *   2. Un dump anormalmente PEQUEÑO avisa. Es el caso que no existía: 500K
 *      cuando lo normal son 20M es un pg_dump cortado, y salía en verde.
 *   3. El suelo absoluto salta aunque la referencia esté contaminada — si la
 *      página entera está truncada, la mediana también lo está.
 *   4. La mediana ignora un outlier y no se deja arrastrar por los FALLIDOS,
 *      que no tienen tamaño.
 *   5. Los tamaños REALES de producción (18M-20M) siguen saliendo en verde:
 *      una alarma que salta con todo no la mira nadie.
 */
import {
  tamanioBytes, humano, medianaBytes, evaluarTamanio,
} from '../src/utils/tamanioBackup.ts';

let fallos = 0, total = 0;
const ok = (nombre, bien, detalle = '') => {
  total++;
  if (bien) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? '\n      ' + detalle : ''}`); }
};

const K = 1024, M = 1024 ** 2, G = 1024 ** 3;
const verde = '#10b981', ambar = '#f59e0b', rojo = '#ef4444', gris = '#94a3b8';

// ── 1. La unidad cuenta ────────────────────────────────────────────────────
console.log('\nParseo con unidad');
ok('"20M" son 20 MiB',        tamanioBytes('20M') === 20 * M, `dio ${tamanioBytes('20M')}`);
ok('"500K" son 500 KiB',      tamanioBytes('500K') === 500 * K, `dio ${tamanioBytes('500K')}`);
ok('"1.5G" son 1.5 GiB',      tamanioBytes('1.5G') === 1.5 * G, `dio ${tamanioBytes('1.5G')}`);
ok('"500K" < "20M"',          tamanioBytes('500K') < tamanioBytes('20M'));
ok('coma decimal ("1,5G")',   tamanioBytes('1,5G') === 1.5 * G);
ok('sin unidad son bytes',    tamanioBytes('4096') === 4096);
ok('minúscula ("20m")',       tamanioBytes('20m') === 20 * M);
ok('vacío/nulo dan null',     tamanioBytes('') === null && tamanioBytes(null) === null
                              && tamanioBytes(undefined) === null);
ok('basura da null',          tamanioBytes('desconocido') === null);
// La regresión exacta: parseFloat("500K") daba 500 y 500 > 100 => ámbar.
ok('"500K" NO se lee como 500 megas',
  tamanioBytes('500K') !== tamanioBytes('500M'),
  'era el bug: parseFloat tiraba la unidad');

console.log('\nFormato humano');
ok('20 MiB -> "20M"',  humano(20 * M) === '20M', humano(20 * M));
ok('1.5 GiB -> "1.5G"', humano(1.5 * G) === '1.5G', humano(1.5 * G));
ok('500 KiB -> "500K"', humano(500 * K) === '500K', humano(500 * K));

// ── 2. Dump truncado ───────────────────────────────────────────────────────
console.log('\nRespaldo anormalmente pequeño (el caso que faltaba)');
const ref20 = 20 * M;
const chico = evaluarTamanio('500K', ref20);
ok('500K con lo normal en 20M sale en ROJO', chico.color === rojo, `color ${chico.color}`);
ok('...y dice por qué', /truncado/i.test(chico.aviso ?? ''), chico.aviso);
ok('9M frente a 20M sale en rojo (menos de la mitad)',
  evaluarTamanio('9M', ref20).color === rojo);
ok('11M frente a 20M NO alarma (mitad justa es deriva normal)',
  evaluarTamanio('11M', ref20).color === verde,
  `color ${evaluarTamanio('11M', ref20).color}`);
ok('el aviso del encogido menciona la referencia',
  (evaluarTamanio('9M', ref20).aviso ?? '').includes('20M'),
  evaluarTamanio('9M', ref20).aviso);

// ── 3. Suelo absoluto ──────────────────────────────────────────────────────
console.log('\nSuelo absoluto (la referencia también puede estar mal)');
ok('300K salta aunque la mediana sea 400K (página entera truncada)',
  evaluarTamanio('300K', 400 * K).color === rojo);
ok('300K salta incluso sin referencia',
  evaluarTamanio('300K', null).color === rojo);
ok('sin referencia, un tamaño normal no inventa alarma',
  evaluarTamanio('20M', null).color === verde);

// ── 4. Crecido y escala absoluta ───────────────────────────────────────────
console.log('\nRespaldo anormalmente grande');
ok('70M frente a 20M avisa en ámbar', evaluarTamanio('70M', ref20).color === ambar);
ok('1.2G avisa aunque sea el tamaño normal',
  evaluarTamanio('1.2G', 1.2 * G).color === ambar);
ok('sin tamaño el color es gris y no hay aviso',
  evaluarTamanio(undefined, ref20).color === gris && !evaluarTamanio(undefined, ref20).aviso);

// ── 5. La mediana ──────────────────────────────────────────────────────────
console.log('\nReferencia: mediana de los exitosos visibles');
const pagina = [
  { estado: 'EXITOSO', tamanio: '20M' },
  { estado: 'EXITOSO', tamanio: '19M' },
  { estado: 'EXITOSO', tamanio: '20M' },
  { estado: 'EXITOSO', tamanio: '500K' },   // el truncado
  { estado: 'FALLIDO', tamanio: null  },
];
const ref = medianaBytes(pagina);
ok('un truncado no arrastra la referencia', ref === 19.5 * M, `dio ${humano(ref)}`);
ok('el truncado sí sale marcado', evaluarTamanio('500K', ref).color === rojo);
ok('los sanos de la misma página siguen verdes',
  ['20M', '19M'].every(t => evaluarTamanio(t, ref).color === verde));
ok('los FALLIDOS no entran en la mediana',
  medianaBytes([{ estado: 'FALLIDO', tamanio: '1K' }, { estado: 'EXITOSO', tamanio: '20M' }]) === 20 * M);
ok('sin exitosos con tamaño la referencia es null',
  medianaBytes([{ estado: 'FALLIDO', tamanio: null }]) === null);
ok('lista vacía da null', medianaBytes([]) === null);
ok('mediana de un solo elemento es él mismo',
  medianaBytes([{ estado: 'EXITOSO', tamanio: '18M' }]) === 18 * M);

// ── 6. Producción real ─────────────────────────────────────────────────────
// Los 12 respaldos EXITOSOS que hay hoy en backup_registros. Si esto se pone
// rojo, la alarma está gritando sobre un sistema sano.
console.log('\nDatos reales de producción (12 respaldos exitosos)');
const prod = ['18M','18M','18M','18M','19M','19M','19M','20M','20M','20M','20M','20M']
  .map(tamanio => ({ estado: 'EXITOSO', tamanio }));
const refProd = medianaBytes(prod);
ok('la referencia de producción sale 19M', refProd === 19 * M, `dio ${humano(refProd)}`);
ok('los 12 salen en verde: ninguna falsa alarma',
  prod.every(r => evaluarTamanio(r.tamanio, refProd).color === verde),
  prod.filter(r => evaluarTamanio(r.tamanio, refProd).color !== verde).map(r => r.tamanio).join(', '));

console.log(`\n${fallos === 0 ? '✅' : '❌'} ${total - fallos}/${total} comprobaciones\n`);
process.exit(fallos === 0 ? 0 : 1);
