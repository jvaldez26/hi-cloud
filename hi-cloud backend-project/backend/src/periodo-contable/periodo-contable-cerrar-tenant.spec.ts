/**
 * P0 (2026-09-21) — cerrar() sumaba totalDebe/totalHaber/cantidad de TODOS
 * los asientos contabilizados en el rango de fechas, de TODAS las empresas,
 * porque la query de agregación (getRawOne()) no filtraba por empresaId.
 * getRawOne() devuelve una fila cruda, no una entidad hidratada, así que ni
 * TenantAwareRepository ni TenantSubscriber podían atraparlo — era la única
 * consulta de este archivo sin el filtro que todo lo demás sí tiene.
 *
 * Contra Postgres real: dos empresas con asientos EN EL MISMO rango de
 * fechas, cerrar el período de una NO debe incluir ni un centavo de la otra.
 */

import { DataSource } from 'typeorm';
import { PeriodoContableService } from './periodo-contable.service';
import { PeriodoContable, EstadoPeriodo } from './entities/periodo-contable.entity';
import { AsientoContable } from '../contabilidad/entities/asiento-contable.entity';
import { AsientoLinea } from '../contabilidad/entities/asiento-linea.entity';
import { CuentaContable } from '../contabilidad/entities/cuenta-contable.entity';
import { User } from '../users/users.entity';

const TIENE_BD = !!process.env['DB_HOST'];
const EMPRESA_A = 901401;
const EMPRESA_B = 901402;

(TIENE_BD ? describe : describe.skip)('PeriodoContableService.cerrar() — aislamiento multi-tenant, contra Postgres real', () => {
  let dataSource: DataSource;
  let svc: PeriodoContableService;
  let userIdFixture: number;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [PeriodoContable, AsientoContable, AsientoLinea, CuentaContable, User],
    });
    await dataSource.initialize();

    svc = new PeriodoContableService(
      dataSource.getRepository(PeriodoContable),
      dataSource.getRepository(AsientoContable),
      { getEmpresaId: () => EMPRESA_A } as any,
    );

    await dataSource.query(`DELETE FROM users WHERE email = 'test-cierre-periodo@example.com'`);
    const [{ id }] = await dataSource.query(
      `INSERT INTO users (nombre, email, password) VALUES ('Test Cierre Periodo', 'test-cierre-periodo@example.com', 'x') RETURNING id`,
    );
    userIdFixture = id;
  });

  afterAll(async () => {
    for (const eid of [EMPRESA_A, EMPRESA_B]) {
      await dataSource.query(`DELETE FROM asientos_contables WHERE "empresaId" = $1`, [eid]);
      await dataSource.query(`DELETE FROM periodos_contables WHERE "empresaId" = $1`, [eid]);
    }
    await dataSource.query(`DELETE FROM users WHERE id = $1`, [userIdFixture]);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    for (const eid of [EMPRESA_A, EMPRESA_B]) {
      await dataSource.query(`DELETE FROM asientos_contables WHERE "empresaId" = $1`, [eid]);
      await dataSource.query(`DELETE FROM periodos_contables WHERE "empresaId" = $1`, [eid]);
    }
  });

  async function crearAsiento(empresaId: number, fecha: string, totalDebe: number) {
    await dataSource.query(
      `INSERT INTO asientos_contables
         (numero, fecha, descripcion, "tipoOrigen", estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
       VALUES ($1, $2, 'Fixture cierre período', 'manual', 'contabilizado', $3, $3, $4, $5, true)`,
      [`T-${Math.random().toString(36).slice(2, 12)}`, fecha, totalDebe, userIdFixture, empresaId],
    );
  }

  it('cerrar el período de la empresa A no suma ni un centavo de la empresa B, aunque compartan el mismo rango de fechas', async () => {
    const periodoA = await dataSource.getRepository(PeriodoContable).save({
      empresaId: EMPRESA_A, anio: 2026, mes: 6, nombre: 'Junio 2026',
      fechaInicio: new Date('2026-06-01'), fechaFin: new Date('2026-06-30'), estado: EstadoPeriodo.ABIERTO,
    } as any);

    await crearAsiento(EMPRESA_A, '2026-06-15', 1000);
    await crearAsiento(EMPRESA_B, '2026-06-15', 9_000_000); // mismo rango de fechas, otra empresa

    const cerrado = await svc.cerrar(periodoA.id, userIdFixture, {});

    expect(Number(cerrado.totalDebitos)).toBe(1000);
    expect(Number(cerrado.totalCreditos)).toBe(1000);
    expect(cerrado.cantidadAsientos).toBe(1);
    expect(cerrado.estado).toBe(EstadoPeriodo.CERRADO);
  });

  it('un asiento de otra empresa fuera de rango tampoco contamina, y uno propio fuera de rango tampoco se cuenta', async () => {
    const periodoA = await dataSource.getRepository(PeriodoContable).save({
      empresaId: EMPRESA_A, anio: 2026, mes: 7, nombre: 'Julio 2026',
      fechaInicio: new Date('2026-07-01'), fechaFin: new Date('2026-07-31'), estado: EstadoPeriodo.ABIERTO,
    } as any);

    await crearAsiento(EMPRESA_A, '2026-07-10', 500);
    await crearAsiento(EMPRESA_A, '2026-08-01', 12345); // propio, pero fuera del período
    await crearAsiento(EMPRESA_B, '2026-07-10', 999999); // otra empresa, mismo rango

    const cerrado = await svc.cerrar(periodoA.id, userIdFixture, {});

    expect(Number(cerrado.totalDebitos)).toBe(500);
    expect(cerrado.cantidadAsientos).toBe(1);
  });
});
