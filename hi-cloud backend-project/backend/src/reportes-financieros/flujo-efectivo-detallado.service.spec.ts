/**
 * Estado de Flujo de Efectivo detallado (2026-09-22) — pruebas de
 * INTEGRACIÓN contra Postgres real (hicloud_test). La aritmética de bloques
 * ya está cubierta a fondo y sin BD en flujo-efectivo-bloques.util.spec.ts
 * (incluida la "regla de oro" con datos sintéticos) — esta suite prueba el
 * CABLEADO end-to-end: que el servicio arma las tres fotos de saldos reales
 * y que la "regla de oro" (Efectivo al Inicio + Cambio Neto = Efectivo al
 * Final) se cumple con asientos contables de verdad, no solo con el objeto
 * plano que recibe el util.
 *
 * Mismo patrón TIENE_BD que estado-resultados-detallado.service.spec.ts —
 * se salta sin fallar cuando no hay DB_HOST (así corre CI hoy). Con
 * DB_HOST apuntando a un backup restaurado de producción, corre igual
 * contra datos reales — el servicio no distingue el origen de los datos.
 */

import { DataSource } from 'typeorm';
import { FlujoEfectivoDetalladoService } from './flujo-efectivo-detallado.service';
import { SaldosCuentasService } from './saldos-cuentas.service';
import { TenantContextMissingException } from '../tenant/exceptions/tenant-context-missing.exception';
import { BadRequestException } from '@nestjs/common';

const TIENE_BD = !!process.env['DB_HOST'];
const EMPRESA_A = 901701;
const EMPRESA_B = 901702;

(TIENE_BD ? describe : describe.skip)('FlujoEfectivoDetalladoService — contra Postgres real', () => {
  let dataSource: DataSource;
  let userIdFixture: number;

  const tenantSvc = (empresaId: number | null) => ({ getEmpresaIdOrNull: () => empresaId } as any);
  const svcPara = (empresaId: number | null) =>
    new FlujoEfectivoDetalladoService(tenantSvc(empresaId), new SaldosCuentasService(dataSource));

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [],
    });
    await dataSource.initialize();

    const [{ id }] = await dataSource.query(
      `INSERT INTO users (nombre, email, password) VALUES ('Test Flujo Efectivo', 'test-flujo-efectivo@example.com', 'x') RETURNING id`,
    );
    userIdFixture = id;
  });

  afterAll(async () => {
    for (const eid of [EMPRESA_A, EMPRESA_B]) {
      await dataSource.query(`DELETE FROM asiento_lineas WHERE "empresaId" = $1`, [eid]);
      await dataSource.query(`DELETE FROM asientos_contables WHERE "empresaId" = $1`, [eid]);
      await dataSource.query(`DELETE FROM cuentas_contables WHERE "empresaId" = $1`, [eid]);
    }
    await dataSource.query(`DELETE FROM users WHERE id = $1`, [userIdFixture]);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    for (const eid of [EMPRESA_A, EMPRESA_B]) {
      await dataSource.query(`DELETE FROM asiento_lineas WHERE "empresaId" = $1`, [eid]);
      await dataSource.query(`DELETE FROM asientos_contables WHERE "empresaId" = $1`, [eid]);
      await dataSource.query(`DELETE FROM cuentas_contables WHERE "empresaId" = $1`, [eid]);
    }
  });

  /** Subconjunto real del catálogo (mismos códigos que contabilidad.service.ts) necesario para mover cada línea del reporte. */
  async function seedCatalogo(empresaId: number) {
    const cuentas = [
      { codigo: '1.1.1.02', nombre: 'Caja General',                  tipo: 'activo',     naturaleza: 'deudora' },
      { codigo: '1.1.2.01', nombre: 'Clientes',                      tipo: 'activo',     naturaleza: 'deudora' },
      { codigo: '1.1.3.01', nombre: 'Mercancías para la Venta',      tipo: 'activo',     naturaleza: 'deudora' },
      { codigo: '1.2.1.02', nombre: 'Equipos de Cómputo',            tipo: 'activo',     naturaleza: 'deudora' },
      { codigo: '1.2.2.03', nombre: 'Depreciación Acumulada - Equipos', tipo: 'activo',  naturaleza: 'acreedora' },
      { codigo: '2.1.1.01', nombre: 'Proveedores',                   tipo: 'pasivo',     naturaleza: 'acreedora' },
      { codigo: '2.1.2.01', nombre: 'ITBIS por Pagar',                tipo: 'pasivo',     naturaleza: 'acreedora' },
      { codigo: '2.2.1.01', nombre: 'Préstamos Bancarios LP',         tipo: 'pasivo',     naturaleza: 'acreedora' },
      { codigo: '3.1.1.01', nombre: 'Capital Suscrito y Pagado',      tipo: 'patrimonio', naturaleza: 'acreedora' },
      { codigo: '4.1.1.01', nombre: 'Ventas de Bienes',               tipo: 'ingreso',    naturaleza: 'acreedora' },
      { codigo: '6.2.1.03', nombre: 'Depreciación - Equipos',         tipo: 'gasto',      naturaleza: 'deudora' },
    ];
    const ids: Record<string, number> = {};
    for (const c of cuentas) {
      const [{ id }] = await dataSource.query(
        `INSERT INTO cuentas_contables (codigo, nombre, tipo, naturaleza, "nivel", "permiteMovimientos", "empresaId", "isActive")
         VALUES ($1, $2, $3, $4, 4, true, $5, true) RETURNING id`,
        [c.codigo, c.nombre, c.tipo, c.naturaleza, empresaId],
      );
      ids[c.codigo] = id;
    }
    return ids;
  }

  async function crearAsiento(opts: { cuentaId: number; fecha: string; debe: number; haber: number; empresaId: number }) {
    const [{ id: asientoId }] = await dataSource.query(
      `INSERT INTO asientos_contables
         (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
       VALUES ($1, $2, 'Fixture Flujo Efectivo', 'manual', 'contabilizado', $3, $3, $4, $5, true) RETURNING id`,
      [`TEST-FE-${Math.random().toString(36).slice(2)}`, opts.fecha, Math.max(opts.debe, opts.haber), userIdFixture, opts.empresaId],
    );
    await dataSource.query(
      `INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId")
       VALUES ($1, $2, 'Línea fixture', $3, $4, $5)`,
      [asientoId, opts.cuentaId, opts.debe, opts.haber, opts.empresaId],
    );
  }

  it('sin contexto de empresa lanza y nunca toca los saldos', async () => {
    await expect(svcPara(null).generar({ desde: '2026-01-01', hasta: '2026-12-31' })).rejects.toThrow(TenantContextMissingException);
  });

  it('desde posterior a hasta lanza BadRequestException', async () => {
    await expect(svcPara(EMPRESA_A).generar({ desde: '2026-12-31', hasta: '2026-01-01' })).rejects.toThrow(BadRequestException);
  });

  it('período sin ningún movimiento: todo en cero, sin error, cuadra', async () => {
    await seedCatalogo(EMPRESA_A);
    const fe = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });

    expect(fe.periodo.resultadoNeto).toBe(0);
    expect(fe.periodo.cambioNetoEfectivo).toBe(0);
    expect(fe.periodo.efectivoInicio).toBe(0);
    expect(fe.periodo.efectivoFin).toBe(0);
    expect(fe.periodo.cuadrado).toBe(true);
  });

  it('regla de oro — préstamo nuevo + compra de activo fijo + depreciación + capital sin cambio, con asientos reales', async () => {
    const cta = await seedCatalogo(EMPRESA_A);

    // Capital inicial (antes del período) — no debe generar "Aumento en Capital".
    await crearAsiento({ cuentaId: cta['3.1.1.01'], fecha: '2025-01-01', debe: 0, haber: 200_000, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: cta['1.1.1.02'], fecha: '2025-01-01', debe: 200_000, haber: 0, empresaId: EMPRESA_A });

    // Dentro del período: préstamo bancario nuevo de 50,000 (entra a la caja).
    await crearAsiento({ cuentaId: cta['1.1.1.02'], fecha: '2026-03-10', debe: 50_000, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: cta['2.2.1.01'], fecha: '2026-03-10', debe: 0, haber: 50_000, empresaId: EMPRESA_A });

    // Compra de un equipo de cómputo por 30,000 al contado (usa efectivo).
    await crearAsiento({ cuentaId: cta['1.2.1.02'], fecha: '2026-04-05', debe: 30_000, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: cta['1.1.1.02'], fecha: '2026-04-05', debe: 0, haber: 30_000, empresaId: EMPRESA_A });

    // Depreciación del período: 5,000 (gasto, sube la acumulada — no toca efectivo).
    await crearAsiento({ cuentaId: cta['6.2.1.03'], fecha: '2026-12-15', debe: 5_000, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: cta['1.2.2.03'], fecha: '2026-12-15', debe: 0, haber: 5_000, empresaId: EMPRESA_A });

    const fe = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });

    expect(fe.periodo.financiamientos.lineas.find(l => l.nombre === 'Aumento en Préstamos')!.monto).toBe(50_000);
    expect(fe.periodo.financiamientos.lineas.find(l => l.nombre === 'Aumento en Capital')!.monto).toBe(0);
    expect(fe.periodo.inversiones.lineas.find(l => l.nombre === 'Aumento en Propiedades y Equipos')!.monto).toBe(-30_000);
    expect(fe.periodo.operaciones.lineas.find(l => l.nombre === 'Depreciaciones del período')!.monto).toBe(5_000);

    // La "regla de oro" — con asientos contables reales, no solo el objeto plano del util.
    expect(fe.periodo.efectivoInicio).toBe(200_000);
    expect(fe.periodo.efectivoFin).toBe(220_000); // 200,000 + 50,000 − 30,000
    expect(fe.periodo.efectivoInicio + fe.periodo.cambioNetoEfectivo).toBe(fe.periodo.efectivoFin);
    expect(fe.periodo.diferenciaCuadre).toBe(0);
    expect(fe.periodo.cuadrado).toBe(true);
  });

  it('el Resultado Neto del Flujo de Efectivo es el mismo Resultado Neto que arroja una venta con su costo', async () => {
    const cta = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: cta['1.1.1.02'], fecha: '2026-05-10', debe: 10_000, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: cta['4.1.1.01'], fecha: '2026-05-10', debe: 0, haber: 10_000, empresaId: EMPRESA_A });

    const fe = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });

    expect(fe.periodo.resultadoNeto).toBe(10_000);
    expect(fe.periodo.efectivoInicio + fe.periodo.cambioNetoEfectivo).toBe(fe.periodo.efectivoFin);
    expect(fe.periodo.cuadrado).toBe(true);
  });

  it('aislamiento multi-tenant: el flujo de la empresa A nunca incluye movimientos de la empresa B', async () => {
    const ctaA = await seedCatalogo(EMPRESA_A);
    const ctaB = await seedCatalogo(EMPRESA_B);
    await crearAsiento({ cuentaId: ctaA['1.1.1.02'], fecha: '2026-06-15', debe: 500, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: ctaA['4.1.1.01'], fecha: '2026-06-15', debe: 0, haber: 500, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: ctaB['1.1.1.02'], fecha: '2026-06-15', debe: 9_000_000, haber: 0, empresaId: EMPRESA_B });
    await crearAsiento({ cuentaId: ctaB['4.1.1.01'], fecha: '2026-06-15', debe: 0, haber: 9_000_000, empresaId: EMPRESA_B });

    const feA = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });

    expect(feA.periodo.efectivoFin).toBe(500);
    expect(JSON.stringify(feA)).not.toContain('9000000');
  });

  it("comparacion='anio-anterior': mismo rango desplazado un año, cada período cuadra por su cuenta", async () => {
    const cta = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: cta['1.1.1.02'], fecha: '2026-06-10', debe: 4_000, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: cta['4.1.1.01'], fecha: '2026-06-10', debe: 0, haber: 4_000, empresaId: EMPRESA_A });

    const fe = await svcPara(EMPRESA_A).generar({ desde: '2026-06-01', hasta: '2026-06-30', comparacion: 'anio-anterior' });

    expect(fe.anioAnterior?.desde).toBe('2025-06-01');
    expect(fe.anioAnterior?.periodo.efectivoFin).toBe(0);
    expect(fe.anioAnterior?.periodo.cuadrado).toBe(true);
    expect(fe.periodo.cuadrado).toBe(true);
  });
});
