#!/usr/bin/env node
/**
 * COSTO DE VENTA — Fase 1 de AVCO: seed retroactivo de producto.costoPromedio.
 *
 * Recalcula costoPromedio DESDE CERO, reproduciendo la fórmula AVCO real
 * (ValoracionStockService.actualizarCostoPromedio) sobre todo el historial de
 * compra_detalles de compras RECIBIDAS (estado IN recibida/recibida_parcial/
 * pagada), en orden cronológico, producto por producto. Es un REEMPLAZO
 * completo del valor final, no un ajuste incremental — por eso es idempotente:
 * correrlo dos veces da el mismo resultado.
 *
 * Alcance deliberado — SOLO compras, y SOLO escribe productos en 0:
 *   AVCO en producción solo se actualiza desde compras.service.ts (2 sitios,
 *   confirmado por grep — ningún otro módulo llama actualizarCostoPromedio).
 *   Pero el stock de un producto SÍ puede moverse por otros caminos que no
 *   pasan por ahí (POST /inventario/entrada, alta rápida de producto, ajustes
 *   de conteo) — esos NO tocan costoPromedio en el código actual, pero
 *   verificado contra un backup real (empresa 52, "REPSOL 4T 20W50 RIDER TOWN
 *   MINERAL", 2026-09-20): una sola Compra de 12 unidades a 288.14 (stockAntes
 *   0 → debería reemplazar limpio) y sin embargo costoPromedio real = 144.07,
 *   exactamente la mitad. El único movimiento que explica la dilución es una
 *   segunda entrada de 12 unidades con motivo "PRODUCTO NUEVO" — ese string
 *   no existe en ningún archivo del backend actual (probablemente una
 *   intervención manual o una ruta ya removida), y movimientos_inventario NO
 *   guarda costo, así que su aporte a la fórmula real es irreconstruible
 *   desde aquí. El replay (288.14 en este caso) es la respuesta correcta a
 *   "qué habría dado AVCO si el histórico fueran solo compras" — NO es
 *   necesariamente el costoPromedio correcto de hoy si hubo entradas fuera de
 *   Compras en medio. Por eso este seed compara el replay contra el valor
 *   actual (bucket "DIFIERE" en el reporte) pero SOLO escribe el bucket
 *   "pasarían de 0 a un costo real": ahí no hay ningún número que perder —
 *   un producto en 0 no tiene señal previa, cualquier historial de compras
 *   real es una mejora estricta. Un producto que YA tiene costoPromedio > 0
 *   nunca se toca, coincida o no con el replay — reconciliar esos es un
 *   problema distinto (Fase 2, pendiente de decidir), no este seed.
 *
 * Compras excluidas del replay:
 *   - No recibidas (borrador/enviada): nunca entraron a inventario.
 *   - Canceladas: si habían sido recibidas y luego se cancelaron, el stock ya
 *     se revirtió (registrarDevolucion) — incluir su costo sin la cantidad
 *     de vuelta distorsionaría el promedio. Filtrar por estado ACTUAL ya las
 *     excluye siempre, sin importar si pasaron por 'recibida' antes.
 *
 * Cantidad que entró a inventario por línea:
 *   - compra.estado = 'recibida_parcial' → cantidadRecibida (lo que ya entró).
 *   - cualquier otro estado recibido     → cantidadTotal (entrada completa;
 *     cambiarEstado(RECIBIDA) nunca toca cantidadRecibida, solo recibir() lo
 *     hace, así que cantidadRecibida no es confiable fuera de 'recibida_parcial').
 *
 * Costo por línea: costoUnitarioRealDOP ?? costoUnitarioReal (fallback igual
 * al de compras.service.ts) + costoImportacionUnitario (ya prorrateado y
 * persistido — no hace falta releer gastos_importacion). Las 290 compras de
 * hoy están en DOP, así que el fallback es un no-op; queda listo para cuando
 * haya compras en moneda extranjera.
 *
 * NUNCA pone en 0 un producto sin historial de compras — un producto sin
 * ninguna compra recibida se DEJA TAL CUAL (si tenía un costo manual vivo sin
 * Compra después, este seed no lo toca; "arreglar" el hueco de AVCO no debe
 * borrar el único costo que ese producto sí tenía).
 *
 * Uso:
 *   node scripts/seed-avco-costo-promedio.js                  # dry-run, TODAS las empresas (resumen para elegir canario)
 *   node scripts/seed-avco-costo-promedio.js --empresa 61     # dry-run detallado de una empresa
 *   node scripts/seed-avco-costo-promedio.js --aplicar --empresa 61   # escribe, SOLO esa empresa
 *
 * --aplicar SIN --empresa se rechaza: la ejecución es empresa por empresa,
 * nunca todas de una vez.
 */
require('dotenv').config();
const { Client } = require('pg');

const APLICAR    = process.argv.includes('--aplicar');
const empresaArg = (() => {
  const i = process.argv.indexOf('--empresa');
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();

const ok   = m => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad  = m => { console.log('  \x1b[31m✗\x1b[0m ' + m); process.exitCode = 1; };
const warn = m => console.log('  \x1b[33m⚠\x1b[0m ' + m);
const info = m => console.log('  · ' + m);
const rd   = n => 'RD$' + Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });

const SQL_DETALLES_RECIBIDOS = `
  SELECT cd.id, cd."productoId", cd.cantidad, cd."cantidadBonificada",
         cd."cantidadTotal", cd."cantidadRecibida",
         cd."costoUnitarioReal", cd."costoUnitarioRealDOP", cd."costoImportacionUnitario",
         c.id AS "compraId", c.folio, c.fecha, c.estado, c."empresaId"
    FROM compra_detalles cd
    JOIN compras c ON c.id = cd."compraId"
   WHERE c."isActive" = true
     AND c.estado IN ('recibida', 'recibida_parcial', 'pagada')
     AND ($1::int IS NULL OR c."empresaId" = $1)
   ORDER BY c."empresaId", c.fecha ASC, c.id ASC, cd.id ASC`;

/** Réplica exacta de la fórmula de ValoracionStockService.actualizarCostoPromedio(). */
function replayAVCO(detalles) {
  let stockAntes = 0;
  let costoPromedio = 0;
  let tuvoLineaConCosto = false;

  for (const d of detalles) {
    const qty = d.estado === 'recibida_parcial'
      ? Number(d.cantidadRecibida ?? 0)
      : Number(d.cantidadTotal ?? d.cantidad ?? 0);
    if (qty <= 0) continue;

    const costoBase   = Number(d.costoUnitarioRealDOP ?? d.costoUnitarioReal ?? 0);
    const costoImport = Number(d.costoImportacionUnitario ?? 0);
    const costoNuevo  = costoBase + costoImport;

    if (costoNuevo > 0) {
      tuvoLineaConCosto = true;
      costoPromedio = stockAntes <= 0
        ? costoNuevo
        : (stockAntes * costoPromedio + qty * costoNuevo) / (stockAntes + qty);
    }
    stockAntes += qty;
  }

  return { costoPromedio: Number(costoPromedio.toFixed(4)), tuvoLineaConCosto, stockFinal: stockAntes };
}

async function main() {
  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  if (APLICAR && !empresaArg) {
    bad('--aplicar requiere --empresa <id>. La ejecución es empresa por empresa, nunca todas de una vez.');
    process.exit(1);
  }

  await c.connect();
  console.log(`\nSeed AVCO — costoPromedio retroactivo — ${APLICAR ? '\x1b[33mAPLICANDO\x1b[0m' : 'DRY-RUN (no escribe)'}`);
  if (empresaArg) info(`empresa ${empresaArg}`); else info('todas las empresas (resumen)');

  const { rows: detalles } = await c.query(SQL_DETALLES_RECIBIDOS, [empresaArg]);

  if (!detalles.length) {
    ok(empresaArg ? `Empresa ${empresaArg}: sin compras recibidas — nada que sembrar.` : 'Ninguna empresa tiene compras recibidas.');
    await c.end();
    return;
  }

  // ── Agrupar por empresa → producto, en el orden cronológico que ya trae la query ──
  const porEmpresaProducto = new Map(); // empresaId -> Map(productoId -> detalles[])
  for (const d of detalles) {
    if (!porEmpresaProducto.has(d.empresaId)) porEmpresaProducto.set(d.empresaId, new Map());
    const porProducto = porEmpresaProducto.get(d.empresaId);
    if (!porProducto.has(d.productoId)) porProducto.set(d.productoId, []);
    porProducto.get(d.productoId).push(d);
  }

  // ── Costo actual de cada producto tocado, para comparar contra el replay ──
  const todosLosProductoIds = [...new Set(detalles.map(d => d.productoId))];
  const { rows: productosActuales } = await c.query(
    `SELECT id, "empresaId", nombre, "costoPromedio", "costoManualEn"
       FROM productos WHERE id = ANY($1)`,
    [todosLosProductoIds],
  );
  const actualPorId = new Map(productosActuales.map(p => [p.id, p]));

  // ── Ventas por producto — UNA sola pasada por factura_detalles para todos
  // los productos de todas las empresas, no una consulta por empresa: la
  // tabla no tiene índice sobre productoId y una consulta repetida por
  // empresa multiplicaría el seq scan completo por cada una.
  const ventasPorProducto = new Map(); // productoId -> nLineas
  {
    const { rows } = await c.query(`
      SELECT fd."productoId" AS "productoId", COUNT(*)::int AS n
        FROM factura_detalles fd
        JOIN facturas f ON f.id = fd."facturaId"
       WHERE f."isActive" = true AND f.estado IN ('emitida','pagada')
         AND fd."productoId" = ANY($1::int[])
       GROUP BY fd."productoId"`,
      [todosLosProductoIds],
    );
    for (const r of rows) ventasPorProducto.set(r.productoId, r.n);
  }

  for (const [empresaId, porProducto] of porEmpresaProducto) {
    const resultados = [];
    for (const [productoId, lineas] of porProducto) {
      const replay  = replayAVCO(lineas);
      const actual  = actualPorId.get(productoId);
      const costoActual = Number(actual?.costoPromedio ?? 0);
      resultados.push({
        productoId, nombre: actual?.nombre ?? `#${productoId}`,
        costoActual, costoReplay: replay.costoPromedio,
        tuvoLineaConCosto: replay.tuvoLineaConCosto,
        costoManualEn: actual?.costoManualEn ?? null,
        nLineas: lineas.length,
      });
    }

    const pasanA_costoReal = resultados.filter(r => r.costoActual === 0 && r.costoReplay > 0);
    const quedanEnCero     = resultados.filter(r => r.costoReplay === 0);
    const coinciden        = resultados.filter(r => r.costoActual > 0 && Math.abs(r.costoActual - r.costoReplay) < 0.0001);
    const difieren         = resultados.filter(r => r.costoActual > 0 && Math.abs(r.costoActual - r.costoReplay) >= 0.0001);

    // "quedan en cero" con al menos una línea de costo>0 (bonificación pura en TODAS
    // sus compras) vs sin ninguna línea con costo — el usuario pidió el total, pero
    // separarlo ayuda a decidir si hace falta revisar algo más.
    const enCeroSinLineaConCosto = quedanEnCero.filter(r => !r.tuvoLineaConCosto);
    const enCeroConLineaPeroCero = quedanEnCero.filter(r => r.tuvoLineaConCosto); // caso raro: costo real calculado da 0.0000

    // Ventas registradas sobre los que quedan en cero — el hueco que sigue
    // vivo. ventasPorProducto ya viene de UNA sola consulta batch (ver arriba).
    const conVentas = quedanEnCero.filter(r => ventasPorProducto.has(r.productoId));
    const ventasSobreCero = {
      productos: conVentas.length,
      lineas: conVentas.reduce((s, r) => s + ventasPorProducto.get(r.productoId), 0),
    };

    const montoTotalCompras = detalles
      .filter(d => d.empresaId === empresaId)
      .reduce((s, d) => s + Number(d.costoUnitarioRealDOP ?? d.costoUnitarioReal ?? 0) * Number(d.estado === 'recibida_parcial' ? d.cantidadRecibida ?? 0 : d.cantidadTotal ?? d.cantidad ?? 0), 0);

    console.log(`\n── Empresa ${empresaId} ──`);
    info(`${porProducto.size} producto(s) con compra recibida · ${detalles.filter(d => d.empresaId === empresaId).length} línea(s) de compra · ${rd(montoTotalCompras)} en costo total recibido`);
    info(`pasarían de 0 a un costo real: ${pasanA_costoReal.length}`);
    info(`quedarían en 0: ${quedanEnCero.length} (${enCeroSinLineaConCosto.length} nunca con línea de costo real; ${enCeroConLineaPeroCero.length} con línea de costo pero el promedio da 0.0000)`);
    info(`de esos en 0, con ventas registradas: ${ventasSobreCero.productos} producto(s), ${ventasSobreCero.lineas} línea(s) de factura — el hueco que sigue vivo`);
    if (coinciden.length) info(`ya tenían costo y coinciden con el replay: ${coinciden.length}`);
    if (difieren.length) {
      warn(`ya tenían costo pero DIFIEREN del replay: ${difieren.length} — probable ajuste manual mezclado por AVCO antes de una compra con stock>0`);
      console.table(difieren.slice(0, 10).map(r => ({
        producto: r.nombre, actual: r.costoActual.toFixed(4), replay: r.costoReplay.toFixed(4),
        'ajuste manual el': r.costoManualEn ? String(r.costoManualEn).slice(0, 10) : '—',
      })));
      if (difieren.length > 10) info(`… y ${difieren.length - 10} más`);
    }

    if (empresaArg) {
      if (pasanA_costoReal.length) {
        console.log('\n  Pasarían de 0 a un costo real:');
        console.table(pasanA_costoReal.map(r => ({ producto: r.nombre, id: r.productoId, 'costo nuevo': r.costoReplay.toFixed(4), 'líneas': r.nLineas })));
      }
      if (enCeroSinLineaConCosto.length) {
        console.log('\n  Quedan en 0 (nunca con línea de costo real — bonificación pura en todas sus compras):');
        console.table(enCeroSinLineaConCosto.slice(0, 30).map(r => ({ producto: r.nombre, id: r.productoId, 'líneas': r.nLineas })));
        if (enCeroSinLineaConCosto.length > 30) info(`… y ${enCeroSinLineaConCosto.length - 30} más`);
      }
    }

    // ── Aplicar ──────────────────────────────────────────────────────────────
    //
    // SOLO se escribe el bucket "pasarían de 0 a un costo real" — nunca un
    // producto que YA tiene costoPromedio > 0, aunque el replay haya
    // calculado un valor distinto. El dry-run contra el backup real (empresa
    // 52, "REPSOL 4T 20W50...") probó por qué: ese producto tenía UNA sola
    // compra (288.14, stockAntes=0 → debería reemplazar limpio) pero su
    // costoPromedio real es 144.07 — exactamente la mitad. La única
    // explicación consistente con los movimientos_inventario reales es una
    // segunda entrada de 12 unidades (motivo "PRODUCTO NUEVO", sin
    // referencia a ninguna compra, y ese string NO existe en el código
    // actual) que diluyó el promedio. Ese evento no es reconstruible desde
    // compra_detalles — replayAVCO() no puede verlo, así que su "replay"
    // (288.14) es la respuesta correcta a la pregunta "qué habría dado AVCO
    // si el histórico fuera solo compras", no "qué costoPromedio es
    // correcto para este producto hoy". Sobrescribir un valor que YA existe
    // con esa respuesta parcial sería reemplazar un número real (aunque de
    // origen incierto) por uno más simple pero no necesariamente más
    // correcto. Fase 1 es SOLO llenar el hueco de los productos en 0 — sin
    // ninguna señal que perder ahí.
    if (APLICAR && Number(empresaId) === Number(empresaArg)) {
      const aEscribir = pasanA_costoReal;
      console.log(`\n── Aplicando empresa ${empresaId} ──`);
      await c.query('BEGIN');
      try {
        let escritos = 0;
        for (const r of aEscribir) {
          const { rowCount } = await c.query(
            `UPDATE productos SET "costoPromedio" = $1 WHERE id = $2 AND "empresaId" = $3 AND "costoPromedio" = 0`,
            [r.costoReplay, r.productoId, empresaId],
          );
          escritos += rowCount;
        }
        await c.query('COMMIT');
        ok(`${escritos} producto(s) actualizados (de 0 a un costo real).`);
        info(`${difieren.length} producto(s) con costo ya existente que DIFIERE del replay NO se tocaron — decisión explícita, ver comentario en el script.`);
        info(`${enCeroSinLineaConCosto.length + enCeroConLineaPeroCero.length} producto(s) sin línea de costo real NO se tocaron (habrían quedado en 0).`);
      } catch (e) {
        await c.query('ROLLBACK');
        bad('Error, nada se aplicó en esta empresa: ' + e.message);
      }
    }
  }

  if (!APLICAR) {
    console.log('\n' + '─'.repeat(60));
    info('Dry-run. Nada se ha modificado.');
    info('Para aplicar a una empresa: node scripts/seed-avco-costo-promedio.js --aplicar --empresa <id>');
  }

  await c.end();
}

module.exports = { replayAVCO };

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
