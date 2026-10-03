import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ComprasService } from './compras.service';
import { Compra } from './entities/compra.entity';
import { CompraDetalle } from './entities/compra-detalle.entity';
import { Producto } from '../productos/entities/producto.entity';

/**
 * Integración REAL contra Postgres (no mocks) — idempotencia de la
 * recuperación de borradores (Fase 2). Mismo motivo que
 * compras-anti-duplicado-ncf.spec.ts: el caso de carrera concurrente
 * depende del índice único (empresaId, claveIdempotencia) de verdad, algo
 * que un mock de repositorio no puede demostrar.
 *
 * Requiere la BD local de pruebas: 127.0.0.1:5433/hicloud_test. Se salta
 * automáticamente si no está disponible — nunca corre contra producción.
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

let ds: DataSource;
let dbDisponible = true;

const NCF_TEST_PREFIX = 'TESTIDEMP-';
let contadorNcf = 0;
function ncfUnico(): string {
  contadorNcf += 1;
  return `${NCF_TEST_PREFIX}${Date.now()}-${contadorNcf}`;
}

// Mismos fixtures fijos que compras-anti-duplicado-ncf.spec.ts.
const EMPRESA_A = 22;
const PROVEEDOR_B_EN_A = 5; // rnc 132222225
const PRODUCTO_EN_A = 5;
const USUARIO_A = { id: 10 } as any;
const EMPRESA_B = 23;
const USUARIO_B = { id: 11 } as any;
let proveedorAEnB: number;
let productoEnB: number;

function buildService(ds: DataSource, empresaId: number) {
  const tenantSvc = {
    getEmpresaId: () => empresaId,
    getAlmacenId: () => undefined,
    resolveSucursalId: jest.fn().mockResolvedValue(undefined),
  };
  const realtimeSvc = { notify: jest.fn() };
  const proveedoresService = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
  const productosService = {
    findByIds: jest.fn(async (ids: number[]) => {
      const map = new Map<number, any>();
      for (const id of ids) map.set(id, { id, nombre: 'Producto de prueba idempotencia' });
      return map;
    }),
  };

  return new ComprasService(
    ds.getRepository(Compra) as any,
    ds.getRepository(CompraDetalle) as any,
    proveedoresService as any,
    productosService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    tenantSvc as any,
    realtimeSvc as any,
    {} as any,
    ds,
    { notificarAnulacionEnOrigen: jest.fn().mockResolvedValue(undefined) } as any,
  );
}

function dtoBase(proveedorId: number, productoId: number, numeroFacturaProveedor: string, claveIdempotencia?: string) {
  return {
    proveedorId,
    fecha: '2026-09-28',
    numeroFacturaProveedor,
    tipoPago: 'credito' as const,
    detalles: [{ productoId, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
    claveIdempotencia,
  } as any;
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    // Producto: CompraDetalle.producto es un @ManyToOne hacia Producto — sin
    // incluirla aquí, TypeORM a veces falla al construir la metadata de
    // forma intermitente. Ver mismo comentario en
    // compras-anti-duplicado-ncf.spec.ts.
    entities: [Compra, CompraDetalle, Producto],
    synchronize: false,
    connectTimeoutMS: 3000,
  });
  try {
    await ds.initialize();
  } catch (err) {
    // DB_HOST configurado pero initialize() falló: es un bug real (credenciales,
    // metadata de entidades, etc.), no "no disponible" — nunca debe pasar en
    // verde. Solo se salta de verdad cuando NO hay DB_HOST (CI sin Postgres).
    if (process.env['DB_HOST']) throw err;
    dbDisponible = false;
    return;
  }

  const [prov] = await ds.query(
    `SELECT id FROM proveedores WHERE "empresaId" = $1 AND rnc = '131111115' LIMIT 1`,
    [EMPRESA_B],
  );
  proveedorAEnB = prov.id;

  const [prod] = await ds.query(
    `INSERT INTO productos ("empresaId", tipo, nombre, precio, "porcentajeIva", "unidadMedida", codigo)
     VALUES ($1, 'servicio', 'Producto de prueba idempotencia', 100, 18, 'UND', 'TESTIDEMP')
     RETURNING id`,
    [EMPRESA_B],
  );
  productoEnB = prod.id;
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.query(`DELETE FROM compra_detalles WHERE "compraId" IN (SELECT id FROM compras WHERE "numeroFacturaProveedor" LIKE $1)`, [`${NCF_TEST_PREFIX}%`]);
  await ds.query(`DELETE FROM compras WHERE "numeroFacturaProveedor" LIKE $1`, [`${NCF_TEST_PREFIX}%`]);
  await ds.query(`DELETE FROM productos WHERE id = $1`, [productoEnB]);
  await ds.destroy();
});

describe('ComprasService — idempotencia (integración real contra Postgres)', () => {
  it('reintento con la misma clave devuelve la compra YA creada, sin duplicar ni dar 409', async () => {
    if (!dbDisponible) return;
    const service = buildService(ds, EMPRESA_A);
    const ncf = ncfUnico();
    const clave = `clave-reintento-${Date.now()}`;

    const primera  = await service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf, clave), USUARIO_A);
    const segunda  = await service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf, clave), USUARIO_A);

    expect((segunda as any).id).toBe((primera as any).id);

    const [{ count }] = await ds.query(
      `SELECT COUNT(*)::int AS count FROM compras WHERE "empresaId" = $1 AND "claveIdempotencia" = $2`,
      [EMPRESA_A, clave],
    );
    expect(count).toBe(1);
  });

  it('dos creates concurrentes con la MISMA clave → ambos resuelven (ninguno 409), un solo registro', async () => {
    if (!dbDisponible) return;
    const service = buildService(ds, EMPRESA_A);
    const ncf = ncfUnico();
    const clave = `clave-concurrente-${Date.now()}`;

    const resultados = await Promise.allSettled([
      service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf, clave), USUARIO_A),
      service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf, clave), USUARIO_A),
    ]);

    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(2);

    const ids = resultados
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value.id);
    expect(ids[0]).toBe(ids[1]); // la misma compra para ambos

    const [{ count }] = await ds.query(
      `SELECT COUNT(*)::int AS count FROM compras WHERE "empresaId" = $1 AND "claveIdempotencia" = $2`,
      [EMPRESA_A, clave],
    );
    expect(count).toBe(1);
  });

  it('una clave NUEVA (nunca usada) con el NCF ya tomado por OTRA compra → sigue dando 409 — la idempotencia no tapa el anti-duplicado de NCF', async () => {
    if (!dbDisponible) return;
    const service = buildService(ds, EMPRESA_A);
    const ncf = ncfUnico();

    await service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf, `clave-original-${Date.now()}`), USUARIO_A);

    const claveNueva = `clave-nueva-${Date.now()}`;
    await expect(
      service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf, claveNueva), USUARIO_A),
    ).rejects.toThrow(ConflictException);
  });

  it('porClaveIdempotencia: una clave que sí generó una compra, pero en OTRA empresa, responde existe:false', async () => {
    if (!dbDisponible) return;
    const ncf = ncfUnico();
    const clave = `clave-cross-tenant-${Date.now()}`;

    const serviceA = buildService(ds, EMPRESA_A);
    await serviceA.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf, clave), USUARIO_A);

    const serviceB = buildService(ds, EMPRESA_B);
    await expect(serviceB.porClaveIdempotencia(clave)).resolves.toEqual({ existe: false });

    // Y la propia empresa SÍ la ve:
    await expect(serviceA.porClaveIdempotencia(clave)).resolves.toEqual(
      expect.objectContaining({ existe: true, folio: expect.stringContaining('COM-') }),
    );
  });
});
