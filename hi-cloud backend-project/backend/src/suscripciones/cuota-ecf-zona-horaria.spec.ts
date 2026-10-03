import { DataSource } from 'typeorm';
import { CuotaEcfService } from './cuota-ecf.service';

/**
 * Integración REAL contra Postgres (no DataSource fake) — bug real de zona
 * horaria en CuotaEcfService.contarEmitidos(): "createdAt" es TIMESTAMP SIN
 * zona que guarda UTC (la sesión de Postgres corre en UTC); envolverlo en
 * `AT TIME ZONE 'America/Santo_Domingo'` lo INTERPRETA como si ya fuera hora
 * RD y lo empuja más hacia adelante — la dirección contraria a la que hace
 * falta. El fix calcula las fronteras del ciclo como instantes UTC en
 * TypeScript (inicioDiaRDenUTC) y compara la columna sin envolverla.
 *
 * Caso del ticket: un e-CF con createdAt '2026-10-05 03:30:00' (23:30 hora
 * RD del 04/10) con un corte el día 5 debe contar en el ciclo que CIERRA el
 * 05/10 (04/09–05/10), no en el que abre ese día (05/10–05/11).
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

const EMPRESA = 22;
// tipoECFId/secuenciaId existentes y válidos para la empresa 22 (ver otros specs de esta sesión).
const TIPO_ECF_ID = 1;
const SECUENCIA_ID = 3;

let ds: DataSource;
let dbDisponible = true;
let ecfIds: number[] = [];

function buildService(ds: DataSource) {
  const notificaciones = { notificarSistemaEmpresa: jest.fn().mockResolvedValue(undefined) };
  return new CuotaEcfService(ds, notificaciones as any);
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [], // contarEmitidos es SQL crudo — no hace falta metadata de entidades
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

let contadorNumero = 0;
async function crearEcfConCreatedAt(createdAt: string): Promise<number> {
  // numero es varchar(13) — últimos 11 dígitos de Date.now() + 2 de un contador, únicos dentro del archivo.
  contadorNumero += 1;
  const numero = `T${Date.now().toString().slice(-11)}${String(contadorNumero).padStart(1, '0')}`;
  const [row] = await ds.query<{ id: number }[]>(
    `INSERT INTO ecf
       ("empresaId", "tipoECFId", "secuenciaId", numero, "codigoSeguridad", "modoEmision", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ABC123', 'PRODUCCION', true, $5::timestamp, $5::timestamp)
     RETURNING id`,
    [EMPRESA, TIPO_ECF_ID, SECUENCIA_ID, numero, createdAt],
  );
  ecfIds.push(row.id);
  return row.id;
}

describe('CuotaEcfService.contarEmitidos — zona horaria real contra Postgres', () => {
  it('e-CF emitido a las 23:30 hora RD del 04/10 (createdAt 2026-10-05 03:30:00 UTC) cuenta en el ciclo que CIERRA el 05/10, no en el que abre', async () => {
    if (!dbDisponible) return;
    const svc = buildService(ds);
    await crearEcfConCreatedAt('2026-10-05 03:30:00');

    const cicloQueCierra  = { inicio: '2026-09-05', fin: '2026-10-05' };
    const cicloQueAbre    = { inicio: '2026-10-05', fin: '2026-11-05' };

    const enElQueCierra = await svc.contarEmitidos(EMPRESA, cicloQueCierra);
    const enElQueAbre    = await svc.contarEmitidos(EMPRESA, cicloQueAbre);

    expect(enElQueCierra).toBe(1);
    expect(enElQueAbre).toBe(0);
  });

  it('e-CF emitido a las 00:30 hora RD del 05/10 (createdAt 2026-10-05 04:30:00 UTC) SÍ cuenta en el ciclo que abre ese día', async () => {
    if (!dbDisponible) return;
    const svc = buildService(ds);
    await crearEcfConCreatedAt('2026-10-05 04:30:00');

    const cicloQueCierra = { inicio: '2026-09-05', fin: '2026-10-05' };
    const cicloQueAbre   = { inicio: '2026-10-05', fin: '2026-11-05' };

    expect(await svc.contarEmitidos(EMPRESA, cicloQueAbre)).toBe(1);
    expect(await svc.contarEmitidos(EMPRESA, cicloQueCierra)).toBe(0);
  });
});
