import { DataSource } from 'typeorm';

/**
 * Integración REAL contra Postgres — el índice único parcial
 * uq_facturas_origen_activo (empresaId, origenTipo, origenId) WHERE
 * origenTipo IS NOT NULL AND estado <> 'cancelada' es lo que impide cobrar
 * dos veces el mismo turno de Car Wash (o cualquier otro origen externo).
 * Se prueba directo contra la constraint, no contra FacturasService.create()
 * completo (demasiadas dependencias para este nivel) — la migración
 * 1769400000000-AddOrigenToFacturas.ts es la unidad bajo prueba.
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

const EMPRESA = 777_030;
const USUARIO_ID = 10; // fixture real de la BD de pruebas

async function insertarFactura(folio: string, origenId: number, estado = 'emitida') {
  return ds.query(
    `INSERT INTO facturas (folio, fecha, "empresaId", "usuarioId", estado, "origenTipo", "origenId")
     VALUES ($1, CURRENT_DATE, $2, $3, $4, 'car_wash_turno', $5)
     RETURNING id, folio`,
    [folio, EMPRESA, USUARIO_ID, estado, origenId],
  );
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
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
  }
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.query(`DELETE FROM facturas WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.destroy();
});

describe('uq_facturas_origen_activo (integración real contra Postgres)', () => {
  it('dos facturas activas para el mismo origen chocan con 23505', async () => {
    if (!dbDisponible) return;
    const origenId = 111_001;
    await ds.query(`DELETE FROM facturas WHERE "empresaId" = $1 AND "origenId" = $2`, [EMPRESA, origenId]);

    await insertarFactura('FAC-TEST-ORIGEN-1', origenId);
    await expect(insertarFactura('FAC-TEST-ORIGEN-2', origenId)).rejects.toMatchObject({ code: '23505' });
  });

  it('una factura CANCELADA no bloquea volver a cobrar el mismo origen', async () => {
    if (!dbDisponible) return;
    const origenId = 111_002;
    await ds.query(`DELETE FROM facturas WHERE "empresaId" = $1 AND "origenId" = $2`, [EMPRESA, origenId]);

    const [primera] = await insertarFactura('FAC-TEST-ORIGEN-3', origenId);
    await ds.query(`UPDATE facturas SET estado = 'cancelada' WHERE id = $1`, [primera.id]);

    // La anterior está cancelada: esta NO debe chocar con el índice.
    await expect(insertarFactura('FAC-TEST-ORIGEN-4', origenId)).resolves.toBeDefined();
  });

  it('dos orígenes distintos (mismo tipo, distinto id) no chocan entre sí', async () => {
    if (!dbDisponible) return;
    await ds.query(`DELETE FROM facturas WHERE "empresaId" = $1 AND "origenId" IN (111_003, 111_004)`, [EMPRESA]);
    await expect(insertarFactura('FAC-TEST-ORIGEN-5', 111_003)).resolves.toBeDefined();
    await expect(insertarFactura('FAC-TEST-ORIGEN-6', 111_004)).resolves.toBeDefined();
  });
});
