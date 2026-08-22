/**
 * Verifica src/utils/fechaRD.ts — que toda fecha y hora salga en zona de RD y
 * no dependa del equipo.
 *
 * Se ejecuta con `npm run verificar:fechas`. El frontend no tiene runner de
 * tests, así que esto transpila el módulo real con esbuild (ya está instalado,
 * lo trae Vite) y lo ejecuta. No es un sustituto de vitest, pero comprueba el
 * archivo de verdad, no una copia de la lógica.
 *
 * IMPORTANTE: se corre con TZ forzado a algo que NO es RD. Ese es justamente el
 * escenario a cubrir — la PC de una caja con la zona mal puesta. Si los
 * resultados dependieran de la zona del proceso, aquí fallarían.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.env.TZ !== 'America/Los_Angeles') {
  process.env.TZ = 'America/Los_Angeles';   // −7: ni RD ni UTC
}

const dir  = mkdtempSync(join(tmpdir(), 'fechaRD-'));
const dest = join(dir, 'fechaRD.mjs');

const { outputFiles } = await build({
  entryPoints: ['src/utils/fechaRD.ts'],
  bundle: true, format: 'esm', platform: 'node', write: false,
  external: [],
});
writeFileSync(dest, outputFiles[0].text);
const M = await import(pathToFileURL(dest).href);

let fallos = 0, total = 0;
const ok = (nombre, real, esperado) => {
  total++;
  const bien = typeof esperado === 'function' ? esperado(real) : real === esperado;
  if (!bien) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${esperado}`); }
  else console.log(`  ✓ ${nombre}`);
};
const contiene = (s) => (v) => String(v).includes(s);
const noContiene = (s) => (v) => !String(v).includes(s);

/** 22 de agosto de 2026, 9:14 de la mañana en RD. */
const NUEVE_CATORCE = '2026-08-22T13:14:00.000Z';

console.log(`\nProceso corriendo en TZ=${process.env.TZ} (a propósito: no es RD)\n`);

console.log('Formateo — siempre zona RD');
ok('EL BUG: 9:14 a.m. no se pinta como 1:14 p.m.', M.hora(NUEVE_CATORCE), contiene('9:14'));
ok('...y no aparece 1:14 por ningún lado',          M.hora(NUEVE_CATORCE), noContiene('1:14'));
ok('ISO, Date y epoch dan lo mismo',
   [M.hora(new Date(NUEVE_CATORCE)), M.hora(Date.parse(NUEVE_CATORCE))].join('|'),
   `${M.hora(NUEVE_CATORCE)}|${M.hora(NUEVE_CATORCE)}`);
ok('cadena SQL sin zona se lee como UTC, no como local',
   M.hora('2026-08-22 13:14:00'), M.hora(NUEVE_CATORCE));
ok('horaConSegundos trae los segundos', M.horaConSegundos('2026-08-22T13:14:05.000Z'), contiene('9:14:05'));
ok('fechaHora junta ambas',             M.fechaHora(NUEVE_CATORCE), contiene('22/08/2026'));
ok('a las 9pm RD la fecha sigue siendo la de RD, no la UTC del día siguiente',
   M.fecha('2026-08-23T01:00:00.000Z'), '22/08/2026');

console.log('\nFechas de calendario — el error contrario');
ok("'YYYY-MM-DD' no se convierte de zona",     M.fecha('2026-08-22'), '22/08/2026');
ok('...tampoco en fin de año',                 M.fecha('2026-01-01'), '01/01/2026');
ok('fechaHora no le inventa una hora',         M.fechaHora('2026-08-22'), '22/08/2026');
ok('dRD la ancla al mediodía y no se cae de día', M.dRD('2026-08-22').format('YYYY-MM-DD'), '2026-08-22');

console.log('\nValores vacíos');
for (const v of [null, undefined, '', 'no soy una fecha']) {
  ok(`fecha(${JSON.stringify(v)}) no da "Invalid Date"`, M.fecha(v), '');
  ok(`hora(${JSON.stringify(v)}) no da "Invalid Date"`,  M.hora(v),  '');
}

console.log('\nReloj del servidor');
M.registrarHoraServidor('Sat, 22 Aug 2026 13:14:00 GMT');
ok('con el reloj del equipo mal, ahora() da la hora del servidor',
   M.hora(M.ahora()), contiene('9:14'));
ok('el desfase del equipo se detecta', M.desfaseRelojMinutos(), (v) => typeof v === 'number');

const desfaseAntes = M.desfaseRelojMinutos();
M.registrarHoraServidor('vete a saber');
M.registrarHoraServidor(null);
M.registrarHoraServidor(undefined);
ok('una cabecera basura se ignora sin romper nada', M.desfaseRelojMinutos(), desfaseAntes);

// El servidor dice 23/08 01:00 UTC = 22/08 21:00 RD.
M.registrarHoraServidor('Sun, 23 Aug 2026 01:00:00 GMT');
ok('hoyRD a las 9pm RD sigue siendo hoy, no mañana', M.hoyRD(), '2026-08-22');
ok('anioRD', M.anioRD(), 2026);
ok('mesRD',  M.mesRD(),  8);
ok('horaDelDiaRD', M.horaDelDiaRD(), 21);

try { unlinkSync(dest); } catch { /* da igual */ }

console.log(`\n${total - fallos}/${total} comprobaciones OK`);
process.exit(fallos ? 1 : 0);
