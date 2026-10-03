import { DataSource } from 'typeorm';
import { fechaHoyRD, inicioDiaRDenUTC, diaSiguienteRD } from '../common/utils/fecha-local.util';

/**
 * Integración REAL contra Postgres — el KPI "e-CF hoy" del dashboard de
 * Super Admin (SuperAdminService.getMetricas) tenía el mismo defecto que
 * CuotaEcfService.contarEmitidos: "createdAt" es TIMESTAMP sin zona que
 * guarda UTC, y envolverlo en `AT TIME ZONE 'America/Santo_Domingo'`
 * interpreta el valor como si ya fuera hora RD y lo empuja hacia adelante —
 * un e-CF emitido en las últimas ~4 horas de cada día RD se contaba en el
 * "hoy" de MAÑANA, no en el de hoy. Introducido en el commit 966f172f2
 * (2026-07-16).
 *
 * Esta prueba replica la query EXACTA que ahora usa super-admin.service.ts
 * (si esa query cambia, actualícese aquí también) contra datos reales.
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

const EMPRESA = 22;
const TIPO_ECF_ID = 1;
const SECUENCIA_ID = 3;

let ds: DataSource;
let dbDisponible = true;
let ecfIds: number[] = [];

async function contarEcfHoy(hoyRD: string): Promise<number> {
  const [r] = await ds.query<{ cnt: number }[]>(
    `SELECT COUNT(*)::int AS cnt FROM ecf
      WHERE "createdAt" >= $1::timestamp AND "createdAt" < $2::timestamp
        AND "isActive" = true`,
    [inicioDiaRDenUTC(hoyRD), inicioDiaRDenUTC(diaSiguienteRD(hoyRD))],
  );
  return r.cnt;
}

let contador = 0;
async function crearEcfConCreatedAt(createdAt: string): Promise<number> {
  contador += 1;
  const numero = `H${Date.now().toString().slice(-11)}${contador}`;
  const [row] = await ds.query<{ id: number }[]>(
    `INSERT INTO ecf
       ("empresaId", "tipoECFId", "secuenciaId", numero, "codigoSeguridad", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ABC123', true, $5::timestamp, $5::timestamp)
     RETURNING id`,
    [EMPRESA, TIPO_ECF_ID, SECUENCIA_ID, numero, createdAt],
  );
  ecfIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [],
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

afterEach(async () => {
  if (!dbDisponible || !ecfIds.length) return;
  await ds.query(`DELETE FROM ecf WHERE id = ANY($1)`, [ecfIds]);
  ecfIds = [];
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.destroy();
});

describe('Dashboard Super Admin — "e-CF hoy" con fronteras RD reales', () => {
  it('un e-CF emitido a las 23:30 RD de AYER (createdAt a las 03:30 UTC de hoy) NO cuenta como de hoy', async () => {
    if (!dbDisponible) return;
    const hoyRD = '2026-10-05';
    const ayer2330RD = '2026-10-05 03:30:00'; // 23:30 RD del 04/10 = 03:30 UTC del 05/10
    await crearEcfConCreatedAt(ayer2330RD);

    expect(await contarEcfHoy(hoyRD)).toBe(0);
  });

  it('un e-CF emitido a las 00:30 RD de HOY (createdAt a las 04:30 UTC) SÍ cuenta como de hoy', async () => {
    if (!dbDisponible) return;
    const hoyRD = '2026-10-05';
    const hoy0030RD = '2026-10-05 04:30:00'; // 00:30 RD del 05/10
    await crearEcfConCreatedAt(hoy0030RD);

    expect(await contarEcfHoy(hoyRD)).toBe(1);
  });

  it('un e-CF emitido a las 23:30 RD de HOY (createdAt a las 03:30 UTC de mañana) SÍ cuenta como de hoy', async () => {
    if (!dbDisponible) return;
    const hoyRD = '2026-10-05';
    const hoy2330RD = '2026-10-06 03:30:00'; // 23:30 RD del 05/10 = 03:30 UTC del 06/10
    await crearEcfConCreatedAt(hoy2330RD);

    expect(await contarEcfHoy(hoyRD)).toBe(1);
  });
});
