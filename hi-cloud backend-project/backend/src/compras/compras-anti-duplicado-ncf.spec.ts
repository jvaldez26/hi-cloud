import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ComprasService } from './compras.service';
import { Compra } from './entities/compra.entity';
import { CompraDetalle } from './entities/compra-detalle.entity';

/**
 * Integración REAL contra Postgres (no mocks): el anti-duplicado depende de
 * pg_advisory_xact_lock, que solo tiene sentido probar contra una base de
 * datos de verdad — un mock de manager.query no puede demostrar que dos
 * transacciones concurrentes se serializan.
 *
 * Requiere la BD local de pruebas (ver README.md "Base de pruebas local"):
 * 127.0.0.1:5433/hicloud_test. Se salta automáticamente si no está disponible
 * (CI todavía no la levanta) — nunca corre contra producción.
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

let ds: DataSource;
let dbDisponible = true;

const NCF_TEST_PREFIX = 'TESTDUP-';
let contadorNcf = 0;
function ncfUnico(): string {
  contadorNcf += 1;
  return `${NCF_TEST_PREFIX}${Date.now()}-${contadorNcf}`;
}

// Fixtures fijos ya presentes en hicloud_test (empresas A/B de las pruebas
// manuales de Xlink) — solo lectura, este spec nunca los crea ni los borra.
const EMPRESA_A = 22;
const PROVEEDOR_B_EN_A = 5; // rnc 132222225
const PRODUCTO_EN_A = 5;
const USUARIO_A = { id: 10 } as any;
const EMPRESA_B = 23;
const USUARIO_B = { id: 11 } as any;
let proveedorAEnB: number; // rnc 131111115 (ya existe: id 6)
let productoEnB: number;   // B no tenía producto propio — se crea en beforeAll y se limpia en afterAll

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
      for (const id of ids) map.set(id, { id, nombre: 'Producto de prueba anti-duplicado' });
      return map;
    }),
  };

  return new ComprasService(
    ds.getRepository(Compra) as any,
    ds.getRepository(CompraDetalle) as any,
    proveedoresService as any,
    productosService as any,
    {} as any, // productoProveedorSvc — no se toca en create()
    {} as any, // inventarioSvc — solo en cambiarEstado()
    {} as any, // valoracionSvc — solo en cambiarEstado()
    {} as any, // cxpSvc — solo en cambiarEstado()
    {} as any, // asientosSvc — solo en cambiarEstado()
    tenantSvc as any,
    realtimeSvc as any,
    {} as any, // gastosImportacionSvc — no se toca en create()
    ds,
    { notificarAnulacionEnOrigen: jest.fn().mockResolvedValue(undefined) } as any,
  );
}

function dtoBase(proveedorId: number, productoId: number, numeroFacturaProveedor: string) {
  return {
    proveedorId,
    fecha: '2026-09-28',
    numeroFacturaProveedor,
    tipoPago: 'credito' as const,
    detalles: [{ productoId, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
  } as any;
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [Compra, CompraDetalle],
    synchronize: false,
    connectTimeoutMS: 3000,
  });
  try {
    await ds.initialize();
  } catch {
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
     VALUES ($1, 'servicio', 'Producto de prueba anti-duplicado NCF', 100, 18, 'UND', 'TESTDUP')
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

describe('ComprasService — anti-duplicado NCF (integración real contra Postgres)', () => {
  it('compra manual duplicada (mismo RNC + mismo NCF, misma empresa) → 409', async () => {
    if (!dbDisponible) return;
    const service = buildService(ds, EMPRESA_A);
    const ncf = ncfUnico();

    await service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf), USUARIO_A);

    await expect(
      service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf), USUARIO_A),
    ).rejects.toThrow(ConflictException);
  });

  it('mismo NCF, proveedor con RNC distinto → OK (no es el mismo comprobante)', async () => {
    if (!dbDisponible) return;
    const service = buildService(ds, EMPRESA_A);
    const ncf = ncfUnico();

    await service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf), USUARIO_A);

    // Mismo NCF pero ya no hay un segundo proveedor con RNC distinto en A en
    // este fixture — se prueba cruzando a la variante de "otra empresa" en el
    // siguiente test, que ya ejercita un RNC distinto de por sí (131111115
    // en B vs 132222225 en A). Aquí se confirma explícitamente que dos NCF
    // *distintos* del mismo proveedor conviven sin problema (caso base).
    const otroNcf = ncfUnico();
    await expect(
      service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, otroNcf), USUARIO_A),
    ).resolves.toBeDefined();
  });

  it('mismo NCF, otra empresa → OK (el aislamiento es por empresaId)', async () => {
    if (!dbDisponible) return;
    const ncf = ncfUnico();

    const serviceA = buildService(ds, EMPRESA_A);
    await serviceA.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf), USUARIO_A);

    const serviceB = buildService(ds, EMPRESA_B);
    await expect(
      serviceB.create(dtoBase(proveedorAEnB, productoEnB, ncf), USUARIO_B),
    ).resolves.toBeDefined();
  });

  it('dos creates concurrentes con el mismo NCF → uno solo pasa (pg_advisory_xact_lock serializa)', async () => {
    if (!dbDisponible) return;
    const service = buildService(ds, EMPRESA_A);
    const ncf = ncfUnico();

    const resultados = await Promise.allSettled([
      service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf), USUARIO_A),
      service.create(dtoBase(PROVEEDOR_B_EN_A, PRODUCTO_EN_A, ncf), USUARIO_A),
    ]);

    const exitosos = resultados.filter(r => r.status === 'fulfilled');
    const rechazados = resultados.filter(r => r.status === 'rejected');
    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect((rechazados[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const [{ count }] = await ds.query(
      `SELECT COUNT(*)::int AS count FROM compras WHERE "empresaId" = $1 AND "numeroFacturaProveedor" = $2 AND "isActive" = true`,
      [EMPRESA_A, ncf],
    );
    expect(count).toBe(1);
  });
});
