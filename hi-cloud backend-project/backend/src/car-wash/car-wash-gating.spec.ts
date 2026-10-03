import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';

/**
 * Integración REAL contra Postgres — fail-closed: una empresa sin fila
 * activa en empresa_modulos para 'car_wash' debe recibir 403, nunca pasar
 * por omisión. Mismo guard genérico que usan Gimnasio/Taller/Óptica,
 * ejercitado aquí con el código 'car_wash'.
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

const EMPRESA_SIN_MODULO = 777_040;
const EMPRESA_CON_MODULO = 777_041;

function contextoCon(empresaId: number): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ empresaId }) }),
  } as any;
}

beforeAll(async () => {
  ds = new DataSource({ type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME, connectTimeoutMS: 3000 });
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
  await ds.query(`DELETE FROM empresa_modulos WHERE "empresaId" IN ($1, $2) AND "moduloCodigo" = 'car_wash'`, [EMPRESA_SIN_MODULO, EMPRESA_CON_MODULO]);
  await ds.query(
    `INSERT INTO empresa_modulos ("empresaId", "moduloCodigo", activo) VALUES ($1, 'car_wash', true)`,
    [EMPRESA_CON_MODULO],
  );
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.query(`DELETE FROM empresa_modulos WHERE "empresaId" IN ($1, $2) AND "moduloCodigo" = 'car_wash'`, [EMPRESA_SIN_MODULO, EMPRESA_CON_MODULO]);
  await ds.destroy();
});

describe('ModuloAddonGuard("car_wash") (integración real contra Postgres)', () => {
  it('empresa SIN el módulo activo recibe 403 (fail-closed, nunca pasa por omisión)', async () => {
    if (!dbDisponible) return;
    const Guard = ModuloAddonGuard('car_wash');
    const guard = new (Guard as any)(ds);
    await expect(guard.canActivate(contextoCon(EMPRESA_SIN_MODULO))).rejects.toThrow(ForbiddenException);
  });

  it('empresa CON el módulo activo pasa', async () => {
    if (!dbDisponible) return;
    const Guard = ModuloAddonGuard('car_wash');
    const guard = new (Guard as any)(ds);
    await expect(guard.canActivate(contextoCon(EMPRESA_CON_MODULO))).resolves.toBe(true);
  });
});
