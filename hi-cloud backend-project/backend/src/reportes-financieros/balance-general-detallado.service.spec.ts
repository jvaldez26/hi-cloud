/**
 * Balance General detallado (2026-09-21) — pruebas de INTEGRACIÓN contra
 * Postgres real (hicloud_test). La aritmética del árbol (nivel de detalle,
 * % vertical, ocultar en cero, comparativo, huérfanas) ya está cubierta a
 * fondo y sin BD en balance-general-arbol.util.spec.ts — esta suite prueba
 * solo el CABLEADO: que el servicio arma el catálogo + saldos reales
 * correctamente, resuelve fechas de comparación reales, y nunca cruza
 * empresas.
 */

import { DataSource } from 'typeorm';
import { BalanceGeneralDetalladoService } from './balance-general-detallado.service';
import { SaldosCuentasService } from './saldos-cuentas.service';
import { CuentaContable, TipoCuenta, NaturalezaCuenta } from '../contabilidad/entities/cuenta-contable.entity';
import { TenantContextMissingException } from '../tenant/exceptions/tenant-context-missing.exception';
import { BadRequestException } from '@nestjs/common';

const TIENE_BD = !!process.env['DB_HOST'];
const EMPRESA_A = 901201;
const EMPRESA_B = 901202;

(TIENE_BD ? describe : describe.skip)('BalanceGeneralDetalladoService — contra Postgres real', () => {
  let dataSource: DataSource;
  let cuentaRepo: ReturnType<DataSource['getRepository']>;
  let userIdFixture: number;

  const tenantSvc = (empresaId: number | null) => ({ getEmpresaIdOrNull: () => empresaId } as any);

  const svcPara = (empresaId: number | null) =>
    new BalanceGeneralDetalladoService(cuentaRepo as any, tenantSvc(empresaId), new SaldosCuentasService(dataSource));

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [CuentaContable],
    });
    await dataSource.initialize();
    cuentaRepo = dataSource.getRepository(CuentaContable);

    const [{ id }] = await dataSource.query(
      `INSERT INTO users (nombre, email, password) VALUES ('Test BG Detallado', 'test-bg-detallado@example.com', 'x') RETURNING id`,
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

  /** Catálogo mínimo de 3 niveles para una empresa: 1 ACTIVOS → 1.1 Corriente → 1.1.1.01 Caja. */
  async function seedCatalogo(empresaId: number) {
    const raiz = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '1', nombre: 'ACTIVOS', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 1, permiteMovimientos: false,
    } as any)) as any;
    const corriente = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '1.1', nombre: 'Activo Corriente', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 2, permiteMovimientos: false, cuentaPadreId: raiz.id,
    } as any)) as any;
    const caja = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '1.1.1.01', nombre: 'Caja General', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true, cuentaPadreId: corriente.id,
    } as any)) as any;
    const pasivoRaiz = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '2', nombre: 'PASIVOS', tipo: TipoCuenta.PASIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: false,
    } as any)) as any;
    const patrimonioRaiz = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '3', nombre: 'PATRIMONIO', tipo: TipoCuenta.PATRIMONIO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: false,
    } as any)) as any;
    return { raiz, corriente, caja, pasivoRaiz, patrimonioRaiz };
  }

  async function crearAsiento(opts: {
    cuentaId: number; fecha: string; debe: number; haber: number; empresaId: number; totalDebe?: number; totalHaber?: number;
  }) {
    const totalDebe  = opts.totalDebe  ?? opts.debe;
    const totalHaber = opts.totalHaber ?? opts.haber;
    const [{ id: asientoId }] = await dataSource.query(
      `INSERT INTO asientos_contables
         (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
       VALUES ($1, $2, 'Fixture BG detallado', 'manual', 'contabilizado', $3, $4, $5, $6, true) RETURNING id`,
      [`TEST-BG-${Math.random().toString(36).slice(2)}`, opts.fecha, totalDebe, totalHaber, userIdFixture, opts.empresaId],
    );
    await dataSource.query(
      `INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId")
       VALUES ($1, $2, 'Línea fixture', $3, $4, $5)`,
      [asientoId, opts.cuentaId, opts.debe, opts.haber, opts.empresaId],
    );
  }

  it('sin contexto de empresa lanza y nunca toca el catálogo', async () => {
    await expect(svcPara(null).generar({ fechaCorte: '2026-12-31' })).rejects.toThrow(TenantContextMissingException);
  });

  it('compararCon=fecha-manual sin fechaComparacion lanza BadRequestException', async () => {
    await seedCatalogo(EMPRESA_A);
    await expect(
      svcPara(EMPRESA_A).generar({ fechaCorte: '2026-12-31', compararCon: 'fecha-manual' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('arma el árbol real desde el catálogo con nivel de detalle default (2) y calcula el % vertical', async () => {
    const { caja } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: caja.id, fecha: '2026-06-15', debe: 5000, haber: 0, empresaId: EMPRESA_A });

    const bg = await svcPara(EMPRESA_A).generar({ fechaCorte: '2026-06-30' });

    expect(bg.activo.total).toBe(5000);
    expect(bg.activo.nodos).toHaveLength(1);
    expect(bg.activo.nodos[0].codigo).toBe('1');
    expect(bg.activo.nodos[0].hijos.map(h => h.codigo)).toEqual(['1.1']); // nivel 2 por defecto — no baja a la hoja
    expect(bg.activo.nodos[0].hijos[0].monto).toBe(5000); // agregado completo aunque la hoja no se muestre
    expect(bg.activo.nodos[0].porcentajeVertical).toBe(100);
  });

  it("nivelDetalle='todos' expande hasta la hoja real de la BD", async () => {
    const { caja } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: caja.id, fecha: '2026-06-15', debe: 3000, haber: 0, empresaId: EMPRESA_A });

    const bg = await svcPara(EMPRESA_A).generar({ fechaCorte: '2026-06-30', nivelDetalle: 'todos' });

    const hoja = bg.activo.nodos[0].hijos[0].hijos[0];
    expect(hoja.codigo).toBe('1.1.1.01');
    expect(hoja.monto).toBe(3000);
  });

  it("compararCon='cierre-anio-anterior' resuelve a 31-dic del año anterior y calcula comparado/diferencia reales", async () => {
    const { caja } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: caja.id, fecha: '2025-12-20', debe: 1000, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: caja.id, fecha: '2026-06-15', debe: 1500, haber: 0, empresaId: EMPRESA_A });

    const bg = await svcPara(EMPRESA_A).generar({ fechaCorte: '2026-06-30', compararCon: 'cierre-anio-anterior' });

    expect(bg.filtros.fechaComparacion).toBe('2025-12-31');
    expect(bg.activo.total).toBe(2500);       // 1000 + 1500 al corte
    expect(bg.activo.comparado).toBe(1000);   // solo lo de 2025 al 31-dic-2025
    expect(bg.activo.diferencia).toBe(1500);
  });

  it("compararCon='mismo-mes-anio-anterior' resuelve el mismo mes/día del año anterior", async () => {
    await seedCatalogo(EMPRESA_A);
    const bg = await svcPara(EMPRESA_A).generar({ fechaCorte: '2026-06-15', compararCon: 'mismo-mes-anio-anterior' });
    expect(bg.filtros.fechaComparacion).toBe('2025-06-15');
  });

  it('un período de comparación totalmente sin datos da comparado=0 (no null) — cobertura end-to-end', async () => {
    const { caja } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: caja.id, fecha: '2026-06-15', debe: 800, haber: 0, empresaId: EMPRESA_A });

    // La empresa no existía (sin movimientos) en 2020.
    const bg = await svcPara(EMPRESA_A).generar({
      fechaCorte: '2026-06-30', compararCon: 'fecha-manual', fechaComparacion: '2020-12-31',
    });

    expect(bg.activo.comparado).toBe(0);
    expect(bg.activo.diferencia).toBe(800);
  });

  it('cuenta huérfana (su madre real fue desactivada) aparece como raíz, no rompe la generación', async () => {
    const { caja } = await seedCatalogo(EMPRESA_A);
    // La FK de cuentaPadreId exige una madre real — la "orfandad" real que
    // puede pasar en producción es una madre desactivada (isActive=false),
    // que el catálogo (solo isActive=true) ya no incluye, dejando a la hija
    // con un cuentaPadreId que apunta a una fila que ya no está en el set activo.
    const madreDesactivada = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '1.9.9', nombre: 'Madre desactivada', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 3, permiteMovimientos: false,
    } as any)) as any;
    const huerfana = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '1.9.9.99', nombre: 'Cuenta huérfana', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true, cuentaPadreId: madreDesactivada.id,
    } as any)) as any;
    await cuentaRepo.update(madreDesactivada.id, { isActive: false } as any);
    await crearAsiento({ cuentaId: caja.id, fecha: '2026-06-15', debe: 100, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: huerfana.id, fecha: '2026-06-15', debe: 250, haber: 0, empresaId: EMPRESA_A });

    const bg = await svcPara(EMPRESA_A).generar({ fechaCorte: '2026-06-30', nivelDetalle: 'todos' });

    const codigosRaiz = bg.activo.nodos.map(n => n.codigo).sort();
    expect(codigosRaiz).toEqual(['1', '1.9.9.99']);
    expect(bg.activo.total).toBe(350); // 100 (rama normal) + 250 (huérfana) — nunca se pierde ni se cae
  });

  it('diferenciaAsientosDescuadrados y la ecuación cuadrada se calculan end-to-end', async () => {
    const { caja } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: caja.id, fecha: '2026-06-15', debe: 100, haber: 0, empresaId: EMPRESA_A, totalDebe: 100.05, totalHaber: 100 });

    const bg = await svcPara(EMPRESA_A).generar({ fechaCorte: '2026-06-30' });

    expect(bg.diferenciaAsientosDescuadrados.cantidad).toBe(1);
    expect(bg.diferenciaAsientosDescuadrados.total).toBeCloseTo(0.05, 2);
    // No se absorbe en la ecuación: activo=100, pasivo+patrimonio=0 → diferencia real de 100.
    expect(bg.totales.ecuacion).toBe(100);
  });

  it('aislamiento multi-tenant: el árbol de la empresa A nunca incluye cuentas ni saldos de la empresa B', async () => {
    const { caja: cajaA } = await seedCatalogo(EMPRESA_A);
    const { caja: cajaB } = await seedCatalogo(EMPRESA_B);
    await crearAsiento({ cuentaId: cajaA.id, fecha: '2026-06-15', debe: 500, haber: 0, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: cajaB.id, fecha: '2026-06-15', debe: 9_000_000, haber: 0, empresaId: EMPRESA_B });

    const bgA = await svcPara(EMPRESA_A).generar({ fechaCorte: '2026-06-30', nivelDetalle: 'todos' });

    expect(bgA.activo.total).toBe(500);
    const todosLosCodigos = JSON.stringify(bgA.activo.nodos);
    expect(todosLosCodigos).not.toContain('9000000');
  });
});
