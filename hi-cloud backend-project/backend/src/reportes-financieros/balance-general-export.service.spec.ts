/**
 * Balance General detallado — exportación (2026-09-21). Contra Postgres
 * real: exportar SIEMPRE parte del mismo BalanceGeneralDetalladoService que
 * ya está probado a fondo (balance-general-detallado.service.spec.ts) —
 * esta suite solo confirma que las 3 salidas (Excel/CSV/PDF) reflejan los
 * filtros activos (comparativo, código, % vertical) y no rompen con datos
 * reales.
 */

import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { BalanceGeneralDetalladoService } from './balance-general-detallado.service';
import { BalanceGeneralExportService } from './balance-general-export.service';
import { SaldosCuentasService } from './saldos-cuentas.service';
import { CuentaContable, TipoCuenta, NaturalezaCuenta } from '../contabilidad/entities/cuenta-contable.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';

const TIENE_BD = !!process.env['DB_HOST'];
const EMPRESA_A = 901301;

(TIENE_BD ? describe : describe.skip)('BalanceGeneralExportService — contra Postgres real', () => {
  let dataSource: DataSource;
  let cuentaRepo: ReturnType<DataSource['getRepository']>;
  let empresaRepo: ReturnType<DataSource['getRepository']>;
  let userIdFixture: number;
  let empresaCreada = false;

  const tenantSvc = { getEmpresaId: () => EMPRESA_A, getEmpresaIdOrNull: () => EMPRESA_A } as any;

  function makeExportSvc() {
    const detalladoSvc = new BalanceGeneralDetalladoService(cuentaRepo as any, tenantSvc, new SaldosCuentasService(dataSource));
    return new BalanceGeneralExportService(detalladoSvc, tenantSvc, empresaRepo as any);
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
      `INSERT INTO users (nombre, email, password) VALUES ('Test BG Export', 'test-bg-export@example.com', 'x') RETURNING id`,
    );
    userIdFixture = id;

    const existente = await empresaRepo.findOne({ where: { id: EMPRESA_A } as any });
    if (!existente) {
      await dataSource.query(
        `INSERT INTO empresa (id, nombre, rnc, "isActive") VALUES ($1, 'Empresa Export Test', '101000001', true)
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
    const raiz = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '1', nombre: 'ACTIVOS', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 1, permiteMovimientos: false,
    } as any)) as any;
    const corriente = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '1.1', nombre: 'Activo Corriente', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 2, permiteMovimientos: false, cuentaPadreId: raiz.id,
    } as any)) as any;
    const caja = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '1.1.1.01', nombre: 'Caja General', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true, cuentaPadreId: corriente.id,
    } as any)) as any;
    await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '2', nombre: 'PASIVOS', tipo: TipoCuenta.PASIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: false,
    } as any));
    await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '3', nombre: 'PATRIMONIO', tipo: TipoCuenta.PATRIMONIO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: false,
    } as any));

    const [{ id: asientoId }] = await dataSource.query(
      `INSERT INTO asientos_contables (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
       VALUES ($1, '2026-06-15', 'Fixture export', 'manual', 'contabilizado', 2000, 2000, $2, $3, true) RETURNING id`,
      [`TEST-EXP-${Math.random().toString(36).slice(2)}`, userIdFixture, EMPRESA_A],
    );
    await dataSource.query(
      `INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId")
       VALUES ($1, $2, 'Línea fixture', 2000, 0, $3)`,
      [asientoId, caja.id, EMPRESA_A],
    );
  }

  it('Excel: genera un libro con encabezado + filas del árbol aplanado (sin columnas de comparativo si no aplica)', async () => {
    await seedCatalogoYSaldo();
    const { buffer, filename } = await makeExportSvc().generarExcel({ fechaCorte: '2026-06-30', nivelDetalle: 'todos' });

    expect(filename).toBe('Balance-General-2026-06-30.xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Balance General'], { header: 1, raw: false });
    const encabezado = filas[4]; // 4 filas de encabezado de empresa antes de la tabla
    expect(encabezado).toEqual(['Sección', 'Código', 'Cuenta', 'Monto', '% Vertical']);
    const filaCaja = filas.find(f => f[1] === '1.1.1.01');
    expect(filaCaja?.[3]).toBe('2000');
  });

  it('Excel con comparativo activo agrega columnas Comparado/Diferencia/% Diferencia', async () => {
    await seedCatalogoYSaldo();
    const { buffer } = await makeExportSvc().generarExcel({
      fechaCorte: '2026-06-30', compararCon: 'cierre-anio-anterior', nivelDetalle: 'todos',
    });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Balance General'], { header: 1, raw: false });
    expect(filas[4]).toEqual(['Sección', 'Código', 'Cuenta', 'Monto', '% Vertical', 'Comparado', 'Diferencia', '% Diferencia']);
  });

  it('Excel respeta mostrarCodigo=false (sin columna Código)', async () => {
    await seedCatalogoYSaldo();
    const { buffer } = await makeExportSvc().generarExcel(
      { fechaCorte: '2026-06-30', nivelDetalle: 'todos' }, { mostrarCodigo: false },
    );
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Balance General'], { header: 1, raw: false });
    expect(filas[4]).toEqual(['Sección', 'Cuenta', 'Monto', '% Vertical']);
  });

  it('CSV: trae BOM UTF-8, encabezado y filas separadas por coma', async () => {
    await seedCatalogoYSaldo();
    const { buffer, filename } = await makeExportSvc().generarCsv({ fechaCorte: '2026-06-30', nivelDetalle: 'todos' });
    expect(filename).toBe('Balance-General-2026-06-30.csv');
    const texto = buffer.toString('utf8');
    expect(texto.charCodeAt(0)).toBe(0xFEFF);
    expect(texto).toContain('Sección,Código,Cuenta,Monto,% Vertical');
    expect(texto).toContain('1.1.1.01');
  });

  it('PDF: genera un buffer no vacío que empieza con la cabecera %PDF', async () => {
    await seedCatalogoYSaldo();
    const { buffer, filename } = await makeExportSvc().generarPdf({ fechaCorte: '2026-06-30' });
    expect(filename).toBe('Balance-General-2026-06-30.pdf');
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });
});
