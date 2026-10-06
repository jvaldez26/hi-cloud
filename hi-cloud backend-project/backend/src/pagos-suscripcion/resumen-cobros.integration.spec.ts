import { DataSource } from 'typeorm';
import { PagosSuscripcionService } from './pagos-suscripcion.service';

/**
 * Integración REAL contra Postgres — resumenCobros() casi llegó a
 * producción con un bug de SQL que ningún test con `ds.query` mockeado
 * podía atrapar: `json_agg(json_build_object(...))` en el LEFT JOIN
 * devuelve tipo `json`, y Postgres no tiene operador de igualdad para
 * `json` — el GROUP BY que incluye esa columna revienta con
 * "could not identify an equality operator for type json". Apareció
 * recién en producción (panel de Cobros en blanco); el fix fue cambiar a
 * `jsonb_agg`/`jsonb_build_object` (jsonb SÍ tiene igualdad).
 *
 * Este test no reemplaza los mocks (que prueban la LÓGICA) — prueba que
 * el SQL de verdad PARSEA Y CORRE en Postgres, algo que ningún mock puede
 * garantizar.
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
});

afterAll(async () => {
  if (dbDisponible) await ds.destroy();
});

describe('PagosSuscripcionService.resumenCobros() — SQL real contra Postgres', () => {
  it('se salta si no hay BD local (nunca corre contra producción)', () => {
    expect(typeof dbDisponible).toBe('boolean');
  });

  it('corre sin errores de SQL y devuelve filas con la forma del estado de cuenta compartido', async () => {
    if (!dbDisponible) return;

    const svc = new PagosSuscripcionService(
      {} as any, {} as any, {} as any, ds, {} as any, {} as any, {} as any, {} as any,
    );

    const filas = await svc.resumenCobros();

    expect(Array.isArray(filas)).toBe(true);
    for (const f of filas) {
      expect(typeof f.saldoNeto).toBe('number');
      expect(typeof f.saldoCargos).toBe('number');
      expect(typeof f.saldoSuscripcion).toBe('number');
      expect(typeof f.totalAdeudado).toBe('number');
      expect(Array.isArray(f.cargosPendientes)).toBe(true);
      // totalAdeudado tiene que cuadrar con sus dos componentes — mismo
      // invariante que prueba estado-cuenta-empresa.util.spec.ts, aquí
      // contra datos reales de la BD, no fixtures.
      expect(f.totalAdeudado).toBeCloseTo(f.saldoCargos + f.saldoSuscripcion, 2);
    }
  });
});
