import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ColegiaturaService } from './colegiatura.service';

/**
 * Contrato: upsertPlan() debe incluir "nombre" en el INSERT a
 * ed_planes_pago — es VARCHAR(150) NOT NULL sin default, y el formulario
 * del frontend no lo pide (piensa el plan como "de este estudiante", sin
 * nombre propio). Sin esto, cada intento de crear un plan nuevo revienta
 * con 23502 (not-null violation). No es uno de los 26 identificadores del
 * mapeo original — se encontró al verificar que colegiatura.service.ts de
 * verdad estuviera sano, como reportó el inventario previo.
 *
 * Nota: a diferencia de los demás -sql.spec.ts de este módulo, aquí no hay
 * capa EXPLAIN adicional — EXPLAIN sólo planea la sentencia y no llega a
 * evaluar restricciones NOT NULL (esas se comprueban al ejecutar), así que
 * no distinguiría el INSERT roto del corregido. La capa estática (estas
 * pruebas) es la que de verdad protege este caso.
 */
describe('SQL crudo de colegiatura.service.ts — upsertPlan()', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('colegiatura.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('el INSERT incluye la columna "nombre"', () => {
    const b = bloque('async upsertPlan(', 'async generarCargos(');
    expect(b).toMatch(/INSERT INTO ed_planes_pago \(\s*"empresaId", nombre,/);
    expect(b).toContain('[empresaId, nombre, dto.estudianteId, dto.anioEscolarId,');
  });

  it('genera un nombre por defecto cuando el caller no manda uno (el frontend no lo pide)', () => {
    const b = bloque('async upsertPlan(', 'async generarCargos(');
    expect(b).toContain('dto.nombre ?? await this.nombrePlanPorDefecto(');
    expect(b).toContain('private async nombrePlanPorDefecto(');
  });
});

/**
 * Contrato: los tres caminos que crean filas en ed_cargos (generarCargos,
 * generarMatricula, addCargo) deben incluir "montoOriginal" — es
 * NOT NULL desde la migración base y ninguno la llenaba: cada INSERT
 * reventaba con 23502 (not-null violation), así que ningún cargo se podía
 * crear por ningún camino (confirmado en vivo contra hicloud_test,
 * 2026-09-14, antes de este fix).
 *
 * Además, el modelo de dinero de ed_cargos quedó reconciliado: "monto"
 * (columna simplificada de FixColegiaturaSchema, sin relación con
 * montoOriginal) se eliminó — los tres caminos escriben ahora
 * montoOriginal/descuento/montoTotal/montoPagado/saldoPendiente, y
 * registrarPago() es el ÚNICO punto que toca montoPagado/saldoPendiente/
 * estado, con bloqueo pesimista (FOR UPDATE) para que dos pagos
 * concurrentes sobre el mismo cargo no se pisen.
 */
describe('SQL crudo de colegiatura.service.ts — creación de ed_cargos (modelo de dinero)', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('colegiatura.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('generarCargos() escribe montoOriginal/descuento/montoTotal/saldoPendiente, no "monto"', () => {
    const b = bloque('async generarCargos(', 'async generarMatricula(');
    expect(b).toContain('"montoOriginal"');
    expect(b).toContain('"montoTotal"');
    expect(b).toContain('"saldoPendiente"');
    expect(b).not.toMatch(/INSERT INTO ed_cargos \([^)]*[^"]monto,/);
  });

  it('generarMatricula() escribe montoOriginal/montoTotal/saldoPendiente sin aplicar descuento', () => {
    const b = bloque('async generarMatricula(', '// ── Cargos');
    expect(b).toContain('"montoOriginal"');
    expect(b).toContain('"montoTotal"');
    expect(b).not.toMatch(/INSERT INTO ed_cargos \([^)]*[^"]monto,/);
  });

  it('addCargo() acepta montoOriginal/descuento del DTO y calcula montoTotal', () => {
    const b = bloque('async addCargo(', 'async updateCargo(');
    expect(b).toContain('Number(dto.montoOriginal)');
    expect(b).toContain('Number(dto.descuento ?? 0)');
    expect(b).not.toMatch(/INSERT INTO ed_cargos \([^)]*[^"]monto,/);
  });

  it('updateCargo() no permite editar estado/montoPagado/saldoPendiente y recalcula montoTotal bajo FOR UPDATE', () => {
    const b = bloque('async updateCargo(', 'async listPagos(');
    expect(b).toContain('FOR UPDATE');
    expect(b).toContain("['descripcion', 'montoOriginal', 'descuento', 'fechaVencimiento']");
    expect(b).not.toContain("'estado'");
    expect(b).not.toContain("'montoPagado'");
    expect(b).not.toContain("'saldoPendiente'");
  });

  it('registrarPago() usa FOR UPDATE y escribe montoPagado/saldoPendiente/estado en un único UPDATE', () => {
    const b = bloque('async registrarPago(', 'async resumenFinanciero(');
    expect(b).toContain('FOR UPDATE');
    expect(b).toMatch(/UPDATE ed_cargos SET "montoPagado" = \$1, "saldoPendiente" = \$2, estado = \$3/);
    // ed_pagos."montoPagado" es NOT NULL desde la migración base — mismo
    // patrón de columna gemela que montoOriginal en ed_cargos.
    expect(b).toContain('"montoPagado",monto');
  });

  it('listPlanes()/resumenFinanciero() ya no usan c.monto (columna eliminada)', () => {
    const listPlanes = bloque('async listPlanes(', 'async upsertPlan(');
    const resumen = bloque('async resumenFinanciero(', '}\n}');
    expect(listPlanes).not.toContain('c.monto');
    expect(resumen).not.toContain('c.monto');
    expect(listPlanes).toContain('c."saldoPendiente"');
    expect(resumen).toContain('c."saldoPendiente"');
    expect(resumen).toContain('c."montoPagado"');
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('ed_planes_pago — INSERT real contra Postgres (con ROLLBACK)', () => {
  let dataSource: DataSource;

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
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('el INSERT con "nombre" satisface el NOT NULL (se ejecuta dentro de una transacción que siempre hace ROLLBACK)', async () => {
    // "nombre" es NOT NULL — EXPLAIN no lo comprobaría (es una restricción de
    // ejecución, no de plan), así que aquí sí se ejecuta de verdad, pero
    // dentro de una transacción que jamás se confirma: no queda ninguna fila,
    // ni siquiera si esto corriera contra una base compartida.
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const rows = await qr.query(
        `INSERT INTO ed_planes_pago (
           "empresaId", nombre, "estudianteId","anioEscolarId","montoColegiatura","montoMatricula","diaCobro",descuento
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [-1, 'Plan de prueba — no persiste', null, null, 100, 0, 5, 0],
      );
      expect(rows.length).toBe(1);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });
});

(TIENE_BD ? describe : describe.skip)('ed_cargos — INSERT real contra Postgres (con ROLLBACK)', () => {
  let dataSource: DataSource;

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
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('el INSERT con el modelo reconciliado satisface los NOT NULL (transacción con ROLLBACK)', async () => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [est] = await qr.query(
        `INSERT INTO ed_estudiantes ("empresaId", nombres, apellidos) VALUES (-1, 'Prueba', 'MontoOriginal') RETURNING id`,
      );
      const rows = await qr.query(
        `INSERT INTO ed_cargos (
           "empresaId","estudianteId","planPagoId",tipo,descripcion,
           "montoOriginal",descuento,"montoTotal","montoPagado","saldoPendiente",
           "fechaVencimiento",estado,mes,anio
         ) VALUES ($1,$2,$3,'colegiatura',$4,$5,$6,$7,0,$7,$8,'pendiente',$9,$10) RETURNING id`,
        [-1, est.id, null, 'Cargo de prueba — no persiste', 5000, 500, 4500, '2026-08-05', 8, 2026],
      );
      expect(rows.length).toBe(1);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });
});

/**
 * Verificación de punta a punta contra Postgres real, usando el service de
 * verdad (no SQL a mano): plan → cargos → pago parcial → segundo parcial →
 * pago final, y dos pagos concurrentes sobre el mismo cargo para probar
 * el bloqueo pesimista. No usa ROLLBACK — el service abre sus propias
 * transacciones internamente (this.ds.transaction en registrarPago/
 * updateCargo), así que en vez de envolver todo en una transacción externa
 * se escribe con un empresaId centinela y se limpia al final.
 */
(TIENE_BD ? describe : describe.skip)('colegiatura — flujo real de pagos contra Postgres (con limpieza al final)', () => {
  let dataSource: DataSource;
  const EMPRESA = -777;
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
      `INSERT INTO ed_estudiantes ("empresaId", nombres, apellidos) VALUES ($1, 'Prueba', 'FlujoPagos') RETURNING id`,
      [EMPRESA],
    );
    estudianteId = est.id;
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM ed_pagos WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_cargos WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_planes_pago WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_estudiantes WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource?.destroy();
  });

  it('plan → cargos → pago parcial → segundo parcial → pago final: estados y saldos cuadran', async () => {
    const svc = new ColegiaturaService(dataSource);
    const plan = await svc.upsertPlan(EMPRESA, {
      estudianteId, anioEscolarId: null, montoColegiatura: 1000, descuento: 10,
    });
    const { created } = await svc.generarCargos(EMPRESA, plan.id, [8], 2099);
    expect(created).toBe(1);
    const [cargo] = await dataSource.query(
      `SELECT * FROM ed_cargos WHERE "planPagoId" = $1 AND mes = 8 AND anio = 2099`, [plan.id],
    );
    expect(Number(cargo.montoTotal)).toBeCloseTo(900, 2); // 1000 - 10%

    await svc.registrarPago(EMPRESA, { cargoId: cargo.id, monto: 300 });
    let [c] = await dataSource.query(`SELECT * FROM ed_cargos WHERE id = $1`, [cargo.id]);
    expect(c.estado).toBe('parcial');
    expect(Number(c.montoPagado)).toBeCloseTo(300, 2);
    expect(Number(c.saldoPendiente)).toBeCloseTo(600, 2);

    await svc.registrarPago(EMPRESA, { cargoId: cargo.id, monto: 200 });
    [c] = await dataSource.query(`SELECT * FROM ed_cargos WHERE id = $1`, [cargo.id]);
    expect(c.estado).toBe('parcial');
    expect(Number(c.montoPagado)).toBeCloseTo(500, 2);
    expect(Number(c.saldoPendiente)).toBeCloseTo(400, 2);

    await svc.registrarPago(EMPRESA, { cargoId: cargo.id, monto: 400 });
    [c] = await dataSource.query(`SELECT * FROM ed_cargos WHERE id = $1`, [cargo.id]);
    expect(c.estado).toBe('pagado');
    expect(Number(c.saldoPendiente)).toBe(0);
  });

  it('dos pagos concurrentes sobre el mismo cargo no descuadran el saldo (bloqueo pesimista)', async () => {
    const svc = new ColegiaturaService(dataSource);
    const plan = await svc.upsertPlan(EMPRESA, {
      estudianteId, anioEscolarId: null, montoColegiatura: 1000, descuento: 0,
    });
    await svc.generarCargos(EMPRESA, plan.id, [9], 2099);
    const [cargo] = await dataSource.query(
      `SELECT * FROM ed_cargos WHERE "planPagoId" = $1 AND mes = 9 AND anio = 2099`, [plan.id],
    );

    await Promise.all([
      svc.registrarPago(EMPRESA, { cargoId: cargo.id, monto: 300 }),
      svc.registrarPago(EMPRESA, { cargoId: cargo.id, monto: 250 }),
    ]);

    const [c] = await dataSource.query(`SELECT * FROM ed_cargos WHERE id = $1`, [cargo.id]);
    expect(Number(c.montoPagado)).toBeCloseTo(550, 2);
    const [{ n }] = await dataSource.query(`SELECT COUNT(*)::int AS n FROM ed_pagos WHERE "cargoId" = $1`, [cargo.id]);
    expect(n).toBe(2);
  });
});
