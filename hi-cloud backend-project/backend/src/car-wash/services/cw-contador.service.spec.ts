import { DataSource } from 'typeorm';
import { CwContadorService } from './cw-contador.service';

/**
 * Integración REAL contra Postgres — el incremento atómico depende del
 * UPSERT (INSERT ... ON CONFLICT ... DO UPDATE) de verdad, algo que un mock
 * de repositorio no puede demostrar bajo concurrencia real.
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

const EMPRESA = 777_001;
const SUCURSAL = 1;

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
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
  }
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.query(`DELETE FROM cw_contador_turno WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.destroy();
});

describe('CwContadorService (integración real contra Postgres)', () => {
  it('cinco recepciones concurrentes (conexiones separadas) reciben números distintos y consecutivos', async () => {
    if (!dbDisponible) return;
    const fecha = '2026-10-02';
    await ds.query(`DELETE FROM cw_contador_turno WHERE "empresaId" = $1 AND "fechaRD" = $2`, [EMPRESA, fecha]);

    const conexiones = await Promise.all(
      Array.from({ length: 5 }, () => new DataSource({
        type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
      }).initialize()),
    );
    try {
      const numeros = await Promise.all(
        conexiones.map(conn => new CwContadorService(conn).siguienteNumero(EMPRESA, SUCURSAL, fecha)),
      );
      expect(numeros.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(numeros).size).toBe(5); // sin colisiones
    } finally {
      await Promise.all(conexiones.map(c => c.destroy()));
    }
  });

  it('el contador reinicia en 1 al cambiar el día RD, aunque la sucursal siga la misma', async () => {
    if (!dbDisponible) return;
    const svc = new CwContadorService(ds);
    const dia1 = '2026-10-03';
    const dia2 = '2026-10-04';
    await ds.query(`DELETE FROM cw_contador_turno WHERE "empresaId" = $1 AND "fechaRD" IN ($2, $3)`, [EMPRESA, dia1, dia2]);

    expect(await svc.siguienteNumero(EMPRESA, SUCURSAL, dia1)).toBe(1);
    expect(await svc.siguienteNumero(EMPRESA, SUCURSAL, dia1)).toBe(2);
    expect(await svc.siguienteNumero(EMPRESA, SUCURSAL, dia1)).toBe(3);

    // Día siguiente: vuelve a 1, no sigue en 4.
    expect(await svc.siguienteNumero(EMPRESA, SUCURSAL, dia2)).toBe(1);
  });

  it('dos sucursales de la misma empresa y día tienen contadores independientes', async () => {
    if (!dbDisponible) return;
    const svc = new CwContadorService(ds);
    const fecha = '2026-10-05';
    await ds.query(`DELETE FROM cw_contador_turno WHERE "empresaId" = $1 AND "fechaRD" = $2`, [EMPRESA, fecha]);

    expect(await svc.siguienteNumero(EMPRESA, 10, fecha)).toBe(1);
    expect(await svc.siguienteNumero(EMPRESA, 11, fecha)).toBe(1);
    expect(await svc.siguienteNumero(EMPRESA, 10, fecha)).toBe(2);
  });
});
