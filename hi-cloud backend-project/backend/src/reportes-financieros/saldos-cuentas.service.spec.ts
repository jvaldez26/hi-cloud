/**
 * Regresion P0 — aislamiento multi-tenant del motor de saldos compartido.
 *
 * Balance/Diagnóstico (2026-09-20): SaldosCuentasService reemplaza las dos
 * consultas SQL independientes que antes vivían por separado en
 * balance-comprobacion.service.ts (Balance de Comprobación) y
 * reportes-financieros.service.ts (Balance General/Estado de Resultados) —
 * ver el comentario en saldos-cuentas.service.ts. Esta suite es la
 * cobertura CANÓNICA de aislamiento multi-tenant para ambos motores ahora
 * que comparten una sola función; es equivalente/reemplaza a la que
 * balance-comprobacion.service.spec.ts cubría solo para ese motor.
 *
 * Usa SQL crudo (dataSource.query), que NO pasa por TenantAwareRepository
 * ni por el TenantSubscriber: el filtro por empresaId es responsabilidad
 * explícita de cada query. Tampoco hay RLS en Postgres.
 *
 * COBERTURA — obtenerSaldos():
 * 1. El catálogo de cuentas (cc) va filtrado por empresaId en el WHERE.
 * 2. Los asientos (ac) van filtrados por empresaId dentro del ON del LEFT JOIN.
 * 3. Sin "OR ... IS NULL" que deje pasar huérfanos de otra empresa.
 * 4. Empresas distintas reciben su propio empresaId como parámetro.
 * 5. Fechas parametrizadas, nunca interpoladas.
 *
 * COBERTURA — obtenerAsientosDescuadrados():
 * 6. Filtra por empresaId, sin "OR ... IS NULL".
 * 7. Empresas distintas reciben su propio empresaId.
 *
 * COBERTURA — PASO 0 (2026-09-20), contra Postgres real (requiere BD):
 * 8. Un asiento ANULADO, de OTRA EMPRESA, INACTIVO, o FUERA de la fecha de
 *    corte no contamina la suma de una cuenta que sí tiene movimientos
 *    válidos — bug real encontrado en producción: la suma total de una
 *    empresa (8,920,031.51 debe / 8,920,031.43 haber) no podía cuadrar si
 *    cada asiento, verificado uno por uno, sí cuadraba. Causa: los filtros
 *    de asientos_contables vivían en el ON de un LEFT JOIN, que no los
 *    aplica como filtro real. Un mock de dataSource.query() (como el resto
 *    de este archivo) no puede probar esto — solo demuestra la FORMA del
 *    SQL, no su comportamiento real contra el motor de Postgres.
 */

import { SaldosCuentasService } from './saldos-cuentas.service';
import { DataSource } from 'typeorm';

interface QueryCapturada { sql: string; params: unknown[] }

function makeDataSource(captured: QueryCapturada[]) {
  return {
    query: (sql: string, params: unknown[] = []) => {
      captured.push({ sql, params });
      return Promise.resolve([]);
    },
  } as any;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('SaldosCuentasService — aislamiento multi-tenant', () => {
  describe('obtenerSaldos()', () => {
    it('filtra el catálogo de cuentas (cc) por empresaId en el WHERE exterior', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, undefined, '2026-12-31');

      // lastIndexOf('WHERE'): la subconsulta tiene su propio WHERE (líneas
      // activas) que aparece ANTES en el texto — el WHERE exterior (sobre cc)
      // es el último.
      const sql = norm(captured[0].sql);
      expect(sql.slice(sql.lastIndexOf('WHERE'))).toContain('cc."empresaId" = $1');
    });

    it('filtra los asientos (ac) por empresaId dentro de un INNER JOIN real, no de un LEFT JOIN', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, undefined, '2026-12-31');

      // PASO 0 (2026-09-20): antes, estos filtros vivían en el ON de un LEFT
      // JOIN contra asientos_contables — eso NO los aplica como filtro real
      // (un asiento que no cumple igual deja pasar su línea con las columnas
      // de ac en NULL). Ahora es un JOIN (INNER) dentro de una subconsulta,
      // que sí descarta las líneas cuyo asiento no cumple.
      const sql = norm(captured[0].sql);
      expect(sql).not.toContain('LEFT JOIN asientos_contables');
      expect(sql).toContain('JOIN asientos_contables ac');
      const tramoJoin = sql.slice(sql.indexOf('JOIN asientos_contables ac'), sql.indexOf('WHERE al."isActive"'));
      expect(tramoJoin).toContain('ac."empresaId" = $1');
      expect(tramoJoin).toContain(`ac.estado = 'contabilizado'`);
      expect(tramoJoin).toContain('ac."isActive" = true');
    });

    it('no deja pasar cuentas o asientos huérfanos (empresaId IS NULL) de otra empresa', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, undefined, '2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql).not.toContain('IS NULL');
      expect(sql).not.toMatch(/OR\s+ac\."empresaId"/i);
      expect(sql).not.toMatch(/OR\s+cc\."empresaId"/i);
    });

    it('empresas distintas reciben su propio empresaId', async () => {
      const capA: QueryCapturada[] = [];
      const capB: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(capA)).obtenerSaldos(7,  undefined, '2026-12-31');
      await new SaldosCuentasService(makeDataSource(capB)).obtenerSaldos(42, undefined, '2026-12-31');

      expect(capA[0].params[0]).toBe(7);
      expect(capB[0].params[0]).toBe(42);
    });

    it('con "desde" y "hasta" usa BETWEEN parametrizado', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, '2026-01-01', '2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('ac.fecha BETWEEN $2 AND $3');
      expect(captured[0].params).toEqual([7, '2026-01-01', '2026-12-31']);
    });

    it('solo "hasta" usa fecha <= parametrizada', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, undefined, '2026-06-30');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('ac.fecha <= $2');
      expect(captured[0].params).toEqual([7, '2026-06-30']);
    });

    it('no interpola una fecha maliciosa en el SQL', async () => {
      const INYECCION = `2026-01-01' OR '1'='1`;
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, INYECCION, '2026-12-31');

      expect(captured[0].sql).not.toContain(INYECCION);
      expect(captured[0].params).toContain(INYECCION);
    });
  });

  describe('obtenerAsientosDescuadrados()', () => {
    it('filtra por empresaId, sin "OR ... IS NULL"', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerAsientosDescuadrados(7, '2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('"empresaId" = $1');
      expect(sql).not.toContain('IS NULL');
      expect(sql).not.toMatch(/OR\s+"empresaId"/i);
    });

    it('empresas distintas reciben su propio empresaId', async () => {
      const capA: QueryCapturada[] = [];
      const capB: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(capA)).obtenerAsientosDescuadrados(7);
      await new SaldosCuentasService(makeDataSource(capB)).obtenerAsientosDescuadrados(42);

      expect(capA[0].params[0]).toBe(7);
      expect(capB[0].params[0]).toBe(42);
    });

    it('sin "hasta" no limita por fecha, pero sigue scopeada por empresa', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerAsientosDescuadrados(7);

      expect(captured[0].params).toEqual([7]);
    });
  });
});

// ── PASO 0 — verificación real contra Postgres (requiere BD) ────────────────
// El bug (asientos que no cumplen los filtros contaminando la suma) es de
// SEMÁNTICA de ejecución del JOIN, no de forma del texto SQL — ningún mock de
// dataSource.query() puede probarlo. Sigue el mismo patrón que
// educativo/config/config-sql.spec.ts: se auto-skipea si DB_HOST no está
// configurado (CI no lo configura para este job — ver ci.yml), y corre de
// verdad en local contra hicloud_test dentro de una transacción que SIEMPRE
// se revierte (ROLLBACK), sin dejar nada insertado.
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('obtenerSaldos() — PASO 0, ejecución real contra Postgres', () => {
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

  it('un asiento anulado, de otra empresa, inactivo, o fuera de fecha NO contamina la suma de una cuenta con movimientos válidos', async () => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const EMPRESA_A = 900001;
      const EMPRESA_B = 900002; // "otra empresa" — nunca debe aparecer en el resultado de A

      const [{ id: userId }] = await qr.query(
        `INSERT INTO users (nombre, email, password) VALUES ('Test PASO 0', 'test-paso0@example.com', 'x') RETURNING id`,
      );
      const [{ id: cuentaId }] = await qr.query(
        `INSERT INTO cuentas_contables (codigo, nombre, tipo, naturaleza, "nivel", "permiteMovimientos", "empresaId")
         VALUES ('9.9.9.01', 'Cuenta de prueba PASO 0', 'activo', 'deudora', 4, true, $1) RETURNING id`,
        [EMPRESA_A],
      );

      const crearAsiento = async (opts: {
        empresaId: number; estado: string; isActive: boolean; fecha: string; debe: number;
      }) => {
        const [{ id: asientoId }] = await qr.query(
          `INSERT INTO asientos_contables
             (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
           VALUES ($1, $2, 'Fixture PASO 0', 'manual', $3, $4, $4, $5, $6, $7) RETURNING id`,
          [`TEST-${Math.random().toString(36).slice(2)}`, opts.fecha, opts.estado, opts.debe, userId, opts.empresaId, opts.isActive],
        );
        await qr.query(
          `INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId")
           VALUES ($1, $2, 'Línea fixture', $3, 0, $4)`,
          [asientoId, cuentaId, opts.debe, opts.empresaId],
        );
      };

      // El único que DEBE contar: 100.
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'contabilizado', isActive: true,  fecha: '2026-06-15', debe: 100 });
      // Anulado — NO debe contar.
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'anulado',       isActive: true,  fecha: '2026-06-16', debe: 50 });
      // Otra empresa — NO debe contar (fuga cross-tenant si aparece).
      await crearAsiento({ empresaId: EMPRESA_B, estado: 'contabilizado', isActive: true,  fecha: '2026-06-17', debe: 30 });
      // Inactivo — NO debe contar.
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'contabilizado', isActive: false, fecha: '2026-06-18', debe: 20 });
      // Fuera del rango de fecha (hasta='2026-06-30') — NO debe contar.
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'contabilizado', isActive: true,  fecha: '2026-07-05', debe: 10 });

      const svc = new SaldosCuentasService({ query: (sql: string, params?: unknown[]) => qr.query(sql, params) } as any);
      const saldos = await svc.obtenerSaldos(EMPRESA_A, undefined, '2026-06-30');

      const cuenta = saldos.find(s => s.codigo === '9.9.9.01');
      expect(cuenta).toBeDefined();
      expect(cuenta!.totalDebe).toBe(100); // NO 100+50+30+20+10=210
      expect(cuenta!.totalHaber).toBe(0);
      expect(cuenta!.saldo).toBe(100);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });
});
