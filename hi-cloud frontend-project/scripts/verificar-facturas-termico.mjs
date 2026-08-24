/**
 * Verifica src/utils/cierreFacturasTermico.ts — el bloque "FACTURAS EMITIDAS"
 * del ticket térmico del cierre de caja.
 *
 * Se ejecuta con `npm run verificar:termico`. El frontend no tiene runner de
 * tests, así que esto transpila el módulo real con esbuild y lo ejecuta. Mismo
 * patrón que verificar-fechas-rd.mjs.
 *
 * Corre con TZ forzado a algo que NO es RD: las horas del ticket no pueden
 * depender de la zona del equipo que imprime.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.TZ = 'America/Los_Angeles';

const dir  = mkdtempSync(join(tmpdir(), 'termico-'));
const dest = join(dir, 'mod.mjs');

const { outputFiles } = await build({
  entryPoints: ['src/utils/cierreFacturasTermico.ts'],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
writeFileSync(dest, outputFiles[0].text);
const M = await import(pathToFileURL(dest).href);

let fallos = 0, total = 0;
const ok = (nombre, cond) => {
  total++;
  if (cond) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}`); }
};

/** 14:30 en RD = 18:30 UTC. */
const fac = (over = {}) => ({
  folio: 'FAC-000101', encf: 'E320000000101',
  hora: '2026-08-23T18:30:00.000Z',
  formasPago: [{ tipo: 1, monto: 1180 }],
  total: 1180, cancelada: false,
  ...over,
});

console.log(`\nTZ=${process.env.TZ} (a propósito: no es RD)\n`);

console.log('Sin facturas');
ok('devuelve cadena vacía, no un bloque con cabecera sola',
   M.bloqueFacturasTermico({ facturas: [] }) === '');
ok('tolera null y undefined',
   M.bloqueFacturasTermico(null) === '' && M.bloqueFacturasTermico(undefined) === '');

console.log('\nUna línea por factura');
{
  const html = M.bloqueFacturasTermico({ facturas: [fac()] });
  ok('incluye el número',      html.includes('FAC-000101'));
  ok('incluye la hora en RD (14:30, no 18:30 ni 11:30)',
     html.includes('14:30') && !html.includes('18:30') && !html.includes('11:30'));
  ok('incluye el método de pago', html.includes('EFEC'));
  ok('incluye el monto',          html.includes('1,180.00'));
  ok('NO trae líneas de producto', !/producto|descripcion|cantidad/i.test(html));
  ok('lleva la cabecera FACTURAS EMITIDAS', html.includes('FACTURAS EMITIDAS'));
}

console.log('\nAnuladas: se incluyen marcadas, y no suman');
{
  const html = M.bloqueFacturasTermico({
    facturas: [fac(), fac({ folio: 'FAC-000102', total: 500, cancelada: true })],
  });
  ok('la anulada aparece — no se esconde', html.includes('FAC-000102'));
  ok('sale marcada como ANULADA',          html.includes('ANULADA'));
  ok('lleva la clase de tachado',          html.includes('fe-anulada'));
  ok('el total NO la suma (1.180, no 1.680)',
     html.includes('1,180.00') && !html.includes('1,680.00'));
  ok('se dice cuántas anuladas hay',       html.includes('Anuladas'));
}

console.log('\nTotales: salen del resumen del backend, no se recalculan');
{
  // El resumen manda aunque no cuadre con la suma local: si divergen, el bug
  // está en el backend y hay que verlo, no taparlo con un cálculo del ticket.
  const html = M.bloqueFacturasTermico({
    facturas: [fac(), fac({ folio: 'FAC-000102' })],
    resumen: { totalFacturas: 2, totalCanceladas: 0, total: 9999 },
  });
  ok('usa el total del resumen', html.includes('9,999.00'));
  ok('usa el conteo del resumen', html.includes('>2<'));
}

console.log('\nSin resumen cae a la suma local, con el mismo criterio');
{
  const html = M.bloqueFacturasTermico({
    facturas: [fac(), fac({ folio: 'FAC-000102', total: 820, cancelada: true })],
  });
  ok('suma solo las activas', html.includes('1,180.00'));
}

console.log('\nMétodo de pago');
{
  const mixto = M.bloqueFacturasTermico({
    facturas: [fac({ formasPago: [{ tipo: 1, monto: 500 }, { tipo: 3, monto: 680 }] })],
  });
  ok('varias formas → MIXTO (en 80mm no caben escritas)', mixto.includes('MIXTO'));
  const sinPago = M.bloqueFacturasTermico({ facturas: [fac({ formasPago: [] })] });
  ok('sin forma de pago no rompe', sinPago.includes('—'));
}

console.log('\nN facturas impresas — para saber que están todas');
{
  const html = M.bloqueFacturasTermico({
    facturas: [fac(), fac({ folio: 'FAC-000102' }), fac({ folio: 'FAC-000103', cancelada: true })],
  });
  // Cuenta TODAS las impresas, anuladas incluidas: la línea dice que el ticket
  // no viene recortado, no cuántas facturaron.
  ok('cuenta las 3 impresas, no las 2 que suman', html.includes('3 facturas impresas'));

  const una = M.bloqueFacturasTermico({ facturas: [fac()] });
  ok('singular con una sola', una.includes('1 factura impresa'));
}

console.log('\nEl bloque no calcula dinero del cuadre');
{
  const src = outputFiles[0].text;
  ok('no menciona esperado/diferencia/saldoCierre',
     !/esperado|diferencia|saldoCierre|ventasTarjeta/i.test(src));
}

try { unlinkSync(dest); } catch { /* da igual */ }
console.log(`\n${total - fallos}/${total} comprobaciones OK`);
process.exit(fallos ? 1 : 0);
