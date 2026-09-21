/**
 * Estado de Resultados detallado (2026-09-21) — pruebas de INTEGRACIÓN
 * contra Postgres real (hicloud_test). La aritmética de bloques/líneas
 * calculadas/% ya está cubierta a fondo y sin BD en
 * estado-resultados-bloques.util.spec.ts — esta suite prueba solo el
 * CABLEADO: que el servicio arma el catálogo + saldos reales
 * correctamente, resuelve cada modo de comparación con fechas reales,
 * nunca cruza empresas, y que su resultado coincide con Balance General
 * a la misma fecha.
 */

import { DataSource } from 'typeorm';
import { EstadoResultadosDetalladoService } from './estado-resultados-detallado.service';
import { BalanceGeneralDetalladoService } from './balance-general-detallado.service';
import { SaldosCuentasService } from './saldos-cuentas.service';
import { CuentaContable, TipoCuenta, NaturalezaCuenta, ClasificacionResultado } from '../contabilidad/entities/cuenta-contable.entity';
import { TenantContextMissingException } from '../tenant/exceptions/tenant-context-missing.exception';
import { BadRequestException } from '@nestjs/common';

const TIENE_BD = !!process.env['DB_HOST'];
const EMPRESA_A = 901501;
const EMPRESA_B = 901502;

(TIENE_BD ? describe : describe.skip)('EstadoResultadosDetalladoService — contra Postgres real', () => {
  let dataSource: DataSource;
  let cuentaRepo: ReturnType<DataSource['getRepository']>;
  let userIdFixture: number;

  const tenantSvc = (empresaId: number | null) => ({ getEmpresaIdOrNull: () => empresaId } as any);

  const svcPara = (empresaId: number | null) =>
    new EstadoResultadosDetalladoService(cuentaRepo as any, tenantSvc(empresaId), new SaldosCuentasService(dataSource));

  const bgSvcPara = (empresaId: number | null) =>
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
      `INSERT INTO users (nombre, email, password) VALUES ('Test ER Detallado', 'test-er-detallado@example.com', 'x') RETURNING id`,
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

  /** Ventas (ingreso operacional), Intereses Ganados (ingreso no operacional, hereda de 4.2),
   *  Costo de Ventas (costo), Alquiler (gasto operacional), Comisiones Bancarias
   *  (gasto no operacional, hereda de 6.1.3 Gastos Financieros). */
  async function seedCatalogo(empresaId: number) {
    const ingresosRaiz = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '4', nombre: 'INGRESOS', tipo: TipoCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: false,
    } as any)) as any;
    const ventas = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '4.1.1.01', nombre: 'Ventas de Bienes', tipo: TipoCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 4, permiteMovimientos: true, cuentaPadreId: ingresosRaiz.id,
    } as any)) as any;
    const ingresosNoOperMadre = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '4.2', nombre: 'Ingresos No Operacionales', tipo: TipoCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 2, permiteMovimientos: false, cuentaPadreId: ingresosRaiz.id,
      clasificacionResultado: ClasificacionResultado.NO_OPERACIONAL,
    } as any)) as any;
    const intereses = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '4.2.1.03', nombre: 'Intereses Ganados', tipo: TipoCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 4, permiteMovimientos: true, cuentaPadreId: ingresosNoOperMadre.id,
    } as any)) as any;
    const costoVentas = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '5.1.1.01', nombre: 'Costo de Ventas de Bienes', tipo: TipoCuenta.COSTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
    } as any)) as any;
    const alquiler = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '6.1.2.01', nombre: 'Alquiler', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
    } as any)) as any;
    const gastosFinancierosMadre = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '6.1.3', nombre: 'Gastos Financieros', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 2, permiteMovimientos: false,
      clasificacionResultado: ClasificacionResultado.NO_OPERACIONAL,
    } as any)) as any;
    const comisiones = await cuentaRepo.save(cuentaRepo.create({
      empresaId, codigo: '6.1.3.01', nombre: 'Comisiones Bancarias', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true, cuentaPadreId: gastosFinancierosMadre.id,
    } as any)) as any;
    return { ventas, intereses, costoVentas, alquiler, comisiones };
  }

  async function crearAsiento(opts: {
    cuentaId: number; fecha: string; debe: number; haber: number; empresaId: number;
  }) {
    const [{ id: asientoId }] = await dataSource.query(
      `INSERT INTO asientos_contables
         (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
       VALUES ($1, $2, 'Fixture ER detallado', 'manual', 'contabilizado', $3, $3, $4, $5, true) RETURNING id`,
      [`TEST-ER-${Math.random().toString(36).slice(2)}`, opts.fecha, Math.max(opts.debe, opts.haber), userIdFixture, opts.empresaId],
    );
    await dataSource.query(
      `INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId")
       VALUES ($1, $2, 'Línea fixture', $3, $4, $5)`,
      [asientoId, opts.cuentaId, opts.debe, opts.haber, opts.empresaId],
    );
  }

  it('sin contexto de empresa lanza y nunca toca el catálogo', async () => {
    await expect(svcPara(null).generar({ desde: '2026-01-01', hasta: '2026-12-31' })).rejects.toThrow(TenantContextMissingException);
  });

  it('desde posterior a hasta lanza BadRequestException', async () => {
    await expect(
      svcPara(EMPRESA_A).generar({ desde: '2026-12-31', hasta: '2026-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('comparacion inválida lanza BadRequestException', async () => {
    await expect(
      svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31', comparacion: 'no-existe' as any }),
    ).rejects.toThrow(BadRequestException);
  });

  it('sin movimientos: ingresos en 0, ningún % es NaN/Infinity', async () => {
    await seedCatalogo(EMPRESA_A);
    const er = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(er.periodo.ingresos.total).toBe(0);
    expect(er.periodo.gananciaPerdidaDelPeriodo.porcentajeMargen).toBe(0);
    expect(Number.isFinite(er.periodo.ingresos.porcentajeIngresos)).toBe(true);
  });

  it('costo vs gasto y operacional vs no operacional: cada cuenta cae en su bloque correcto end-to-end', async () => {
    const { ventas, intereses, costoVentas, alquiler, comisiones } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: ventas.id,      fecha: '2026-06-15', debe: 0,    haber: 10000, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: intereses.id,   fecha: '2026-06-15', debe: 0,    haber: 500,   empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: costoVentas.id, fecha: '2026-06-15', debe: 4000, haber: 0,     empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: alquiler.id,    fecha: '2026-06-15', debe: 1000, haber: 0,     empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: comisiones.id,  fecha: '2026-06-15', debe: 50,   haber: 0,     empresaId: EMPRESA_A });

    const er = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });

    expect(er.periodo.ingresos.cuentas.map(c => c.codigo)).toEqual(['4.1.1.01']);
    expect(er.periodo.otrosIngresos.cuentas.map(c => c.codigo)).toEqual(['4.2.1.03']);
    expect(er.periodo.costoDeVentas.cuentas.map(c => c.codigo)).toEqual(['5.1.1.01']);
    expect(er.periodo.gastos.cuentas.map(c => c.codigo)).toEqual(['6.1.2.01']);
    expect(er.periodo.otrosGastos.cuentas.map(c => c.codigo)).toEqual(['6.1.3.01']);
    expect(er.periodo.utilidadBruta.monto).toBe(6000);       // 10000 - 4000
    expect(er.periodo.resultadoOperacional.monto).toBe(5000); // 6000 - 1000
    expect(er.periodo.gananciaPerdidaDelPeriodo.monto).toBe(5450); // 5000 + 500 - 50
  });

  it("comparacion='mes-vs-acumulado': el rango principal y el acumulado desde el 1-ene son consultas independientes reales", async () => {
    const { ventas } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: ventas.id, fecha: '2026-02-10', debe: 0, haber: 2000, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: ventas.id, fecha: '2026-06-10', debe: 0, haber: 3000, empresaId: EMPRESA_A });

    const er = await svcPara(EMPRESA_A).generar({
      desde: '2026-06-01', hasta: '2026-06-30', comparacion: 'mes-vs-acumulado',
    });

    expect(er.periodo.ingresos.total).toBe(3000);      // solo junio
    expect(er.acumulado?.desde).toBe('2026-01-01');
    expect(er.acumulado?.periodo.ingresos.total).toBe(5000); // feb + jun
  });

  it("comparacion='anio-anterior': mismo rango desplazado un año, con diferencias por línea; período sin datos en el año anterior da anterior=0, no null", async () => {
    const { ventas } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: ventas.id, fecha: '2026-06-10', debe: 0, haber: 4000, empresaId: EMPRESA_A });
    // Sin ningún movimiento en 2025 — período de comparación totalmente vacío.

    const er = await svcPara(EMPRESA_A).generar({
      desde: '2026-06-01', hasta: '2026-06-30', comparacion: 'anio-anterior',
    });

    expect(er.anioAnterior?.desde).toBe('2025-06-01');
    expect(er.anioAnterior?.hasta).toBe('2025-06-30');
    expect(er.anioAnterior?.periodo.ingresos.total).toBe(0);
    expect(er.anioAnterior?.diferencias.ingresos.actual).toBe(4000);
    expect(er.anioAnterior?.diferencias.ingresos.anterior).toBe(0);
    expect(er.anioAnterior?.diferencias.ingresos.diferencia).toBe(4000);
    expect(er.anioAnterior?.diferencias.ingresos.diferenciaPct).toBeNull(); // anterior=0, actual≠0
  });

  it("comparacion='por-mes': 12 meses del ejercicio + Total; un ejercicio incompleto no rompe — los meses futuros simplemente están en 0", async () => {
    const { ventas } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: ventas.id, fecha: '2026-03-10', debe: 0, haber: 1000, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: ventas.id, fecha: '2026-07-10', debe: 0, haber: 1500, empresaId: EMPRESA_A });
    // Nada en el resto de los 10 meses (incluidos los "futuros" respecto a la fecha real del fixture).

    const er = await svcPara(EMPRESA_A).generar({
      desde: '2026-01-01', hasta: '2026-12-31', comparacion: 'por-mes',
    });

    expect(er.porMes?.anio).toBe(2026);
    expect(er.porMes?.meses).toHaveLength(12);
    const marzo = er.porMes?.meses.find(m => m.mes === 3);
    const julio  = er.porMes?.meses.find(m => m.mes === 7);
    const abril  = er.porMes?.meses.find(m => m.mes === 4);
    expect(marzo?.periodo.ingresos.total).toBe(1000);
    expect(julio?.periodo.ingresos.total).toBe(1500);
    expect(abril?.periodo.ingresos.total).toBe(0);
    expect(er.porMes?.total.ingresos.total).toBe(2500); // la columna Total es UNA consulta anual, no la suma de los 12 meses
  });

  it('aislamiento multi-tenant: el Estado de Resultados de la empresa A nunca incluye cuentas ni saldos de la empresa B', async () => {
    const { ventas: ventasA } = await seedCatalogo(EMPRESA_A);
    const { ventas: ventasB } = await seedCatalogo(EMPRESA_B);
    await crearAsiento({ cuentaId: ventasA.id, fecha: '2026-06-15', debe: 0, haber: 500, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: ventasB.id, fecha: '2026-06-15', debe: 0, haber: 9_000_000, empresaId: EMPRESA_B });

    const erA = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });

    expect(erA.periodo.ingresos.total).toBe(500);
    expect(JSON.stringify(erA)).not.toContain('9000000');
  });

  it('cambiar la clasificación de una cuenta mueve la cuenta de bloque pero NO cambia la Ganancia (Pérdida) del Período', async () => {
    const { comisiones } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: comisiones.id, fecha: '2026-06-15', debe: 200, haber: 0, empresaId: EMPRESA_A });

    const antes = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(antes.periodo.otrosGastos.cuentas.map(c => c.codigo)).toEqual(['6.1.3.01']);
    expect(antes.periodo.gastos.cuentas).toHaveLength(0);

    // Reclasificar Comisiones Bancarias a operacional directamente (sin heredar).
    await cuentaRepo.update(comisiones.id, { clasificacionResultado: ClasificacionResultado.OPERACIONAL } as any);

    const despues = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(despues.periodo.gastos.cuentas.map(c => c.codigo)).toEqual(['6.1.3.01']);
    expect(despues.periodo.otrosGastos.cuentas).toHaveLength(0);
    expect(despues.periodo.gananciaPerdidaDelPeriodo.monto).toBe(antes.periodo.gananciaPerdidaDelPeriodo.monto);
  });

  it('resultado del período coincide con "Resultado del ejercicio" de Balance General a la misma fecha', async () => {
    const { ventas, intereses, costoVentas, alquiler, comisiones } = await seedCatalogo(EMPRESA_A);
    await crearAsiento({ cuentaId: ventas.id,      fecha: '2026-03-15', debe: 0,    haber: 8000, empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: intereses.id,   fecha: '2026-04-15', debe: 0,    haber: 300,  empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: costoVentas.id, fecha: '2026-05-15', debe: 3000, haber: 0,    empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: alquiler.id,    fecha: '2026-06-15', debe: 900,  haber: 0,    empresaId: EMPRESA_A });
    await crearAsiento({ cuentaId: comisiones.id,  fecha: '2026-07-15', debe: 40,   haber: 0,    empresaId: EMPRESA_A });

    const fechaCorte = '2026-08-31';
    const er = await svcPara(EMPRESA_A).generar({ desde: '2026-01-01', hasta: fechaCorte });
    const bg = await bgSvcPara(EMPRESA_A).generar({ fechaCorte });

    expect(er.periodo.gananciaPerdidaDelPeriodo.monto).toBe(bg.patrimonio.calculadas.resultadoDelEjercicio.monto);
  });
});
