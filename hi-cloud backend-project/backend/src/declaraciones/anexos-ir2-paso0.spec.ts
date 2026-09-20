/**
 * FIX 3, COMMIT 3 (2026-09-20) — verificación real contra Postgres del mismo
 * bug del PASO 0 (ver saldos-cuentas.service.spec.ts), ahora en las 5
 * queries de AnexosIR2Service: los filtros de asientos_contables vivían en
 * el ON de un LEFT JOIN contra asiento_lineas, que no los aplica como
 * filtro real — un asiento anulado/de otra empresa/inactivo/fuera de fecha
 * seguía sumándose en el saldo del anexo fiscal.
 *
 * Sigue el mismo patrón que educativo/config/config-sql.spec.ts: se
 * auto-skipea si DB_HOST no está configurado (CI no lo configura para este
 * job), y corre de verdad en local contra hicloud_test dentro de una
 * transacción que SIEMPRE se revierte (ROLLBACK) — nada queda insertado.
 *
 * Cubre las 2 fórmulas de agregado distintas que usan las 5 queries:
 *   - saldoCuentasInventarioD: SUM(debe - haber) sin CASE de naturaleza —
 *     la de mayor impacto, alimenta costoVentaCalculado del Anexo D
 *     directamente, no solo una alerta.
 *   - cuentasConAnexoA1: SUM(CASE WHEN naturaleza...) — la misma fórmula
 *     que usan las otras 3 (cuentasConAnexoB1, cuentasDeResultadosSinAnexoB1,
 *     cuentasDeBalanceSinAnexoA1), ya cubierta estructuralmente por
 *     anexos-ir2-multi-tenant.spec.ts para las 5.
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AnexosIR2Service } from './anexos-ir2.service';

const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('AnexosIR2Service — PASO 0, ejecución real contra Postgres', () => {
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

  it('saldoCuentasInventarioD (Anexo D): un asiento anulado/de otra empresa/inactivo/fuera de fecha NO contamina el saldo', async () => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const EMPRESA_A = 900101;
      const EMPRESA_B = 900102;

      const [{ id: userId }] = await qr.query(
        `INSERT INTO users (nombre, email, password) VALUES ('Test IR2 Anexo D', 'test-ir2-d@example.com', 'x') RETURNING id`,
      );
      const [{ id: cuentaId }] = await qr.query(
        `INSERT INTO cuentas_contables (codigo, nombre, tipo, naturaleza, "nivel", "permiteMovimientos", "empresaId")
         VALUES ('1.1.3.01', 'Inventario de prueba', 'activo', 'deudora', 4, true, $1) RETURNING id`,
        [EMPRESA_A],
      );
      await qr.query(
        `INSERT INTO cuenta_anexo_ir2 ("cuentaContableId", "anexoIR2", "empresaId") VALUES ($1, 'D', $2)`,
        [cuentaId, EMPRESA_A],
      );

      const crearAsiento = async (opts: { empresaId: number; estado: string; isActive: boolean; fecha: string; debe: number }) => {
        const [{ id: asientoId }] = await qr.query(
          `INSERT INTO asientos_contables
             (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
           VALUES ($1, $2, 'Fixture IR2 Anexo D', 'manual', $3, $4, $4, $5, $6, $7) RETURNING id`,
          [`TEST-${Math.random().toString(36).slice(2)}`, opts.fecha, opts.estado, opts.debe, userId, opts.empresaId, opts.isActive],
        );
        await qr.query(
          `INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId")
           VALUES ($1, $2, 'Línea fixture', $3, 0, $4)`,
          [asientoId, cuentaId, opts.debe, opts.empresaId],
        );
      };

      // El único que DEBE contar: 500 (inventario inicial de la empresa A).
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'contabilizado', isActive: true,  fecha: '2026-06-15', debe: 500 });
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'anulado',       isActive: true,  fecha: '2026-06-16', debe: 200 });
      await crearAsiento({ empresaId: EMPRESA_B, estado: 'contabilizado', isActive: true,  fecha: '2026-06-17', debe: 90 });
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'contabilizado', isActive: false, fecha: '2026-06-18', debe: 70 });
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'contabilizado', isActive: true,  fecha: '2027-01-05', debe: 40 }); // fuera de fecha de corte (2026-12-31)

      const svc = new AnexosIR2Service(
        { query: (sql: string, params?: unknown[]) => qr.query(sql, params) } as any,
        { getEmpresaId: () => EMPRESA_A } as any,
      );
      const anexoD = await svc.getAnexoD(2026);

      // inventarioInicial usa fechaCorte = cierre del año anterior (2025-12-31) —
      // ningún fixture cae ahí: saldo 0, pero la cuenta SÍ aparece (esta query,
      // a diferencia de las otras 4, no tiene HAVING — siempre lista las
      // cuentas de Inventario, incluso con saldo de apertura en cero).
      const cuentaInv = anexoD.inventarioInicial.cuentas.find(c => c.codigo === '1.1.3.01');
      expect(cuentaInv).toBeDefined();
      expect(cuentaInv!.saldo).toBe(0);

      // inventarioFinal (fechaCorte = 2026-12-31) sí cubre a los fixtures de 2026.
      const cuentaInvFinal = anexoD.inventarioFinal.cuentas.find(c => c.codigo === '1.1.3.01');
      expect(cuentaInvFinal).toBeDefined();
      expect(cuentaInvFinal!.saldo).toBe(500); // NO 500+200+90+70+40=860
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });

  it('cuentasConAnexoA1 (Anexo A1): mismo bug, con la fórmula de saldo firmado por naturaleza', async () => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const EMPRESA_A = 900103;
      const EMPRESA_B = 900104;

      const [{ id: userId }] = await qr.query(
        `INSERT INTO users (nombre, email, password) VALUES ('Test IR2 Anexo A1', 'test-ir2-a1@example.com', 'x') RETURNING id`,
      );
      const [{ id: cuentaId }] = await qr.query(
        `INSERT INTO cuentas_contables (codigo, nombre, tipo, naturaleza, "nivel", "permiteMovimientos", "empresaId")
         VALUES ('2.1.1.01', 'Proveedores de prueba', 'pasivo', 'acreedora', 4, true, $1) RETURNING id`,
        [EMPRESA_A],
      );
      await qr.query(
        `INSERT INTO cuenta_anexo_ir2 ("cuentaContableId", "anexoIR2", "empresaId") VALUES ($1, 'A1', $2)`,
        [cuentaId, EMPRESA_A],
      );

      const crearAsiento = async (opts: { empresaId: number; estado: string; isActive: boolean; fecha: string; haber: number }) => {
        const [{ id: asientoId }] = await qr.query(
          `INSERT INTO asientos_contables
             (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
           VALUES ($1, $2, 'Fixture IR2 Anexo A1', 'manual', $3, $4, $4, $5, $6, $7) RETURNING id`,
          [`TEST-${Math.random().toString(36).slice(2)}`, opts.fecha, opts.estado, opts.haber, userId, opts.empresaId, opts.isActive],
        );
        await qr.query(
          `INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId")
           VALUES ($1, $2, 'Línea fixture', 0, $3, $4)`,
          [asientoId, cuentaId, opts.haber, opts.empresaId],
        );
      };

      // acreedora → saldo = haber - debe. El único que DEBE contar: 300.
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'contabilizado', isActive: true,  fecha: '2026-06-15', haber: 300 });
      await crearAsiento({ empresaId: EMPRESA_A, estado: 'borrador',      isActive: true,  fecha: '2026-06-16', haber: 150 });
      await crearAsiento({ empresaId: EMPRESA_B, estado: 'contabilizado', isActive: true,  fecha: '2026-06-17', haber: 80 });

      const svc = new AnexosIR2Service(
        { query: (sql: string, params?: unknown[]) => qr.query(sql, params) } as any,
        { getEmpresaId: () => EMPRESA_A } as any,
      );
      const anexoA1 = await svc.getAnexoA1('2026-12-31');

      const cuentaProv = anexoA1.pasivo.corriente.cuentas.find(c => c.codigo === '2.1.1.01');
      expect(cuentaProv).toBeDefined();
      expect(cuentaProv!.saldo).toBe(300); // NO 300+150+80=530
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });
});
