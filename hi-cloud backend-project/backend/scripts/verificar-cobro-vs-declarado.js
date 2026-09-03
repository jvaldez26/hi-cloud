#!/usr/bin/env node
/**
 * ¿El total que cobró la caja coincide con el de la factura emitida?
 *
 * Para cada factura del POS con descuento contrasta TRES números:
 *
 *   cobrado     suma de formasPago[].monto — lo aplicado a la venta
 *   declarado   facturas.total — lo que se guardó y se declaró a la DGII
 *   recalculado el total recomputado desde los detalles, con la misma
 *               aritmética de common/calculo/descuento-documento.ts
 *
 * Los tres tienen que ser el mismo número. Que `cobrado` y `declarado` cuadren
 * lo garantiza `validarFormasPago` al emitir; lo que este script añade es el
 * tercero, que comprueba el CÁLCULO y no solo la validación.
 *
 * SOLO LECTURA. No escribe nada.
 *
 *   node scripts/verificar-cobro-vs-declarado.js              últimos 30 días
 *   node scripts/verificar-cobro-vs-declarado.js --dias=1     solo hoy y ayer
 *   node scripts/verificar-cobro-vs-declarado.js FAC-172      una factura
 *
 * Sale con código 1 si alguna se desvía más de un céntimo, para poder
 * encadenarlo si algún día hace falta.
 *
 * ── Cómo leer las desviaciones ─────────────────────────────────────────────
 *
 * −0.01 en `recalculado` con `cobrado` cuadrando: no es un error de cálculo.
 * `factura_detalles.precioUnitario` y `precioOriginal` son NUMERIC(12,2) y el
 * POS envía 4 decimales, así que el input reconstruido desde la base ya no es
 * el que entró al cálculo. Está anotado en docs/estado-actual.md.
 *
 * Desviaciones grandes en facturas anteriores al 2026-08-11 son de la fórmula
 * previa a `24883a94` (el fix del doble-descuento). Son histórico: sus importes
 * están emitidos y declarados, y nada los recalcula.
 */
require('dotenv').config();
const { Client } = require('pg');

const r2 = n => Math.round(n * 100) / 100;

/** Copia de calcularTotalesConDescuento — convenciones A y B */
function calcularTotal(lineas, dg = {}) {
  const calc = [];
  let subtotalBase = 0;
  for (const it of lineas) {
    const dm = Number(it.descuentoMonto ?? 0);
    const dp = Number(it.descuentoPct ?? 0);
    let precioRaw, descLinea = 0;
    if (it.precioOriginal != null && dm > 0) {
      precioRaw = Number(it.precioOriginal) * it.cantidad;
      descLinea = r2(dm * it.cantidad);
    } else {
      precioRaw = Number(it.precioUnitario) * it.cantidad;
      const bruto = r2(precioRaw);
      if (dm > 0) descLinea = r2(Math.min(dm, bruto));
      else if (dp > 0) descLinea = r2(bruto * (dp / 100));
    }
    const sub = r2(r2(precioRaw) - descLinea);
    subtotalBase += sub;
    calc.push({ subtotal: sub, baseRaw: precioRaw - descLinea, pct: Number(it.porcentajeIva) });
  }
  subtotalBase = r2(subtotalBase);

  let descGeneral = 0;
  const v = Number(dg.valor ?? 0);
  if (dg.tipo === 'monto' && v > 0) descGeneral = r2(Math.min(v, subtotalBase));
  else if (dg.tipo === 'porcentaje' && v > 0) descGeneral = r2(subtotalBase * (v / 100));

  let sT = 0, iT = 0;
  for (const x of calc) {
    const prop = subtotalBase > 0 ? r2((x.subtotal / subtotalBase) * descGeneral) : 0;
    const sf = r2(x.subtotal - prop);
    const raw = x.subtotal > 0 ? x.baseRaw * (sf / x.subtotal) : sf;
    sT += sf;
    iT += r2(raw * (x.pct / 100));
  }
  return r2(r2(sT) + r2(iT));
}

(async () => {
  const args  = process.argv.slice(2);
  const folio = args.find(a => !a.startsWith('--'));
  const dias  = Number((args.find(a => a.startsWith('--dias=')) || '').split('=')[1] || 30);

  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  const filtro = folio
    ? `f.folio = $1`
    : `f.notas LIKE 'POS%' AND f."isActive" = true
       AND (f."descuentoGeneralValor" > 0 OR EXISTS (
         SELECT 1 FROM factura_detalles d WHERE d."facturaId" = f.id
           AND (d."descuentoMonto" > 0 OR d."descuentoPct" > 0)))
       AND f.fecha >= CURRENT_DATE - ($1 || ' days')::interval`;

  const facturas = (await c.query(`
    SELECT f.id, f.folio, f.fecha::date AS fecha, f."empresaId", f.estado, f.total,
           f."descuentoGeneralTipo" AS dgt, f."descuentoGeneralValor" AS dgv, f."ecfId",
           (SELECT COALESCE(SUM((p->>'monto')::numeric), 0)
              FROM jsonb_array_elements(f."formasPago") p) AS pagado,
           jsonb_array_length(COALESCE(f."formasPago", '[]'::jsonb)) AS nfp
    FROM facturas f
    WHERE ${filtro}
    ORDER BY f.id DESC LIMIT 60`, [folio ?? String(dias)])).rows;

  if (!facturas.length) {
    console.log(folio ? `No existe ${folio}.` : `Sin facturas del POS con descuento en los últimos ${dias} días.`);
    await c.end();
    return;
  }

  console.log('folio         fecha       emp  estado    | declarado  recalculado    dif |   cobrado    dif | e-CF');
  console.log('─'.repeat(110));

  let desviadasCalculo = 0, desviadasCobro = 0;
  for (const f of facturas) {
    const detalles = (await c.query(`
      SELECT cantidad, "precioUnitario", "precioOriginal", "descuentoPct",
             "descuentoMonto", "porcentajeIva"
      FROM factura_detalles WHERE "facturaId" = $1 ORDER BY id`, [f.id])).rows
      .map(d => ({
        cantidad: +d.cantidad,
        precioUnitario: +d.precioUnitario,
        precioOriginal: d.precioOriginal == null ? null : +d.precioOriginal,
        descuentoPct: +d.descuentoPct,
        descuentoMonto: +d.descuentoMonto,
        porcentajeIva: +d.porcentajeIva,
      }));

    const recalculado = calcularTotal(detalles, { tipo: f.dgt, valor: f.dgv == null ? null : +f.dgv });
    const difCalculo  = r2(recalculado - +f.total);
    const difCobro    = f.nfp > 0 ? r2(+f.pagado - +f.total) : null;

    if (Math.abs(difCalculo) > 0.011) desviadasCalculo++;
    if (difCobro !== null && Math.abs(difCobro) > 0.011) desviadasCobro++;

    console.log(
      String(f.folio).padEnd(13),
      String(f.fecha).slice(4, 15),
      String(f.empresaId).padStart(3),
      String(f.estado).padEnd(9), '|',
      Number(f.total).toFixed(2).padStart(10),
      recalculado.toFixed(2).padStart(12),
      ((difCalculo >= 0 ? '+' : '') + difCalculo.toFixed(2)).padStart(7), '|',
      f.nfp > 0 ? Number(f.pagado).toFixed(2).padStart(9) : '(sin fp)'.padStart(9),
      (difCobro === null ? '-' : (difCobro >= 0 ? '+' : '') + difCobro.toFixed(2)).padStart(7), '|',
      f.ecfId ?? '-',
    );
  }

  console.log('─'.repeat(110));
  console.log(`${facturas.length} facturas | cálculo desviado: ${desviadasCalculo} | cobrado vs declarado desviado: ${desviadasCobro}`);
  await c.end();

  if (desviadasCalculo || desviadasCobro) process.exit(1);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
