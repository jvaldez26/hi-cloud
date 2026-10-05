import { DataSource } from 'typeorm';
import { CajaService } from '../../caja/caja.service';
import { CierreCaja, EstadoCierre } from '../../caja/entities/cierre-caja.entity';
import { RetiroCaja } from '../../caja/entities/retiro-caja.entity';
import { CwLavador } from '../entities/cw-lavador.entity';
import { CwLiquidacionesService } from './cw-liquidaciones.service';

/**
 * Integración REAL contra Postgres (incluye un CajaService real, no un mock)
 * — "no se liquida dos veces" depende del FOR UPDATE de verdad, algo que un
 * mock de repositorio no puede demostrar bajo concurrencia real.
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
let svc: CwLiquidacionesService;
let cajaId: number;

const EMPRESA = 777_060;
const USUARIO_ID = 10;

function fakeTenantService(empresaId: number) {
  return { getEmpresaId: () => empresaId } as any;
}
function fakeRealtime() {
  return { notify: () => {} } as any;
}

async function limpiar() {
  await ds.query(`DELETE FROM cw_liquidaciones WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_adelantos WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_comisiones WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM cw_lavadores WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM retiros_caja WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM cierres_caja WHERE "empresaId" = $1`, [EMPRESA]);
}

let turnoIdSiguiente = 1;

async function insertarComision(lavadorId: number, monto: number, fecha: string, turnoId = turnoIdSiguiente++) {
  const [row] = await ds.query(
    `INSERT INTO cw_comisiones
       ("empresaId","turnoId","lavadorId","servicioId","servicioNombre","modoPago",base,"tarifaAplicada","porcentajeReparto",monto,fecha,estado)
     VALUES ($1,$2,$3,NULL,NULL,'por_vehiculo',$4,$4,100,$4,$5,'activa') RETURNING id`,
    [EMPRESA, turnoId, lavadorId, monto, fecha],
  );
  return row.id;
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [CierreCaja, RetiroCaja, CwLavador],
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

  const cajaService = new CajaService(
    ds.getRepository(CierreCaja), ds.getRepository(RetiroCaja), ds, fakeTenantService(EMPRESA), fakeRealtime(),
  );
  svc = new CwLiquidacionesService(ds, cajaService);

  const [caja] = await ds.query(
    `INSERT INTO cierres_caja ("empresaId", "sucursalId", fecha, estado, "saldoApertura", "vendedorId", "userId")
     VALUES ($1, 1, CURRENT_DATE, 'abierta', 100000, $2, $2) RETURNING id`,
    [EMPRESA, USUARIO_ID],
  );
  cajaId = caja.id;
});

afterAll(async () => {
  if (!dbDisponible) return;
  await limpiar();
  await ds.destroy();
});

describe('CwLiquidacionesService.registrarPago (integración real contra Postgres)', () => {
  it('paga comisiones del rango, descuenta adelantos, y registra la salida neta en caja', async () => {
    if (!dbDisponible) return;
    const [lavador] = await ds.query(
      `INSERT INTO cw_lavadores ("empresaId", nombre, "modoPago", "valorModoPago") VALUES ($1, 'Liq Test 1', 'por_vehiculo', 100) RETURNING id`,
      [EMPRESA],
    );
    const lavadorId = lavador.id;
    await insertarComision(lavadorId, 300, '2026-10-01');
    await insertarComision(lavadorId, 200, '2026-10-02');
    await ds.query(
      `INSERT INTO cw_adelantos ("empresaId","lavadorId",monto,fecha,"usuarioId") VALUES ($1,$2,150,'2026-10-01',$3)`,
      [EMPRESA, lavadorId, USUARIO_ID],
    );

    const resultado = await svc.registrarPago(EMPRESA, { lavadorId, desde: '2026-10-01', hasta: '2026-10-02', cajaId }, USUARIO_ID);

    expect(resultado.totalComisiones).toBe(500);
    expect(resultado.totalAdelantos).toBe(150);
    expect(resultado.totalPagado).toBe(350); // 500 - 150
    expect(resultado.retiroRegistrado).toBe(true);
    expect(resultado.retiroCajaId).toBeTruthy();

    const [retiro] = await ds.query(`SELECT monto, categoria FROM retiros_caja WHERE id = $1`, [resultado.retiroCajaId]);
    expect(Number(retiro.monto)).toBe(350);
    expect(retiro.categoria).toBe('pago_lavador');
  });

  it('no se liquida dos veces el mismo período ni la misma comisión', async () => {
    if (!dbDisponible) return;
    const [lavador] = await ds.query(
      `INSERT INTO cw_lavadores ("empresaId", nombre, "modoPago", "valorModoPago") VALUES ($1, 'Liq Test 2', 'por_vehiculo', 100) RETURNING id`,
      [EMPRESA],
    );
    const lavadorId = lavador.id;
    await insertarComision(lavadorId, 400, '2026-10-05');

    const primera = await svc.registrarPago(EMPRESA, { lavadorId, desde: '2026-10-05', hasta: '2026-10-05', cajaId }, USUARIO_ID);
    expect(primera.totalComisiones).toBe(400);

    // Mismo rango otra vez: ya no hay nada pendiente (liquidacionId ya marcado).
    await expect(
      svc.registrarPago(EMPRESA, { lavadorId, desde: '2026-10-05', hasta: '2026-10-05', cajaId }, USUARIO_ID),
    ).rejects.toThrow();

    // Rango MÁS AMPLIO que vuelve a incluir esa misma fecha — tampoco debe recobrarla.
    await expect(
      svc.registrarPago(EMPRESA, { lavadorId, desde: '2026-10-01', hasta: '2026-10-10', cajaId }, USUARIO_ID),
    ).rejects.toThrow();

    const [{ cnt }] = await ds.query(
      `SELECT COUNT(DISTINCT "liquidacionId")::int AS cnt FROM cw_comisiones WHERE "lavadorId" = $1 AND "liquidacionId" IS NOT NULL`,
      [lavadorId],
    );
    expect(cnt).toBe(1); // una sola liquidación le tocó a esta comisión, nunca dos
  });

  it('si solo hay adelantos (sin comisiones) y superan 0, igual liquida sin pago (totalPagado=0, no revienta)', async () => {
    if (!dbDisponible) return;
    const [lavador] = await ds.query(
      `INSERT INTO cw_lavadores ("empresaId", nombre, "modoPago", "valorModoPago") VALUES ($1, 'Liq Test 3', 'por_vehiculo', 100) RETURNING id`,
      [EMPRESA],
    );
    const lavadorId = lavador.id;
    await ds.query(
      `INSERT INTO cw_adelantos ("empresaId","lavadorId",monto,fecha,"usuarioId") VALUES ($1,$2,500,'2026-10-06',$3)`,
      [EMPRESA, lavadorId, USUARIO_ID],
    );

    const resultado = await svc.registrarPago(EMPRESA, { lavadorId, desde: '2026-10-06', hasta: '2026-10-06', cajaId }, USUARIO_ID);
    expect(resultado.totalComisiones).toBe(0);
    expect(resultado.totalAdelantos).toBe(500);
    expect(resultado.totalPagado).toBe(0); // no se le debe nada más — el adelanto ya cubrió de sobra
    expect(resultado.retiroCajaId).toBeNull();
  });

  it('metodoPago=transferencia: no crea ningún retiro de caja, guarda la referencia', async () => {
    if (!dbDisponible) return;
    const [lavador] = await ds.query(
      `INSERT INTO cw_lavadores ("empresaId", nombre, "modoPago", "valorModoPago") VALUES ($1, 'Liq Test 4', 'por_vehiculo', 100) RETURNING id`,
      [EMPRESA],
    );
    const lavadorId = lavador.id;
    await insertarComision(lavadorId, 600, '2026-10-07');
    const [{ cnt: retirosAntes }] = await ds.query(`SELECT COUNT(*)::int AS cnt FROM retiros_caja WHERE "empresaId" = $1`, [EMPRESA]);

    const resultado = await svc.registrarPago(
      EMPRESA, { lavadorId, desde: '2026-10-07', hasta: '2026-10-07', metodoPago: 'transferencia', referencia: 'TRF-00123' }, USUARIO_ID,
    );

    expect(resultado.totalPagado).toBe(600);
    expect(resultado.retiroCajaId).toBeNull();
    expect(resultado.retiroRegistrado).toBe(true);

    const [{ cnt: retirosDespues }] = await ds.query(`SELECT COUNT(*)::int AS cnt FROM retiros_caja WHERE "empresaId" = $1`, [EMPRESA]);
    expect(retirosDespues).toBe(retirosAntes); // ni un retiro nuevo

    const [liq] = await ds.query(`SELECT "metodoPago", referencia, "retiroCajaId" FROM cw_liquidaciones WHERE id = $1`, [resultado.liquidacionId]);
    expect(liq.metodoPago).toBe('transferencia');
    expect(liq.referencia).toBe('TRF-00123');
    expect(liq.retiroCajaId).toBeNull();
  });

  it('metodoPago=efectivo sin cajaId y sin caja abierta → 400 "Abra la caja para pagar en efectivo"', async () => {
    if (!dbDisponible) return;
    const [lavador] = await ds.query(
      `INSERT INTO cw_lavadores ("empresaId", nombre, "modoPago", "valorModoPago") VALUES ($1, 'Liq Test 5', 'por_vehiculo', 100) RETURNING id`,
      [EMPRESA],
    );
    const lavadorId = lavador.id;
    await insertarComision(lavadorId, 100, '2026-10-08');
    const USUARIO_SIN_CAJA = 11; // fixture real de la BD de pruebas, sin cierre de caja hoy

    await expect(
      svc.registrarPago(EMPRESA, { lavadorId, desde: '2026-10-08', hasta: '2026-10-08' }, USUARIO_SIN_CAJA),
    ).rejects.toThrow('Abra la caja para pagar en efectivo');

    // No debe haber marcado la comisión como liquidada — el fallo fue ANTES de tocarla.
    const [{ cnt }] = await ds.query(`SELECT COUNT(*)::int AS cnt FROM cw_comisiones WHERE "lavadorId" = $1 AND "liquidacionId" IS NOT NULL`, [lavadorId]);
    expect(cnt).toBe(0);
  });
});
