import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { EdReportesService } from './reportes.service';
import { ColegiaturaService } from '../colegiatura/colegiatura.service';
import { BecasService } from '../becas/becas.service';

/**
 * Incidente 2026-09-17 (Sentry #7738770278, release c3cc4ae, empresa 57):
 * la reconciliación de ed_pagos (migración 1763800000000-ReconciliarEdPagos)
 * eliminó la columna "monto" de ed_pagos — montoPagado quedó como única
 * fuente. El barrido de esa tarea encontró y corrigió dashboard.service.ts y
 * reportes.service.ts::ingresosPorConcepto(), pero se saltó dos sitios más:
 * colegiatura.service.ts::resumenFinanciero() (cobradoMes) y
 * reportes.service.ts::cobrosPeriodo() (columna "real") — los dos seguían
 * haciendo SUM(p.monto) contra una columna que ya no existe. 500 en
 * /educativo/reportes/cartera-colegiatura Y en /educativo/colegiatura/resumen
 * (resumenFinanciero() alimenta ambos) para TODA empresa, siempre — es un
 * error de columna inexistente en el SELECT, no depende de qué filas haya.
 *
 * Por qué no lo atrapó Playwright: reportes.spec.ts sí navega
 * /educativo/reportes y verifica "Cobrado este mes", pero Playwright NO
 * corre en CI (.github/workflows/ci.yml no invoca ningún job de e2e — se
 * corre a mano) y no se volvió a correr tras esa migración. Este archivo es
 * la guarda de reemplazo que SÍ corre en cada push, sin necesitar BD: un
 * regex sobre el código fuente que nunca deja pasar "p.monto" de vuelta a
 * ed_pagos en ningún reporte de este archivo, no solo en el que falló.
 */
describe('SQL crudo de reportes.service.ts — ed_pagos.monto no existe (columna eliminada)', () => {
  const src = () => readFileSync(join(__dirname, 'reportes.service.ts'), 'utf8');

  it('ningún reporte referencia "p.monto" — ed_pagos solo tiene montoPagado', () => {
    const contenido = src();
    // d.monto (ed_pagos_detalle.monto) es una columna real y distinta —
    // el guard es específico al alias de ed_pagos, no a la palabra "monto".
    expect(contenido).not.toMatch(/\bp\.monto\b/);
    expect(contenido).not.toMatch(/\bp\."monto"/);
  });

  it('cobrosPeriodo() usa montoPagado y excluye pagos anulados', () => {
    const s = src();
    const bloque = s.slice(s.indexOf('async cobrosPeriodo('), s.indexOf('async rendimientoAcademico('));
    expect(bloque).toContain('p."montoPagado"');
    expect(bloque).toContain(`p.estado = 'activo'`);
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('reportes — cartera y cobros del período contra Postgres (con limpieza al final)', () => {
  let dataSource: DataSource;
  const EMPRESA = -780;
  let estudianteId: number;

  beforeAll(async () => {
    dataSource = new DataSource({
      type:     'postgres',
      host:     process.env['DB_HOST'],
      port:     Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl:      process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    });
    await dataSource.initialize();
    const [est] = await dataSource.query(
      `INSERT INTO ed_estudiantes ("empresaId", nombres, apellidos) VALUES ($1, 'Prueba', 'ReportesIncidente') RETURNING id`,
      [EMPRESA],
    );
    estudianteId = est.id;
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM ed_pagos_detalle WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_pagos WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_cargos WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_planes_pago WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_estudiantes WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource?.destroy();
  });

  it('carteraColegiatura() y cobrosPeriodo() no revientan y reflejan un pago real del mes', async () => {
    const colegiaturaSvc = new ColegiaturaService(dataSource, new BecasService(dataSource));
    const reportesSvc = new EdReportesService(dataSource, colegiaturaSvc);

    const plan = await colegiaturaSvc.upsertPlan(EMPRESA, {
      estudianteId, anioEscolarId: null, montoColegiatura: 1000, descuento: 0,
    });
    const hoy = new Date();
    await colegiaturaSvc.generarCargos(EMPRESA, plan.id, [hoy.getMonth() + 1], hoy.getFullYear());
    const [cargo] = await dataSource.query(
      `SELECT * FROM ed_cargos WHERE "planPagoId" = $1`, [plan.id],
    );
    await colegiaturaSvc.registrarPago(EMPRESA, { cargoId: cargo.id, monto: 400 });

    // Antes del fix, ambas llamadas tiraban 500 ("column p.monto does not
    // exist") — la prueba real es que esto no lance, no solo el número.
    const cartera = await reportesSvc.carteraColegiatura(EMPRESA);
    expect(Number(cartera.resumen.cobradoMes)).toBeGreaterThanOrEqual(400);

    const cobros = await reportesSvc.cobrosPeriodo(EMPRESA);
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const filaMes = cobros.find((c: any) => c.mes === mesActual);
    expect(filaMes).toBeDefined();
    expect(Number(filaMes!.real)).toBeGreaterThanOrEqual(400);
  });
});
