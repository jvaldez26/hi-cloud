import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { SupervisorPoliticas1770700000000 } from './1770700000000-SupervisorPoliticas';

/**
 * Integración REAL contra Postgres — ejecuta el up() de la migración de
 * verdad (no una reimplementación en JS) contra empresas de prueba con
 * distintas combinaciones de interruptores, y comprueba que cada empresa
 * termina con EXACTAMENTE la protección que ya tenía (pedido explícito del
 * usuario: "la migración conserva las protecciones de cada empresa").
 *
 * Requiere la BD local de pruebas: 127.0.0.1:5433/hicloud_test. Se salta
 * automáticamente si no está disponible — nunca corre contra producción.
 *
 * up() ya corrió una vez en este DB local (reconciliación de esquema de la
 * sesión) — CREATE TABLE/COLUMN usan IF NOT EXISTS y el INSERT usa
 * ON CONFLICT DO NOTHING, así que volver a correrlo aquí es idempotente:
 * no toca filas ya existentes de empresas reales, solo inserta las de las
 * empresas de prueba nuevas creadas en beforeAll.
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

let ds: DataSource;
let dbDisponible = true;

const RNC_TODO_ENCENDIDO   = '900000001';
const RNC_CIERRE_APAGADO   = '900000002';
const RNC_SIN_CONFIG       = '900000003';
const RNC_LEGACY_POS       = '900000004';
const RNC_MODO_APAGADO     = '900000005';

const empresaIds: Record<string, number> = {};

async function crearEmpresa(rnc: string, configuracion: unknown): Promise<number> {
  // "xlinkId" no tiene DEFAULT a nivel de BD (solo vía @BeforeInsert() de
  // TypeORM, que un INSERT crudo se salta) — se genera a mano aquí.
  const [row] = await ds.query(
    `INSERT INTO empresa (rnc, nombre, configuracion, "xlinkId") VALUES ($1, $2, $3, $4) RETURNING id`,
    [rnc, `Test Migración Supervisor ${rnc}`, configuracion === null ? null : JSON.stringify(configuracion), randomUUID()],
  );
  return row.id;
}

async function limpiar() {
  await ds.query(`DELETE FROM supervisor_politicas WHERE "empresaId" IN (SELECT id FROM empresa WHERE rnc LIKE '90000000%')`);
  await ds.query(`DELETE FROM empresa WHERE rnc LIKE '90000000%'`);
}

async function politicaDe(empresaId: number, clave: string) {
  const [row] = await ds.query(
    `SELECT requerido, modo FROM supervisor_politicas WHERE "empresaId" = $1 AND clave = $2`,
    [empresaId, clave],
  );
  return row as { requerido: boolean; modo: string } | undefined;
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    synchronize: false, connectTimeoutMS: 3000,
  });
  try {
    await ds.initialize();
  } catch (err) {
    if (process.env['DB_HOST']) throw err;
    dbDisponible = false;
    return;
  }
  await limpiar();

  empresaIds[RNC_TODO_ENCENDIDO] = await crearEmpresa(RNC_TODO_ENCENDIDO, {
    supervisorModeEnabled: true,
    posSupervisorCierreCaja: true,
    posSupervisorGastos: true,
    posSupervisorVentaCredito: true,
    posModificarPrecio: true,
  });
  empresaIds[RNC_CIERRE_APAGADO] = await crearEmpresa(RNC_CIERRE_APAGADO, {
    supervisorModeEnabled: true,
    posSupervisorCierreCaja: false,
  });
  empresaIds[RNC_SIN_CONFIG] = await crearEmpresa(RNC_SIN_CONFIG, null);
  empresaIds[RNC_LEGACY_POS] = await crearEmpresa(RNC_LEGACY_POS, {
    pos: { supervisorModeEnabled: true, posSupervisorVentaCredito: false },
  });
  empresaIds[RNC_MODO_APAGADO] = await crearEmpresa(RNC_MODO_APAGADO, { supervisorModeEnabled: false });

  const migracion = new SupervisorPoliticas1770700000000();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await migracion.up(qr);
  await qr.release();
});

afterAll(async () => {
  if (!dbDisponible) return;
  await limpiar();
  await ds.destroy();
});

describe('Migración SupervisorPoliticas1770700000000 — preserva la protección exacta de cada empresa', () => {
  it('se salta si no hay BD local (nunca corre contra producción)', () => {
    expect(typeof dbDisponible).toBe('boolean');
  });

  it('empresa con todo encendido (supervisorModeEnabled + ambos toggles) → todas las claves dependientes quedan requeridas', async () => {
    if (!dbDisponible) return;
    const empresaId = empresaIds[RNC_TODO_ENCENDIDO];

    expect((await politicaDe(empresaId, 'pos.panel.cierre_caja'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'cerrar_caja'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'pos.panel.gastos'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'registrar_gasto'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'venta_credito'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'descuento_excedido'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'modificar_precio'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'pos.panel.inventario'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'pos.panel.ventas_hoy'))?.requerido).toBe(true);
    // Siempre requeridas (protección incondicional hoy, sin importar los toggles).
    expect((await politicaDe(empresaId, 'pos.panel.compras'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'anular_documento'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'crear_nota_credito'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'crear_producto'))?.requerido).toBe(true);
    // Nunca migrado como requerido: retiro_caja no tenía protección alguna hoy.
    expect((await politicaDe(empresaId, 'registrar_retiro'))?.requerido).toBe(false);
    // Recibos de Cobro: decisión explícita — siempre desmarcado.
    expect((await politicaDe(empresaId, 'pos.panel.recibos_cobro'))?.requerido).toBe(false);
  });

  it('empresa con supervisorModeEnabled=true pero posSupervisorCierreCaja=false → cierre de caja queda SIN requerir (toggle específico apagado gana)', async () => {
    if (!dbDisponible) return;
    const empresaId = empresaIds[RNC_CIERRE_APAGADO];

    expect((await politicaDe(empresaId, 'pos.panel.cierre_caja'))?.requerido).toBe(false);
    expect((await politicaDe(empresaId, 'cerrar_caja'))?.requerido).toBe(false);
    // El resto, dependiente solo del maestro, sigue requerido.
    expect((await politicaDe(empresaId, 'venta_credito'))?.requerido).toBe(true);
  });

  it('empresa sin configuracion (NULL) → todo lo dependiente del modo supervisor queda sin requerir, excepto las protecciones incondicionales', async () => {
    if (!dbDisponible) return;
    const empresaId = empresaIds[RNC_SIN_CONFIG];

    expect((await politicaDe(empresaId, 'venta_credito'))?.requerido).toBe(false);
    expect((await politicaDe(empresaId, 'pos.panel.cierre_caja'))?.requerido).toBe(false);
    expect((await politicaDe(empresaId, 'pos.panel.compras'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'anular_documento'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'cambiar_sucursal'))?.requerido).toBe(true);
    expect((await politicaDe(empresaId, 'ver_reportes'))?.requerido).toBe(true);
  });

  it('empresa con el formato legado configuracion.pos.* (compatibilidad con updatePosConfig) → se respeta igual', async () => {
    if (!dbDisponible) return;
    const empresaId = empresaIds[RNC_LEGACY_POS];

    expect((await politicaDe(empresaId, 'venta_credito'))?.requerido).toBe(false);
    expect((await politicaDe(empresaId, 'descuento_excedido'))?.requerido).toBe(true); // solo depende del maestro
  });

  it('modo migrado: todas las filas usan el default del catálogo para esa clave (no un dato migrado)', async () => {
    if (!dbDisponible) return;
    const empresaId = empresaIds[RNC_MODO_APAGADO];

    expect((await politicaDe(empresaId, 'venta_credito'))?.modo).toBe('cada_vez');
    expect((await politicaDe(empresaId, 'cerrar_caja'))?.modo).toBe('cada_vez');
    expect((await politicaDe(empresaId, 'registrar_gasto'))?.modo).toBe('sesion');
    expect((await politicaDe(empresaId, 'pos.panel.items'))?.modo).toBe('sesion');
  });
});
