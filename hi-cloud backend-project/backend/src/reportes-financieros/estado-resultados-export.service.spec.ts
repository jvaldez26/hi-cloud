/**
 * Estado de Resultados detallado — exportación (2026-09-21). Contra Postgres
 * real: exportar SIEMPRE parte del mismo EstadoResultadosDetalladoService,
 * ya probado a fondo (estado-resultados-detallado.service.spec.ts) — esta
 * suite solo confirma que las 3 salidas (Excel/CSV/PDF) reflejan la vista de
 * comparación activa y no rompen con datos reales, incluida "Por mes".
 */

import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { EstadoResultadosDetalladoService } from './estado-resultados-detallado.service';
import { EstadoResultadosExportService } from './estado-resultados-export.service';
import { SaldosCuentasService } from './saldos-cuentas.service';
import { CuentaContable, TipoCuenta, NaturalezaCuenta } from '../contabilidad/entities/cuenta-contable.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';

const TIENE_BD = !!process.env['DB_HOST'];
const EMPRESA_A = 901601;

(TIENE_BD ? describe : describe.skip)('EstadoResultadosExportService — contra Postgres real', () => {
  let dataSource: DataSource;
  let cuentaRepo: ReturnType<DataSource['getRepository']>;
  let empresaRepo: ReturnType<DataSource['getRepository']>;
  let userIdFixture: number;
  let empresaCreada = false;

  const tenantSvc = { getEmpresaId: () => EMPRESA_A, getEmpresaIdOrNull: () => EMPRESA_A } as any;

  function makeExportSvc() {
    const detalladoSvc = new EstadoResultadosDetalladoService(cuentaRepo as any, tenantSvc, new SaldosCuentasService(dataSource));
    return new EstadoResultadosExportService(detalladoSvc, tenantSvc, empresaRepo as any);
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [CuentaContable, Empresa],
    });
    await dataSource.initialize();
    cuentaRepo  = dataSource.getRepository(CuentaContable);
    empresaRepo = dataSource.getRepository(Empresa);

    const [{ id }] = await dataSource.query(
      `INSERT INTO users (nombre, email, password) VALUES ('Test ER Export', 'test-er-export@example.com', 'x') RETURNING id`,
    );
    userIdFixture = id;

    const existente = await empresaRepo.findOne({ where: { id: EMPRESA_A } as any });
    if (!existente) {
      await dataSource.query(
        `INSERT INTO empresa (id, nombre, rnc, "isActive") VALUES ($1, 'Empresa ER Export Test', '101000002', true)
         ON CONFLICT (id) DO NOTHING`,
        [EMPRESA_A],
      );
      empresaCreada = true;
    }
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM asiento_lineas WHERE "empresaId" = $1`, [EMPRESA_A]);
    await dataSource.query(`DELETE FROM asientos_contables WHERE "empresaId" = $1`, [EMPRESA_A]);
    await dataSource.query(`DELETE FROM cuentas_contables WHERE "empresaId" = $1`, [EMPRESA_A]);
    if (empresaCreada) await dataSource.query(`DELETE FROM empresa WHERE id = $1`, [EMPRESA_A]);
    await dataSource.query(`DELETE FROM users WHERE id = $1`, [userIdFixture]);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM asiento_lineas WHERE "empresaId" = $1`, [EMPRESA_A]);
    await dataSource.query(`DELETE FROM asientos_contables WHERE "empresaId" = $1`, [EMPRESA_A]);
    await dataSource.query(`DELETE FROM cuentas_contables WHERE "empresaId" = $1`, [EMPRESA_A]);
  });

  async function seedCatalogoYSaldo() {
    const ventas = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '4.1.1.01', nombre: 'Ventas de Bienes', tipo: TipoCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 4, permiteMovimientos: true,
    } as any)) as any;
    await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '6.1.2.01', nombre: 'Alquiler', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
    } as any));

    const [{ id: asientoId }] = await dataSource.query(
      `INSERT INTO asientos_contables (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
       VALUES ($1, '2026-06-15', 'Fixture export ER', 'manual', 'contabilizado', 3000, 3000, $2, $3, true) RETURNING id`,
      [`TST-EXP-${Math.random().toString(36).slice(2, 10)}`, userIdFixture, EMPRESA_A],
    );
    await dataSource.query(
      `INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId")
       VALUES ($1, $2, 'Línea fixture', 0, 3000, $3)`,
      [asientoId, ventas.id, EMPRESA_A],
    );
  }

  it('Excel: genera un libro con encabezado + filas de bloques aplanados', async () => {
    await seedCatalogoYSaldo();
    const { buffer, filename } = await makeExportSvc().generarExcel({ desde: '2026-01-01', hasta: '2026-12-31' });

    expect(filename).toBe('Estado-Resultados-2026-01-01_2026-12-31.xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Estado de Resultados'], { header: 1, raw: false });
    const encabezado = filas[4];
    expect(encabezado).toEqual(['Bloque', 'Cuenta', 'Monto', '% Ingresos', '% Margen']);
    const filaVentas = filas.find(f => f[1] === 'Ventas de Bienes');
    expect(filaVentas?.[2]).toBe('3000');
  });

  it('Excel con comparacion=anio-anterior agrega columnas Año anterior/Diferencia', async () => {
    await seedCatalogoYSaldo();
    const { buffer } = await makeExportSvc().generarExcel({
      desde: '2026-06-01', hasta: '2026-06-30', comparacion: 'anio-anterior',
    });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Estado de Resultados'], { header: 1, raw: false });
    expect(filas[4]).toEqual(['Bloque', 'Cuenta', 'Monto', '% Ingresos', '% Margen', 'Año anterior', 'Diferencia', '% Diferencia']);
  });

  it("Excel con comparacion='por-mes' genera una hoja con 12 columnas de mes + Total", async () => {
    await seedCatalogoYSaldo();
    const { buffer } = await makeExportSvc().generarExcel({
      desde: '2026-01-01', hasta: '2026-12-31', comparacion: 'por-mes',
    });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Por mes'], { header: 1, raw: false });
    const encabezado = filas[4];
    expect(encabezado).toHaveLength(14); // 'Bloque / Línea' + 12 meses + 'Total'
    expect(encabezado[encabezado.length - 1]).toBe('Total');
    const filaTotalIngresos = filas.find(f => f[0] === 'Total Ingresos');
    expect(filaTotalIngresos?.[encabezado.length - 1]).toBe('3000'); // columna Total
  });

  it('CSV: trae BOM UTF-8, encabezado y filas separadas por coma', async () => {
    await seedCatalogoYSaldo();
    const { buffer, filename } = await makeExportSvc().generarCsv({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(filename).toBe('Estado-Resultados-2026-01-01_2026-12-31.csv');
    const texto = buffer.toString('utf8');
    expect(texto.charCodeAt(0)).toBe(0xFEFF);
    expect(texto).toContain('Bloque,Cuenta,Monto,% Ingresos,% Margen');
    expect(texto).toContain('Ventas de Bienes');
  });

  it('PDF: genera un buffer no vacío que empieza con la cabecera %PDF', async () => {
    await seedCatalogoYSaldo();
    const { buffer, filename } = await makeExportSvc().generarPdf({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(filename).toBe('Estado-Resultados-2026-01-01_2026-12-31.pdf');
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });
});
