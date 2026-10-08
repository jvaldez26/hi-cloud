import { DataSource } from 'typeorm';
import { InventarioService } from './inventario.service';
import { Movimiento } from './entities/movimiento.entity';
import { Producto } from '../productos/entities/producto.entity';
import { LoteProducto } from './entities/lote-producto.entity';
import { SerialProducto } from './entities/serial-producto.entity';
import { SolicitudAjuste } from './entities/solicitud-ajuste.entity';

/**
 * Integración REAL contra Postgres — prueba que registrarSalida(..., manager)
 * participa de verdad de una transacción SQL, no solo que recibe el
 * parámetro. Lo que esto demuestra y un test con repos mockeados NO puede: si
 * algo falla DESPUÉS de registrarSalida() dentro de la MISMA transacción
 * (el caso real: CxC falló tras descontar inventario — Sentry #7779557844,
 * confirmado en producción con FAC-15929/1530/12121), un ROLLBACK de verdad
 * deja el stock y el movimiento como si la salida nunca hubiera ocurrido —
 * no una compensación a posteriori, sino que la fila nunca llegó a
 * confirmarse.
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
let svc: InventarioService;
let empresaId: number;
let almacenId: number;
let productoId: number;
let userId: number;

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [Movimiento, Producto, LoteProducto, SerialProducto, SolicitudAjuste],
    synchronize: false, connectTimeoutMS: 3000,
  });
  try {
    await ds.initialize();
  } catch (err) {
    if (process.env['DB_HOST']) throw err;
    dbDisponible = false;
    return;
  }

  const [empresa] = await ds.query(`INSERT INTO empresa (rnc, nombre, "xlinkId") VALUES ($1, $2, $3) RETURNING id`,
    ['000INVTXN', 'TEST-INVENTARIO-TRANSACCION', require('crypto').randomUUID()]);
  empresaId = empresa.id;

  const [usuario] = await ds.query(`INSERT INTO users (nombre, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    ['Test Inventario Tx', `test-inventario-tx-${Date.now()}@hicloud.test`, 'x', 'admin']);
  userId = usuario.id;

  const [almacen] = await ds.query(`
    INSERT INTO almacenes ("empresaId", nombre, activo, "isActive") VALUES ($1, $2, true, true) RETURNING id
  `, [empresaId, 'Almacén Test Tx']);
  almacenId = almacen.id;

  const [producto] = await ds.query(`
    INSERT INTO productos ("empresaId", nombre, precio, stock, tipo, "isActive")
    VALUES ($1, $2, 100, 50, 'producto', true) RETURNING id
  `, [empresaId, 'Producto Test Tx']);
  productoId = producto.id;

  svc = new InventarioService(
    ds.getRepository(Movimiento),
    ds.getRepository(Producto),
    {} as any, {} as any, {} as any,
    ds,
    { notify: () => undefined } as any,
    { getEmpresaId: () => empresaId, getAlmacenId: () => undefined, getSucursalId: () => undefined } as any,
    {} as any,
    {} as any,
  );
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.query(`DELETE FROM movimientos_inventario WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM stock_almacen WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM productos WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM almacenes WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM users WHERE id = $1`, [userId]);
  await ds.query(`DELETE FROM empresa WHERE id = $1`, [empresaId]);
  await ds.destroy();
});

describe('InventarioService.registrarSalida(..., manager) — transacción real', () => {
  it('se salta si no hay BD local (nunca corre contra producción)', () => {
    expect(typeof dbDisponible).toBe('boolean');
  });

  it('rollback real: si algo falla DESPUÉS de registrarSalida en la misma transacción, el stock y el movimiento quedan como si nunca hubiera pasado', async () => {
    if (!dbDisponible) return;

    await expect(
      ds.transaction(async (manager) => {
        await svc.registrarSalida(productoId, 10, userId, 'Factura emitida: FAC-TX-1', 'FAC-TX-1', almacenId, undefined, manager);
        // Simula el fallo real: CxC (o cualquier otro paso) falla DESPUÉS
        // de que el inventario ya se descontó, dentro de la MISMA transacción.
        throw new Error('CxC caída (simulado)');
      }),
    ).rejects.toThrow('CxC caída');

    const [{ stock }] = await ds.query(`SELECT stock FROM productos WHERE id = $1`, [productoId]);
    expect(Number(stock)).toBe(50); // sin cambio — el UPDATE se revirtió

    const movimientos = await ds.query(
      `SELECT id FROM movimientos_inventario WHERE "productoId" = $1 AND referencia = 'FAC-TX-1'`, [productoId],
    );
    expect(movimientos).toHaveLength(0); // la fila nunca se confirmó
  });

  it('reintento exitoso sobre la MISMA venta tras el rollback: un solo juego neto de movimientos', async () => {
    if (!dbDisponible) return;

    await ds.transaction(async (manager) => {
      await svc.registrarSalida(productoId, 10, userId, 'Factura emitida: FAC-TX-1', 'FAC-TX-1', almacenId, undefined, manager);
      // esta vez no falla nada más — la transacción comitea.
    });

    const [{ stock }] = await ds.query(`SELECT stock FROM productos WHERE id = $1`, [productoId]);
    expect(Number(stock)).toBe(40); // 50 - 10, UNA sola vez

    const movimientos = await ds.query(
      `SELECT id FROM movimientos_inventario WHERE "productoId" = $1 AND referencia = 'FAC-TX-1'`, [productoId],
    );
    expect(movimientos).toHaveLength(1); // un solo movimiento neto, no acumulado del intento fallido
  });
});
