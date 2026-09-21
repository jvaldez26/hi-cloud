/**
 * NUEVO — Importación de Plan de Cuentas por plantilla (2026-09-21).
 *
 * Contra Postgres real (TIENE_BD, se salta en CI) — un archivo mal armado,
 * un ciclo en la jerarquía, o el orden de inserción madre-antes-que-hija no
 * se verifican de forma confiable con mocks. Cubre los 6 escenarios
 * pedidos (jerarquía desordenada, madre inexistente, código duplicado,
 * cambio de naturaleza en cuenta con movimientos, archivo vacío, columnas
 * faltantes) más aislamiento multi-tenant.
 */

import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import { ImportacionCuentasService } from './importacion-cuentas.service';
import { CuentaContable, TipoCuenta, NaturalezaCuenta } from '../entities/cuenta-contable.entity';
import { CuentaAnexoIR2 } from '../entities/cuenta-anexo-ir2.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { AsientoContable } from '../entities/asiento-contable.entity';
import { AuditLog } from '../../auditoria/entities/audit-log.entity';
import { User } from '../../users/users.entity';
import { SaldosCuentasService } from '../../reportes-financieros/saldos-cuentas.service';
import { AuditoriaService } from '../../auditoria/auditoria.service';

const TIENE_BD = !!process.env['DB_HOST'];

const EMPRESA_A = 902101;
const EMPRESA_B = 902102;

const HEADERS = [
  'Código', 'Nombre', 'Tipo', 'Naturaleza', 'Código cuenta madre',
  'Es cuenta grupo', 'Anexo IR-2', 'Activa', 'Moneda',
];

function construirXlsx(filas: (string | number)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...filas]);
  XLSX.utils.book_append_sheet(wb, ws, 'Cuentas');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

(TIENE_BD ? describe : describe.skip)('ImportacionCuentasService — contra Postgres real', () => {
  let dataSource: DataSource;
  let svc: ImportacionCuentasService;
  let userIdFixture: number;
  let asientoIdFixture: number;
  const cuentaIdsCreados: number[] = [];
  const empresaIdsUsadas = [EMPRESA_A, EMPRESA_B];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [CuentaContable, CuentaAnexoIR2, AsientoLinea, AsientoContable, AuditLog, User],
    });
    await dataSource.initialize();

    const saldosService = new SaldosCuentasService(dataSource);
    const auditRepo = dataSource.getRepository(AuditLog);
    const auditoriaService = new AuditoriaService(auditRepo as any);

    svc = Object.create(ImportacionCuentasService.prototype);
    (svc as any).cuentaRepository = dataSource.getRepository(CuentaContable);
    (svc as any).anexoRepository  = dataSource.getRepository(CuentaAnexoIR2);
    (svc as any).lineaRepository  = dataSource.getRepository(AsientoLinea);
    (svc as any).saldosService    = saldosService;
    (svc as any).auditoriaService = auditoriaService;
    (svc as any).dataSource       = dataSource;
    (svc as any).logger           = { warn: () => {}, error: () => {}, log: () => {} };

    // Usuario y asiento reales — asiento_lineas.asientoId y
    // asientos_contables.userId tienen FK de verdad en la BD.
    const [{ id: userIdRow }] = await dataSource.query<{ id: number }[]>(
      `INSERT INTO users (nombre, email, password, role)
       VALUES ('Test Import Cuentas', 'test-import-cuentas@hicloud.local', 'x', 'admin')
       RETURNING id`,
    );
    userIdFixture = userIdRow;
    const asiento = await dataSource.getRepository(AsientoContable).save(
      dataSource.getRepository(AsientoContable).create({
        empresaId: EMPRESA_A, numero: 'TEST-IMPORT-1', fecha: new Date(), descripcion: 'Asiento de prueba — import cuentas',
        userId: userIdFixture,
      }),
    );
    asientoIdFixture = asiento.id;
  }, 30_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DELETE FROM audit_logs WHERE "empresaId" = ANY($1)`, [empresaIdsUsadas]);
      await dataSource.query(`DELETE FROM asiento_lineas WHERE "empresaId" = ANY($1)`, [empresaIdsUsadas]);
      await dataSource.query(`DELETE FROM asientos_contables WHERE "empresaId" = ANY($1)`, [empresaIdsUsadas]);
      await dataSource.query(`DELETE FROM cuenta_anexo_ir2 WHERE "empresaId" = ANY($1)`, [empresaIdsUsadas]);
      // Hijas antes que madres, por la FK — sin ORDER BY (Postgres no lo
      // soporta en DELETE), en pasadas: cada vuelta borra hojas (sin hijas).
      for (let i = 0; i < 4; i++) {
        await dataSource.query(
          `DELETE FROM cuentas_contables c WHERE c."empresaId" = ANY($1) AND NOT EXISTS (SELECT 1 FROM cuentas_contables h WHERE h."cuentaPadreId" = c.id)`,
          [empresaIdsUsadas],
        );
      }
      if (userIdFixture) await dataSource.query(`DELETE FROM users WHERE id = $1`, [userIdFixture]);
      await dataSource.destroy();
    }
  });

  function comoEmpresa(empresaId: number, userId = 501, userName = 'Test Import') {
    (svc as any).tenantService = { getEmpresaId: () => empresaId };
    return { svc, usuario: { id: userId, nombre: userName } };
  }

  beforeEach(async () => {
    // Aislar cada test: limpiar el catálogo de ambas empresas antes de cada uno.
    // asiento_lineas primero — si un test anterior (la de "cuenta con
    // movimientos") dejó una línea contra una cuenta, esa cuenta no se puede
    // borrar hasta soltar esa FK.
    for (const eid of empresaIdsUsadas) {
      await dataSource.query(`DELETE FROM asiento_lineas WHERE "empresaId" = $1`, [eid]);
      await dataSource.query(`DELETE FROM cuenta_anexo_ir2 WHERE "empresaId" = $1`, [eid]);
      for (let i = 0; i < 4; i++) {
        await dataSource.query(
          `DELETE FROM cuentas_contables c WHERE c."empresaId" = $1 AND NOT EXISTS (SELECT 1 FROM cuentas_contables h WHERE h."cuentaPadreId" = c.id)`,
          [eid],
        );
      }
    }
  });

  // ── 1. Jerarquía desordenada en el archivo ───────────────────────────────
  it('archivo válido con jerarquía DESORDENADA (hija antes que madre en el archivo): igual inserta madre primero', async () => {
    const { svc: s, usuario } = comoEmpresa(EMPRESA_A);
    const buf = construirXlsx([
      ['9.1.1', 'Caja', 'activo', 'deudora', '9.1', 'NO', '', 'SI', ''], // hija PRIMERO en el archivo
      ['9.1',   'Activo', 'activo', 'deudora', '', 'SI', '', 'SI', ''],  // madre SEGUNDO
    ]);

    const r = await s.ejecutar(buf, usuario);
    expect(r.errores).toHaveLength(0);
    expect(r.creadas).toBe(2);

    const madre = await dataSource.getRepository(CuentaContable).findOne({ where: { empresaId: EMPRESA_A, codigo: '9.1' } });
    const hija  = await dataSource.getRepository(CuentaContable).findOne({ where: { empresaId: EMPRESA_A, codigo: '9.1.1' } });
    expect(madre).toBeTruthy();
    expect(hija!.cuentaPadreId).toBe(madre!.id);
    expect(hija!.nivel).toBe(2);
    expect(madre!.nivel).toBe(1);
  });

  // ── 2. Madre inexistente ─────────────────────────────────────────────────
  it('código madre que no existe ni en la BD ni en el archivo: rechaza SOLO esa fila', async () => {
    const { svc: s, usuario } = comoEmpresa(EMPRESA_A);
    const buf = construirXlsx([
      ['9.9.9', 'Huérfana', 'activo', 'deudora', '9.9.NOEXISTE', 'NO', '', 'SI', ''],
      ['9.2',   'Otra cuenta válida', 'pasivo', 'acreedora', '', 'NO', '', 'SI', ''],
    ]);

    const r = await s.previsualizar(buf);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].motivo).toMatch(/madre "9.9.NOEXISTE" no existe/);
    expect(r.crear.map(c => c.codigo)).toEqual(['9.2']); // la otra fila, válida, sigue adelante
  });

  // ── 3. Código duplicado ──────────────────────────────────────────────────
  it('código duplicado DENTRO del archivo: rechaza AMBAS filas', async () => {
    const { svc: s } = comoEmpresa(EMPRESA_A);
    const buf = construirXlsx([
      ['9.3', 'Primera versión', 'gasto', 'deudora', '', 'NO', '', 'SI', ''],
      ['9.3', 'Segunda versión (contradice)', 'gasto', 'deudora', '', 'NO', '', 'SI', ''],
    ]);

    const r = await s.previsualizar(buf);
    expect(r.crear).toHaveLength(0);
    expect(r.errores).toHaveLength(2);
    expect(r.errores.every(e => e.motivo.includes('duplicado'))).toBe(true);
  });

  // ── 4. Cambio de naturaleza en cuenta con movimientos ───────────────────
  it('cuenta con movimientos: NO permite cambiar naturaleza (rechaza la fila) pero SÍ permite renombrar', async () => {
    const { svc: s, usuario } = comoEmpresa(EMPRESA_A);
    const cuentaRepo = dataSource.getRepository(CuentaContable);
    const lineaRepo  = dataSource.getRepository(AsientoLinea);

    const cuenta = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '9.4', nombre: 'Cuenta con movimientos', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 1, permiteMovimientos: true, isActive: true,
    }));
    cuentaIdsCreados.push(cuenta.id);
    await lineaRepo.save(lineaRepo.create({
      empresaId: EMPRESA_A, asientoId: asientoIdFixture, cuentaContableId: cuenta.id,
      descripcion: 'Movimiento de prueba', debe: 100, haber: 0,
    } as any));

    // Intento 1: cambia naturaleza (deudora → acreedora) — debe rechazarse.
    const bufCambioNaturaleza = construirXlsx([
      ['9.4', 'Cuenta con movimientos', 'gasto', 'acreedora', '', 'NO', '', 'SI', ''],
    ]);
    const r1 = await s.previsualizar(bufCambioNaturaleza);
    expect(r1.actualizar).toHaveLength(0);
    expect(r1.errores).toHaveLength(1);
    expect(r1.errores[0].motivo).toMatch(/no se le puede cambiar el tipo ni la naturaleza/);

    // Intento 2: solo renombra, tipo/naturaleza intactos — debe pasar.
    const bufSoloNombre = construirXlsx([
      ['9.4', 'Cuenta con movimientos (renombrada)', 'gasto', 'deudora', '', 'NO', '', 'SI', ''],
    ]);
    const r2 = await s.previsualizar(bufSoloNombre);
    expect(r2.errores).toHaveLength(0);
    expect(r2.actualizar).toHaveLength(1);
    expect(r2.actualizar[0].cambios).toEqual([{ campo: 'nombre', antes: 'Cuenta con movimientos', despues: 'Cuenta con movimientos (renombrada)' }]);
  });

  // ── 5. Archivo vacío ─────────────────────────────────────────────────────
  it('archivo vacío (sin encabezado siquiera): rechaza con mensaje claro', async () => {
    const { svc: s } = comoEmpresa(EMPRESA_A);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    await expect(s.previsualizar(buf)).rejects.toThrow(BadRequestException);
  });

  it('archivo con encabezado pero SIN filas de datos: rechaza con mensaje claro', async () => {
    const { svc: s } = comoEmpresa(EMPRESA_A);
    const buf = construirXlsx([]);
    await expect(s.previsualizar(buf)).rejects.toThrow(/sin ninguna fila de datos/);
  });

  // ── 6. Columnas faltantes ────────────────────────────────────────────────
  it('archivo con columnas obligatorias faltantes (falta Naturaleza): rechaza el archivo entero', async () => {
    const { svc: s } = comoEmpresa(EMPRESA_A);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Código', 'Nombre', 'Tipo'], // sin Naturaleza
      ['9.5', 'Cuenta sin naturaleza', 'activo'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    await expect(s.previsualizar(buf)).rejects.toThrow(/Naturaleza/);
  });

  // ── Jerarquía circular ───────────────────────────────────────────────────
  it('jerarquía circular (A es madre de B, B es madre de A): rechaza ambas filas', async () => {
    const { svc: s } = comoEmpresa(EMPRESA_A);
    const buf = construirXlsx([
      ['9.6', 'Cuenta A', 'activo', 'deudora', '9.7', 'SI', '', 'SI', ''],
      ['9.7', 'Cuenta B', 'activo', 'deudora', '9.6', 'SI', '', 'SI', ''],
    ]);
    const r = await s.previsualizar(buf);
    expect(r.crear).toHaveLength(0);
    expect(r.errores.length).toBeGreaterThanOrEqual(2);
    expect(r.errores.every(e => e.motivo.includes('circular'))).toBe(true);
  });

  // ── Preview no escribe nada ──────────────────────────────────────────────
  it('previsualizar() nunca escribe en la base de datos', async () => {
    const { svc: s } = comoEmpresa(EMPRESA_A);
    const buf = construirXlsx([['9.8', 'No debería crearse', 'activo', 'deudora', '', 'NO', '', 'SI', '']]);
    await s.previsualizar(buf);
    const existe = await dataSource.getRepository(CuentaContable).findOne({ where: { empresaId: EMPRESA_A, codigo: '9.8' } });
    expect(existe).toBeNull();
  });

  // ── noTocadas ────────────────────────────────────────────────────────────
  it('cuentas existentes que NO vienen en el archivo: se cuentan en noTocadas y no se tocan', async () => {
    const cuentaRepo = dataSource.getRepository(CuentaContable);
    const intacta = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '9.99', nombre: 'No debe tocarse', tipo: TipoCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: true, isActive: true,
    }));

    const { svc: s } = comoEmpresa(EMPRESA_A);
    const buf = construirXlsx([['9.98', 'Cuenta distinta', 'ingreso', 'acreedora', '', 'NO', '', 'SI', '']]);
    const r = await s.previsualizar(buf);
    expect(r.noTocadas).toBeGreaterThanOrEqual(1);

    const sigueIgual = await cuentaRepo.findOne({ where: { id: intacta.id } });
    expect(sigueIgual!.nombre).toBe('No debe tocarse');
  });

  // ── Auditoría ────────────────────────────────────────────────────────────
  it('ejecutar() registra en auditoría quién importó y cuántas cuentas creó/actualizó', async () => {
    const { svc: s, usuario } = comoEmpresa(EMPRESA_A, 777, 'Contador de Prueba');
    const buf = construirXlsx([['9.10', 'Cuenta auditada', 'activo', 'deudora', '', 'NO', '', 'SI', '']]);
    await s.ejecutar(buf, usuario);

    const log = await dataSource.getRepository(AuditLog).findOne({
      where: { empresaId: EMPRESA_A, modulo: 'contabilidad' }, order: { id: 'DESC' },
    });
    expect(log).toBeTruthy();
    expect(log!.userId).toBe(777);
    expect(log!.userName).toBe('Contador de Prueba');
    expect(log!.descripcion).toMatch(/1 cuenta\(s\) creada\(s\)/);
  });

  // ── Multi-tenant ─────────────────────────────────────────────────────────
  it('multi-tenant: importar en la Empresa A nunca toca el catálogo de la Empresa B', async () => {
    const cuentaRepo = dataSource.getRepository(CuentaContable);
    const deB = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_B, codigo: '9.1', nombre: 'Cuenta de la Empresa B', tipo: TipoCuenta.PASIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: true, isActive: true,
    }));

    // Mismo código "9.1" en un archivo importado para la Empresa A — no debe
    // colisionar ni actualizar la cuenta de B (el código es único POR empresa).
    const { svc: s, usuario } = comoEmpresa(EMPRESA_A);
    const buf = construirXlsx([['9.1', 'Cuenta de la Empresa A', 'activo', 'deudora', '', 'NO', '', 'SI', '']]);
    const r = await s.ejecutar(buf, usuario);
    expect(r.creadas).toBe(1); // se CREÓ en A, no se "actualizó" la de B

    const sigueSiendoDeB = await cuentaRepo.findOne({ where: { id: deB.id } });
    expect(sigueSiendoDeB!.nombre).toBe('Cuenta de la Empresa B');
    expect(sigueSiendoDeB!.empresaId).toBe(EMPRESA_B);
  });
});
