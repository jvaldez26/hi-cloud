/**
 * Comprueba cuándo avisa el banner de versión nueva.
 *
 * El caso que importa es el de la ventana de despliegue: nginx ya sirve el
 * bundle nuevo y PM2 todavía corre el backend viejo, así que el desajuste es
 * real y recargar NO lo arregla. Si el banner vuelve a salir tras cada recarga,
 * la gente aprende a ignorarlo — y el día que el aviso sea de verdad, nadie
 * recargará.
 *
 *   node scripts/verificar-banner-version.mjs
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FUENTE = 'src/components/ui/NewVersionBanner.tsx';
const TMP    = 'scripts/.banner-version.mjs';

// Se compila el módulo REAL. Reescribir la lógica aquí probaría mi copia, no
// el código que se despliega.
const src = readFileSync(FUENTE, 'utf8')
  // El componente arrastra antd y React; para la función pura sobran, y
  // `import.meta.env` no existe fuera de Vite.
  .replace(/^import .*(react|antd|@ant-design|useVersionPing|fechaRD).*$/gm, '')
  .replace(/export default function NewVersionBanner[\s\S]*$/m, '')
  .replace(/import\.meta\.env\.[A-Z_]+/g, 'undefined');

await build({
  stdin:    { contents: src, resolveDir: '.', loader: 'tsx' },
  outfile:  TMP,
  format:   'esm',
  platform: 'neutral',
  logLevel: 'silent',
});

const { decidirAviso, ESPERA_TRAS_RECARGA_MS } = await import(pathToFileURL(TMP).href);
unlinkSync(TMP);

const T0    = 1_700_000_000_000;   // instante fijo: nada depende del reloj real
const VIEJO = 'aaaaaaa';
const NUEVO = 'bbbbbbb';

let fallos = 0;
const caso = (nombre, entrada, esperado) => {
  const r = decidirAviso(entrada);
  const ok = r.avisar === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✗'} ${nombre}${ok ? '' : `  → esperaba avisar=${esperado}, dio ${r.avisar}`}`);
  return r;
};

console.log('Cuándo NO debe avisar');
caso('sin build embebido (build local, preview)',
  { buildBundle: undefined, buildServidor: NUEVO, recarga: null, ahoraMs: T0 }, false);
caso('el backend no responde — caída de red, no despliegue',
  { buildBundle: NUEVO, buildServidor: null, recarga: null, ahoraMs: T0 }, false);
caso('las versiones coinciden',
  { buildBundle: NUEVO, buildServidor: NUEVO, recarga: null, ahoraMs: T0 }, false);
// El instante va MÁS ALLÁ de la espera a propósito. Con `ts: T0 + 60_000` este
// caso también pasaba, pero por la espera y no por la comprobación del build:
// al quitar esa comprobación seguía en verde. Un test que pasa por el motivo
// equivocado es peor que no tenerlo.
caso('ya recargó por ESE build — el caso de la ventana de despliegue',
  { buildBundle: NUEVO, buildServidor: VIEJO, recarga: { build: VIEJO, ts: T0 },
    ahoraMs: T0 + ESPERA_TRAS_RECARGA_MS + 1 }, false);
caso('recargó hace poco por otro build — se le da aire',
  { buildBundle: NUEVO, buildServidor: 'ccccccc', recarga: { build: VIEJO, ts: T0 }, ahoraMs: T0 + 60_000 }, false);

console.log('\nCuándo SÍ debe avisar');
caso('hay versión nueva y nunca recargó',
  { buildBundle: VIEJO, buildServidor: NUEVO, recarga: null, ahoraMs: T0 }, true);
caso('pasada la espera, con un build distinto al que ya recargó',
  { buildBundle: NUEVO, buildServidor: 'ccccccc',
    recarga: { build: VIEJO, ts: T0 }, ahoraMs: T0 + ESPERA_TRAS_RECARGA_MS + 1 }, true);

console.log('\nDetalles que se escapan fácil');
{
  const r = decidirAviso({ buildBundle: NUEVO, buildServidor: 'ccccccc',
    recarga: { build: VIEJO, ts: T0 }, ahoraMs: T0 + 60_000 });
  const ok = r.esperarMs === ESPERA_TRAS_RECARGA_MS - 60_000;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✗'} dice cuánto falta para reevaluar (${r.esperarMs} ms)`);
}
{
  // Sin esto, el sondeo no volvería a disparar el efecto: el build_id del
  // servidor no cambia mientras dura el despliegue.
  const r = decidirAviso({ buildBundle: NUEVO, buildServidor: VIEJO,
    recarga: { build: VIEJO, ts: T0 }, ahoraMs: T0 + 60_000 });
  const ok = r.esperarMs === undefined;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✗'} para el build ya recargado no programa reintento (sería insistir)`);
}
{
  // Un reloj adelantado en el equipo da un intervalo negativo. Debe tratarse
  // como "acaba de recargar", no colarse como espera cumplida.
  const r = decidirAviso({ buildBundle: NUEVO, buildServidor: 'ccccccc',
    recarga: { build: VIEJO, ts: T0 }, ahoraMs: T0 - 3_600_000 });
  const ok = r.avisar === false;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✗'} con el reloj del equipo adelantado no se cuela el aviso`);
}

console.log(fallos === 0 ? '\n✅ todo correcto' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
