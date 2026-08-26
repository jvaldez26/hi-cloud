/**
 * Verifica que el ticket COMPACTO no recorta ningún campo, en 58mm y en 80mm.
 *
 * Se ejecuta con `npm run verificar:compacto`. El frontend no tiene runner de
 * tests, así que esto transpila el módulo real con esbuild y lo ejecuta. Mismo
 * patrón que verificar-facturas-termico.mjs.
 *
 * POR QUÉ EXISTE
 * ══════════════
 * El formato compacto se diseñó sobre una maqueta dibujada más ancha que el
 * papel real. En 80mm caben 30 caracteres y en 58mm caben 24, y pares como
 * "e-NCF E320000000719 | Seg. fkv1cT" (31) no entraban. Salió a producción
 * imprimiendo "e-NCF E3200000000…" y "Subtotal 169…" en tickets reales de
 * clientes. Un e-NCF truncado es peor que uno ausente: parece que está y no
 * está, y es dato exigible por la DGII.
 *
 * Lo que se afirma aquí:
 *   1. Ningún renglón emparejado supera el ancho del papel.
 *   2. Ningún campo fiscal comparte renglón con otro.
 *   3. Los valores fiscales aparecen ENTEROS en el ticket.
 *   4. Ninguna línea acaba en un separador colgando.
 *   5. No hay marcas de recorte ('…' fuera del nombre del producto, '>' de
 *      lineaLR) en ninguna línea.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir  = mkdtempSync(join(tmpdir(), 'compacto-'));
const dest = join(dir, 'mod.mjs');

const { outputFiles } = await build({
  entryPoints: ['src/utils/ticketTermico.ts'],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
writeFileSync(dest, outputFiles[0].text);
const { buildReciboTermicoHTML } = await import(pathToFileURL(dest).href);

const { capacidadLinea } = await (async () => {
  const r = await build({
    entryPoints: ['src/utils/docTermico.ts'],
    bundle: true, format: 'esm', platform: 'node', write: false,
  });
  const d2 = join(dir, 'doc.mjs');
  writeFileSync(d2, r.outputFiles[0].text);
  return import(pathToFileURL(d2).href);
})();

let fallos = 0, total = 0;
const ok = (nombre, cond, detalle = '') => {
  total++;
  if (cond) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? '\n      ' + detalle : ''}`); }
};

// ── Datos de prueba ──────────────────────────────────────────────────────────
// Importes de cinco y seis cifras a propósito: el bug salió con RD$169,491.53,
// no con los RD$1,200 de la maqueta. Y un e-NCF y un RNC de longitud real.
const VENTA = {
  folio: 'FAC-163',
  total: 200000, cambio: 0, pagoRecibido: 200000, metodo: 'efectivo',
  iva: 30508.47, subtotal: 169491.53,
  items: [
    { produto: { nombre: 'CEMENTO PORTLAND GRIS 42.5KG', porcentajeIva: 18 },
      cantidad: 3, precio: 56497.18, descuentoMonto: 0 },
  ],
  tipoNcf: 'E32',
  encf: 'E320000000719',
  securityCode: 'fkv1cT',
  ecfFecha: '25-08-2026 11:19:39',
  fechaEmision: '25/08/2026', horaEmision: '11:19:38',
  cajero: 'Yaribel Altagracia',
  empresaNombreComercial: 'MULTISERVICIOS HI GLOBAL SRL',
  empresaRnc: '132716507',
  empresaDireccion: 'C/ Francisco Caamaño 14, Progreso',
  empresaTelefono: '829-562-4199',
};

const ESCENARIOS = [
  ['venta simple',            {}],
  ['comprador con RNC',       { rncComprador: '101010101', razonSocial: 'CONSTRUCTORA DEL ESTE SRL' }],
  ['pago mixto y propina',    { propina: 18000, metodo: 'tarjeta',
                                formasPago: [{ tipo: 1, monto: 100000 }, { tipo: 3, monto: 118000 }] }],
  ['con cambio',              { cambio: 31000, pagoRecibido: 231000 }],
  ['crédito a 30 días',       { metodo: 'credito', diasCredito: 30 }],
  ['descuento global',        { descuentoGlobal: 20000, descuentoGlobalFinal: 23600 }],
  ['E44 zona franca',         { tipoNcf: 'E44', iva: 0 }],
  ['nota de crédito E34',     { tipoNcf: 'E34', facturaOriginalFolio: 'FAC-000162',
                                ncfOriginal: 'E320000000700', codigoModificacion: '3',
                                descripcionMotivo: 'Devolución parcial de mercancía' }],
  ['dos tasas de ITBIS',      { items: [VENTA.items[0],
                                { produto: { nombre: 'AGUA PURIFICADA 5GL', porcentajeIva: 16 },
                                  cantidad: 2, precio: 12500, descuentoMonto: 0 }] }],
  ['e-CF pendiente',          { ecfPendiente: true }],
  ['balanza por peso',        { items: [{ ...VENTA.items[0], esBalanza: true,
                                balanzaUnidad: 'KG', cantidad: 12.5 }] }],
  ['sucursal y módulo',       { sucursalNombre: 'Sucursal Progreso', modoContexto: 'restaurante' }],
];

/** Extrae de un HTML de ticket las líneas tal como se imprimen. */
function lineasDelTicket(html) {
  const cuerpo = html
    .replace(/[\s\S]*?<body[^>]*>/, '')
    .replace(/<\/body>[\s\S]*/, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<script>[\s\S]*?<\/script>/g, '');
  const out = [];
  // Cada <div> de primer nivel es una línea. Los que llevan dos <span> son
  // renglones emparejados: su ancho impreso es izquierda + separación + derecha.
  const re = /<div([^>]*)>([\s\S]*?)<\/div>\s*(?=<div|$)/g;
  let m;
  while ((m = re.exec(cuerpo)) !== null) {
    const attrs = m[1], dentro = m[2];
    if (/class="(line|dbl)"/.test(attrs)) continue;
    if (/<img/.test(dentro)) continue;
    const spans = [...dentro.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(x => x[1]);
    if (spans.length >= 2) {
      out.push({ tipo: 'par', izq: spans[0], der: spans[1],
                 texto: spans[0] + ' ' + spans[1], ancho: spans[0].length + 1 + spans[1].length });
    } else {
      const t = dentro.replace(/<[^>]*>/g, '').trim();
      if (t) out.push({ tipo: 'linea', texto: t, ancho: t.length });
    }
  }
  return out;
}

const desescapar = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#9888;/g, '!');

// ── Verificación ─────────────────────────────────────────────────────────────
for (const tipoImpresora of ['58mm', '80mm']) {
  const cols = capacidadLinea(tipoImpresora);
  console.log(`\n── ${tipoImpresora} (${cols} caracteres por línea) ──`);

  for (const [nombre, extra] of ESCENARIOS) {
    const venta = { ...VENTA, ...extra };
    const html  = buildReciboTermicoHTML(venta, null, {
      formato: 'compacto', tipoImpresora, mostrarEcf: true,
      logoAlturaMm: 0, soloVista: true, variasSucursales: true,
      politicaDev: 'No se aceptan devoluciones pasados 30 días',
      mensajeTicket: 'Gracias por preferirnos',
    });
    const lineas = lineasDelTicket(html).map(l => ({ ...l, texto: desescapar(l.texto) }));

    // 1. Ningún renglón emparejado se pasa del ancho.
    const anchos = lineas.filter(l => l.tipo === 'par' && l.ancho > cols);
    ok(`${nombre} — ningún par excede ${cols} caracteres`, anchos.length === 0,
       anchos.map(l => `${l.ancho}: "${l.texto}"`).join('\n      '));

    // 2. Ningún campo fiscal comparte renglón.
    const FISCAL = [/e-NCF/, /Cod\.Seg\./, /^RNC /, /Subtotal/, /ITBIS/, /Base imponible/, /Firma DGII/];
    const pares  = lineas.filter(l => l.tipo === 'par');
    const compartidos = pares.filter(l => FISCAL.some(re => re.test(desescapar(l.izq)) || re.test(desescapar(l.der))));
    ok(`${nombre} — ningún campo fiscal emparejado`, compartidos.length === 0,
       compartidos.map(l => `"${l.texto}"`).join('\n      '));

    // 3. Los valores fiscales aparecen enteros.
    const plano = lineas.map(l => l.texto).join('\n');
    const exigibles = [
      ['e-NCF', venta.ecfPendiente ? null : venta.encf],
      ['código de seguridad', venta.ecfPendiente ? null : venta.securityCode],
      ['RNC emisor', venta.empresaRnc],
      ['RNC comprador', extra.rncComprador ?? null],
      ['e-NCF modificado', extra.ncfOriginal ?? null],
    ].filter(([, v]) => v);
    const faltan = exigibles.filter(([, v]) => !plano.includes(v));
    ok(`${nombre} — valores fiscales completos`, faltan.length === 0,
       faltan.map(([k, v]) => `${k}: falta "${v}"`).join('\n      '));

    // 4. Ninguna línea acaba en un separador colgando.
    const colgando = lineas.filter(l => /[-·,;]$/.test(l.texto.trim()));
    ok(`${nombre} — ningún separador al final de línea`, colgando.length === 0,
       colgando.map(l => `"${l.texto}"`).join('\n      '));

    // 5. Sin marcas de recorte. El '…' del NOMBRE DEL PRODUCTO es legítimo: ahí
    //    el recorte es deliberado, el importe va completo al lado y el detalle
    //    de la línea siguiente lleva cantidad y precio unitario. Cualquier otra
    //    marca de recorte es un dato mutilado.
    const nombres = venta.items.map(i => i.produto.nombre);
    const esNombreRecortado = (t) => nombres.some(n => t.startsWith(n.slice(0, 8)));
    const recortadas = lineas.filter(l =>
      (l.texto.includes('…') || /[^\s]>$/.test(l.texto)) && !esNombreRecortado(l.texto));
    ok(`${nombre} — sin marcas de recorte`, recortadas.length === 0,
       recortadas.map(l => `"${l.texto}"`).join('\n      '));
  }
}

console.log(`\n${fallos === 0 ? '✅' : '❌'} ${total - fallos}/${total} comprobaciones`);
process.exit(fallos === 0 ? 0 : 1);
