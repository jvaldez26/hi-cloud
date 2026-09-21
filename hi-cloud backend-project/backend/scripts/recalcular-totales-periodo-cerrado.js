#!/usr/bin/env node
/**
 * P0 (2026-09-21) — periodo_contable.service.ts#cerrar() calculaba los
 * totales del cierre (totalDebitos/totalCreditos/cantidadAsientos) sumando
 * los asientos contabilizados del rango de fechas de TODAS las empresas, no
 * solo la del período — getRawOne() no pasa por ninguna de las dos capas de
 * aislamiento multi-tenant (ver commit d7a30fbd). Cualquier período cerrado
 * ANTES de ese commit puede tener totales contaminados con los asientos de
 * otras empresas en el mismo rango de fechas.
 *
 * Estos totales son informativos — ningún otro módulo los lee para calcular
 * nada (ver auditoría del 2026-09-21): solo se muestran en PeriodoContablePage
 * (columna "Total Débitos"/cantidad, y el card "TOTALES DEL AÑO"). reabrir()
 * tampoco los toca. Aun así, mostrar un número contaminado es un problema en
 * sí mismo, así que este script los recalcula desde cero — SOLO con los
 * asientos de la empresa dueña del período.
 *
 * Uso:
 *   node scripts/recalcular-totales-periodo-cerrado.js                # simulación (no escribe)
 *   node scripts/recalcular-totales-periodo-cerrado.js --empresa 57   # acotado a una empresa
 *   node scripts/recalcular-totales-periodo-cerrado.js --aplicar      # escribe de verdad
 *
 * Sin --aplicar no modifica nada: imprime la comparación y sale.
 * Idempotente: recalcular dos veces seguidas la segunda vez no encuentra diferencias.
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
const info = m => console.log('  · ' + m);
const rd   = n => 'RD$' + Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 });

const SQL_CERRADOS = `
  SELECT id, "empresaId", anio, mes, nombre, "fechaInicio", "fechaFin",
         "totalDebitos", "totalCreditos", "cantidadAsientos"
    FROM periodos_contables
   WHERE estado = 'cerrado'
     AND ($1::int IS NULL OR "empresaId" = $1)
   ORDER BY "empresaId", anio, mes`;

/** Misma agregación que cerrar() ya corregido — filtrada por empresaId. */
const SQL_RECALCULO = `
  SELECT COALESCE(SUM("totalDebe"),  0)::numeric(14,2) AS "totalDebitos",
         COALESCE(SUM("totalHaber"), 0)::numeric(14,2) AS "totalCreditos",
         COUNT(id)::int                                AS "cantidadAsientos"
    FROM asientos_contables
   WHERE "empresaId" = $1
     AND fecha >= $2 AND fecha <= $3
     AND estado = 'contabilizado'`;

(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  console.log(`\nRecálculo de totales de períodos cerrados — ${APLICAR ? '\x1b[33mAPLICANDO\x1b[0m' : 'SIMULACIÓN (no escribe)'}`);
  console.log(`  BD: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}`);
  if (empresaArg) info(`acotado a la empresa ${empresaArg}`);

  const { rows: cerrados } = await c.query(SQL_CERRADOS, [empresaArg]);

  if (!cerrados.length) {
    ok('No hay períodos cerrados en esta base de datos.');
    await c.end();
    return;
  }
  info(`${cerrados.length} período(s) cerrado(s) encontrados — comparando contra la suma real de SU empresa...`);

  const diffs = [];
  for (const p of cerrados) {
    const { rows: [real] } = await c.query(SQL_RECALCULO, [p.empresaId, p.fechaInicio, p.fechaFin]);
    const cambia =
      Number(p.totalDebitos)     !== Number(real.totalDebitos) ||
      Number(p.totalCreditos)    !== Number(real.totalCreditos) ||
      Number(p.cantidadAsientos) !== Number(real.cantidadAsientos);
    if (cambia) diffs.push({ periodo: p, real });
  }

  console.log('\n── Períodos con totales contaminados ──');
  if (!diffs.length) {
    ok('Ninguno. Los totales guardados ya coinciden con la suma real de cada empresa.');
    await c.end();
    return;
  }

  console.table(diffs.map(({ periodo: p, real }) => ({
    id: p.id, empresa: p.empresaId, período: p.nombre,
    'debitos guardado': p.totalDebitos, 'debitos real': real.totalDebitos,
    'creditos guardado': p.totalCreditos, 'creditos real': real.totalCreditos,
    'cant. guardada': p.cantidadAsientos, 'cant. real': real.cantidadAsientos,
  })));
  bad(`${diffs.length} período(s) con totales contaminados por asientos de otra empresa.`);

  if (!APLICAR) {
    console.log('\n' + '─'.repeat(60));
    info('Simulación. Nada se ha modificado.');
    info('Para escribir: node scripts/recalcular-totales-periodo-cerrado.js --aplicar');
    await c.end();
    return;
  }

  console.log('\n── Aplicando ──');
  await c.query('BEGIN');
  try {
    for (const { periodo: p, real } of diffs) {
      await c.query(
        `UPDATE periodos_contables
            SET "totalDebitos" = $2, "totalCreditos" = $3, "cantidadAsientos" = $4
          WHERE id = $1`,
        [p.id, real.totalDebitos, real.totalCreditos, real.cantidadAsientos],
      );
    }
    await c.query('COMMIT');
    ok(`${diffs.length} período(s) recalculado(s).`);
  } catch (e) {
    await c.query('ROLLBACK');
    bad('Error, nada se aplicó: ' + e.message);
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
