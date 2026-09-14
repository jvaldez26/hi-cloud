import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

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
 */
describe('SQL crudo de colegiatura.service.ts — creación de ed_cargos (montoOriginal)', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('colegiatura.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('generarCargos() incluye "montoOriginal" en el INSERT', () => {
    const b = bloque('async generarCargos(', 'async generarMatricula(');
    expect(b).toMatch(/INSERT INTO ed_cargos \(\s*"empresaId","estudianteId","planPagoId",tipo,descripcion,"montoOriginal",monto,/);
  });

  it('generarMatricula() incluye "montoOriginal" en el INSERT', () => {
    const b = bloque('async generarMatricula(', '// ── Cargos');
    expect(b).toMatch(/INSERT INTO ed_cargos \(\s*"empresaId","estudianteId","planPagoId",tipo,descripcion,"montoOriginal",monto,/);
  });

  it('addCargo() incluye "montoOriginal" en el INSERT', () => {
    const b = bloque('async addCargo(', 'async updateCargo(');
    expect(b).toMatch(/INSERT INTO ed_cargos \(\s*"empresaId","estudianteId","planPagoId",tipo,descripcion,"montoOriginal",monto,/);
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

  it('el INSERT con "montoOriginal" satisface el NOT NULL (transacción con ROLLBACK)', async () => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [est] = await qr.query(
        `INSERT INTO ed_estudiantes ("empresaId", nombres, apellidos) VALUES (-1, 'Prueba', 'MontoOriginal') RETURNING id`,
      );
      const rows = await qr.query(
        `INSERT INTO ed_cargos (
           "empresaId","estudianteId","planPagoId",tipo,descripcion,"montoOriginal",monto,"fechaVencimiento",estado,mes,anio
         ) VALUES ($1,$2,$3,'colegiatura',$4,$5,$6,$7,'pendiente',$8,$9) RETURNING id`,
        [-1, est.id, null, 'Cargo de prueba — no persiste', 5000, 4500, '2026-08-05', 8, 2026],
      );
      expect(rows.length).toBe(1);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });
});
