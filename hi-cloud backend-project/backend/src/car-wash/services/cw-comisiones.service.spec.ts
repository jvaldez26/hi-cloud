import { DataSource } from 'typeorm';
import { CwComision } from '../entities/cw-comision.entity';
import { CwLavador } from '../entities/cw-lavador.entity';
import { CwServicioPrecio } from '../entities/cw-servicio-precio.entity';
import { CwTurno } from '../entities/cw-turno.entity';
import { CwTurnoServicio } from '../entities/cw-turno-servicio.entity';
import { CwTurnoLavador } from '../entities/cw-turno-lavador.entity';
import { CwComisionesService } from './cw-comisiones.service';

/**
 * Integración REAL contra Postgres — el reparto entre lavadores y las tres
 * modalidades de pago son aritmética de dinero; un mock no demuestra que el
 * ON CONFLICT de idempotencia funciona de verdad.
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
let svc: CwComisionesService;

const EMPRESA = 777_050;

async function limpiar() {
  await ds.query(`DELETE FROM cw_comisiones WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_turno_lavadores WHERE "turnoId" IN (SELECT id FROM cw_turnos WHERE "empresaId" = $1)`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_turno_servicios WHERE "turnoId" IN (SELECT id FROM cw_turnos WHERE "empresaId" = $1)`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_turnos WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_servicio_precios WHERE "servicioId" IN (SELECT id FROM cw_servicios WHERE "empresaId" = $1)`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_servicios WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_lavadores WHERE "empresaId" = $1`, [EMPRESA]);
}

let numeroDiaSiguiente = 1;

async function crearTurno(sufijo: string) {
  const numeroDia = numeroDiaSiguiente++;
  const [turno] = await ds.query(
    `INSERT INTO cw_turnos ("empresaId","sucursalId","numeroDia",codigo,"fechaRD",placa,"tipoVehiculo",estado,"tokenPublico")
     VALUES ($1, 1, $5, $2, '2026-10-02', $3, 'carro', 'en_lavado', $4) RETURNING *`,
    [EMPRESA, `T-${sufijo}`, `PLA${sufijo}`, `tok-${sufijo}-${Date.now()}`, numeroDia],
  );
  return turno;
}

async function crearLavador(nombre: string, modoPago: string, valor: number) {
  return ds.getRepository(CwLavador).save(ds.getRepository(CwLavador).create({ empresaId: EMPRESA, nombre, modoPago: modoPago as any, valorModoPago: valor }));
}

async function asignar(turnoId: number, lavadorId: number, porcentaje: number) {
  return ds.getRepository(CwTurnoLavador).save(ds.getRepository(CwTurnoLavador).create({ turnoId, lavadorId, porcentaje }));
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [CwComision, CwLavador, CwServicioPrecio, CwTurno, CwTurnoServicio, CwTurnoLavador],
    synchronize: false, connectTimeoutMS: 3000,
  });
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
  await limpiar();
  svc = new CwComisionesService(ds.getRepository(CwComision));
});

afterAll(async () => {
  if (!dbDisponible) return;
  await limpiar();
  await ds.destroy();
});

describe('CwComisionesService.generarParaTurno (integración real contra Postgres)', () => {
  it('modo por_vehiculo: UNA línea por lavador, repartida por su porcentaje', async () => {
    if (!dbDisponible) return;
    const turno = await crearTurno('A1');
    const lavador1 = await crearLavador('Juan', 'por_vehiculo', 200);
    const lavador2 = await crearLavador('Pedro', 'por_vehiculo', 200);
    await asignar(turno.id, lavador1.id, 60);
    await asignar(turno.id, lavador2.id, 40);

    await ds.transaction(async em => {
      await svc.generarParaTurno(em, EMPRESA, turno, [], [
        { turnoId: turno.id, lavadorId: lavador1.id, porcentaje: 60 } as any,
        { turnoId: turno.id, lavadorId: lavador2.id, porcentaje: 40 } as any,
      ]);
    });

    const lineas = await svc.porTurno(EMPRESA, turno.id);
    expect(lineas).toHaveLength(2);
    const deJuan = lineas.find(l => l.lavadorId === lavador1.id)!;
    const dePedro = lineas.find(l => l.lavadorId === lavador2.id)!;
    expect(Number(deJuan.monto)).toBe(120); // 200 * 60%
    expect(Number(dePedro.monto)).toBe(80); // 200 * 40%
    expect(deJuan.servicioId).toBeNull();
  });

  it('modo porcentaje: base = subtotal del turno, tarifa = % del lavador, luego reparto', async () => {
    if (!dbDisponible) return;
    const turno = await crearTurno('A2');
    const lavador = await crearLavador('Ana', 'porcentaje', 10); // 10% del subtotal
    await asignar(turno.id, lavador.id, 100);
    const turnoServicios = [
      { turnoId: turno.id, servicioId: 1, nombre: 'Lavado', precio: 500, duracionMinutos: 20 },
      { turnoId: turno.id, servicioId: 2, nombre: 'Encerado', precio: 300, duracionMinutos: 15 },
    ] as any;

    await ds.transaction(async em => {
      await svc.generarParaTurno(em, EMPRESA, turno, turnoServicios, [
        { turnoId: turno.id, lavadorId: lavador.id, porcentaje: 100 } as any,
      ]);
    });

    const [linea] = await svc.porTurno(EMPRESA, turno.id);
    // subtotal = 800; 10% = 80; reparto 100% = 80
    expect(Number(linea.base)).toBe(800);
    expect(Number(linea.monto)).toBe(80);
  });

  it('modo por_servicio: la tarifa del servicio tiene prioridad sobre la del lavador', async () => {
    if (!dbDisponible) return;
    const turno = await crearTurno('A3');
    const lavador = await crearLavador('Luis', 'por_servicio', 50); // tarifa genérica RD$50/servicio
    await asignar(turno.id, lavador.id, 100);

    const servicioConOverride = await ds.query(
      `INSERT INTO cw_servicios ("empresaId", nombre, "productoId") VALUES ($1, 'Lavado premium', 999001) RETURNING id`,
      [EMPRESA],
    );
    const servicioId = servicioConOverride[0].id;
    await ds.query(
      `INSERT INTO cw_servicio_precios ("servicioId", "tipoVehiculo", "duracionMinutos", precio, "tarifaLavador")
       VALUES ($1, 'carro', 20, 500, 120)`, // tarifaLavador=120 (> la genérica de 50)
      [servicioId],
    );

    const turnoServicios = [
      { turnoId: turno.id, servicioId, nombre: 'Lavado premium', precio: 500, duracionMinutos: 20 },
    ] as any;

    await ds.transaction(async em => {
      await svc.generarParaTurno(em, EMPRESA, turno, turnoServicios, [
        { turnoId: turno.id, lavadorId: lavador.id, porcentaje: 100 } as any,
      ]);
    });

    const [linea] = await svc.porTurno(EMPRESA, turno.id);
    expect(Number(linea.tarifaAplicada)).toBe(120); // override del servicio, no los 50 genéricos
    expect(Number(linea.monto)).toBe(120);
  });

  it('modo por_servicio sin override: cae a la tarifa genérica del lavador', async () => {
    if (!dbDisponible) return;
    const turno = await crearTurno('A4');
    const lavador = await crearLavador('Mario', 'por_servicio', 45);
    await asignar(turno.id, lavador.id, 100);
    const turnoServicios = [
      { turnoId: turno.id, servicioId: 9999, nombre: 'Aspirado', precio: 200, duracionMinutos: 10 },
    ] as any;

    await ds.transaction(async em => {
      await svc.generarParaTurno(em, EMPRESA, turno, turnoServicios, [
        { turnoId: turno.id, lavadorId: lavador.id, porcentaje: 100 } as any,
      ]);
    });

    const [linea] = await svc.porTurno(EMPRESA, turno.id);
    expect(Number(linea.tarifaAplicada)).toBe(45);
  });

  it('idempotente: generar dos veces para el mismo turno no duplica ni cambia el monto', async () => {
    if (!dbDisponible) return;
    const turno = await crearTurno('A5');
    const lavador = await crearLavador('Rosa', 'por_vehiculo', 150);
    await asignar(turno.id, lavador.id, 100);
    const asignaciones = [{ turnoId: turno.id, lavadorId: lavador.id, porcentaje: 100 } as any];

    await ds.transaction(async em => svc.generarParaTurno(em, EMPRESA, turno, [], asignaciones));
    await ds.transaction(async em => svc.generarParaTurno(em, EMPRESA, turno, [], asignaciones)); // reintento

    const lineas = await svc.porTurno(EMPRESA, turno.id);
    expect(lineas).toHaveLength(1);
    expect(Number(lineas[0].monto)).toBe(150);
  });

  it('anular: una comisión ya liquidada no se puede anular', async () => {
    if (!dbDisponible) return;
    const turno = await crearTurno('A6');
    const lavador = await crearLavador('Tito', 'por_vehiculo', 100);
    await asignar(turno.id, lavador.id, 100);
    await ds.transaction(async em => svc.generarParaTurno(em, EMPRESA, turno, [], [
      { turnoId: turno.id, lavadorId: lavador.id, porcentaje: 100 } as any,
    ]));
    const [linea] = await svc.porTurno(EMPRESA, turno.id);
    await ds.query(`UPDATE cw_comisiones SET "liquidacionId" = 999999 WHERE id = $1`, [linea.id]);

    await expect(svc.anular(EMPRESA, linea.id, 'motivo de prueba', 1)).rejects.toThrow();
  });
});
