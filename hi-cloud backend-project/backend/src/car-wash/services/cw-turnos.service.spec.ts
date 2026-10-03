import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CwTurno } from '../entities/cw-turno.entity';
import { CwTurnoServicio } from '../entities/cw-turno-servicio.entity';
import { CwTurnoEvento } from '../entities/cw-turno-evento.entity';
import { CwTurnoLavador } from '../entities/cw-turno-lavador.entity';
import { CwComision } from '../entities/cw-comision.entity';
import { CwLavador } from '../entities/cw-lavador.entity';
import { CwConfig } from '../entities/cw-config.entity';
import { CwServicio } from '../entities/cw-servicio.entity';
import { CwServicioPrecio } from '../entities/cw-servicio-precio.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { CwConfigService } from './cw-config.service';
import { CwServiciosService } from './cw-servicios.service';
import { CwContadorService } from './cw-contador.service';
import { CwComisionesService } from './cw-comisiones.service';
import { CwDashboardService } from './cw-dashboard.service';
import { CwTurnosService } from './cw-turnos.service';
import { OrigenFacturaValidadoresRegistry } from '../../common/origen-factura/origen-factura-validadores.registry';
import * as fechaLocalUtil from '../../common/utils/fecha-local.util';

/**
 * Integración REAL contra Postgres (no mocks de repositorio) — las
 * transiciones, el cálculo de cola y el token público dependen de datos y
 * tiempos reales que un mock no puede demostrar con la misma confianza.
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
let svc: CwTurnosService;
let serviciosSvc: CwServiciosService;

const EMPRESA_A = 777_010;
const EMPRESA_B = 777_020; // para el test de aislamiento multi-tenant
const SUCURSAL = 1;
const USUARIO_ID = 999_001;

function fakeRealtime() {
  return { notify: jest.fn() } as any;
}

async function limpiarEmpresa(empresaId: number) {
  const turnos = await ds.query(`SELECT id FROM cw_turnos WHERE "empresaId" = $1`, [empresaId]);
  const ids = turnos.map((t: any) => t.id);
  if (ids.length) {
    await ds.query(`DELETE FROM cw_turno_eventos WHERE "turnoId" = ANY($1)`, [ids]);
    await ds.query(`DELETE FROM cw_turno_servicios WHERE "turnoId" = ANY($1)`, [ids]);
    await ds.query(`DELETE FROM cw_turnos WHERE "empresaId" = $1`, [empresaId]);
  }
  const servicios = await ds.query(`SELECT id, "productoId" FROM cw_servicios WHERE "empresaId" = $1`, [empresaId]);
  for (const s of servicios) {
    await ds.query(`DELETE FROM cw_servicio_precios WHERE "servicioId" = $1`, [s.id]);
    await ds.query(`DELETE FROM productos WHERE id = $1`, [s.productoId]);
  }
  await ds.query(`DELETE FROM cw_servicios WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM cw_config WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM cw_contador_turno WHERE "empresaId" = $1`, [empresaId]);
}

async function crearServicioDuracion(empresaId: number, nombre: string, minutos: number, precio = 500) {
  return serviciosSvc.crear(empresaId, {
    nombre,
    precios: [
      { tipoVehiculo: 'carro', duracionMinutos: minutos, precio },
      { tipoVehiculo: 'jeepeta', duracionMinutos: minutos + 5, precio: precio + 100 },
      { tipoVehiculo: 'camioneta', duracionMinutos: minutos + 5, precio: precio + 100 },
      { tipoVehiculo: 'moto', duracionMinutos: Math.max(5, minutos - 10), precio: precio - 200 },
      { tipoVehiculo: 'camion', duracionMinutos: minutos + 15, precio: precio + 300 },
    ],
  });
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [
      CwTurno, CwTurnoServicio, CwTurnoEvento, CwTurnoLavador, CwComision, CwLavador,
      CwConfig, CwServicio, CwServicioPrecio, Producto,
    ],
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
    return;
  }
  await limpiarEmpresa(EMPRESA_A);
  await limpiarEmpresa(EMPRESA_B);

  const configSvc = new CwConfigService(ds.getRepository(CwConfig));
  serviciosSvc = new CwServiciosService(ds.getRepository(CwServicio), ds.getRepository(CwServicioPrecio), ds.getRepository(Producto));
  const contadorSvc = new CwContadorService(ds);
  const comisionesSvc = new CwComisionesService(ds.getRepository(CwComision));
  svc = new CwTurnosService(
    ds.getRepository(CwTurno), ds.getRepository(CwTurnoServicio), ds.getRepository(CwTurnoEvento), ds.getRepository(CwTurnoLavador),
    configSvc, serviciosSvc, contadorSvc, comisionesSvc, fakeRealtime(), new OrigenFacturaValidadoresRegistry(), ds,
  );
});

afterAll(async () => {
  if (!dbDisponible) return;
  await limpiarEmpresa(EMPRESA_A);
  await limpiarEmpresa(EMPRESA_B);
  await ds.destroy();
});

describe('CwTurnosService (integración real contra Postgres)', () => {
  it('crea un turno con código secuencial, token de 64 hex y servicios congelados', async () => {
    if (!dbDisponible) return;
    const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado básico', 20, 300);

    const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, {
      placa: 'abc123', tipoVehiculo: 'carro', servicioIds: [lavado.id],
    });

    expect(turno.codigo).toBe('L-001');
    expect(turno.placa).toBe('ABC123'); // normalizada a mayúsculas
    expect(turno.tokenPublico).toHaveLength(64);
    expect(turno.estado).toBe('en_espera');
    expect(turno.enEsperaAt).toBeTruthy();

    const detalle = await svc.obtener(EMPRESA_A, turno.id);
    expect(detalle.servicios).toHaveLength(1);
    expect(Number(detalle.servicios[0].precio)).toBe(300); // precio de 'carro', no el de jeepeta
    expect(detalle.servicios[0].duracionMinutos).toBe(20);
  });

  it('transición inválida (saltar etapas) responde 409', async () => {
    if (!dbDisponible) return;
    const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado 409', 15);
    const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'XYZ999', tipoVehiculo: 'carro', servicioIds: [lavado.id] });

    await expect(
      svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'entregado' }, USUARIO_ID, false),
    ).rejects.toThrow(ConflictException);
  });

  it('cancelar sin motivo responde 409; con motivo, cierra el turno y registra el evento', async () => {
    if (!dbDisponible) return;
    const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado cancel', 15);
    const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'CAN001', tipoVehiculo: 'carro', servicioIds: [lavado.id] });

    await expect(
      svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'cancelado' }, USUARIO_ID, false),
    ).rejects.toThrow(ConflictException);

    const cancelado = await svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'cancelado', motivo: 'cliente no llegó' }, USUARIO_ID, false);
    expect(cancelado.estado).toBe('cancelado');
    expect(cancelado.canceladoAt).toBeTruthy();

    const eventos = await ds.query(`SELECT "estadoNuevo", motivo FROM cw_turno_eventos WHERE "turnoId" = $1 ORDER BY id DESC LIMIT 1`, [turno.id]);
    expect(eventos[0].estadoNuevo).toBe('cancelado');
    expect(eventos[0].motivo).toBe('cliente no llegó');
  });

  it('cobroEn=entrega bloquea pasar a ENTREGADO sin factura, salvo forzarSinCobro + rol con permiso', async () => {
    if (!dbDisponible) return;
    const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado cobro', 15);
    const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'COB001', tipoVehiculo: 'carro', servicioIds: [lavado.id] });
    await svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'en_lavado' }, USUARIO_ID, false);
    await svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'listo' }, USUARIO_ID, false);

    // Sin cobro y sin forzar -> 409
    await expect(
      svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'entregado' }, USUARIO_ID, false),
    ).rejects.toThrow(ConflictException);

    // forzarSinCobro pero sin permiso de rol -> sigue bloqueado
    await expect(
      svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'entregado', forzarSinCobro: true }, USUARIO_ID, false),
    ).rejects.toThrow(ConflictException);

    // forzarSinCobro + permiso de rol -> pasa, y queda registrado en el evento
    const entregado = await svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'entregado', forzarSinCobro: true, motivo: 'cliente de confianza' }, USUARIO_ID, true);
    expect(entregado.estado).toBe('entregado');

    const [ultimoEvento] = await ds.query(`SELECT motivo FROM cw_turno_eventos WHERE "turnoId" = $1 ORDER BY id DESC LIMIT 1`, [turno.id]);
    expect(ultimoEvento.motivo).toContain('forzado a ENTREGADO sin cobro');
  });

  it('token público: oculta datos sensibles y enmascara la placa', async () => {
    if (!dbDisponible) return;
    const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado público', 15);
    const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, {
      placa: 'SEC777', tipoVehiculo: 'carro', servicioIds: [lavado.id], telefono: '8095551234', clienteId: 42,
    });

    const publico = await svc.obtenerPorTokenPublico(turno.tokenPublico);
    expect(publico).toBeTruthy();
    expect(publico!.placaEnmascarada).not.toBe('SEC777');
    expect(publico!.placaEnmascarada).toMatch(/^SE.+77$/);
    expect(JSON.stringify(publico)).not.toContain('8095551234');
    expect(JSON.stringify(publico)).not.toContain('"clienteId"');
    expect(JSON.stringify(publico)).not.toContain('300'); // precio del servicio
  });

  it('token público: mismo resultado (null) para token inexistente o caducado', async () => {
    if (!dbDisponible) return;
    expect(await svc.obtenerPorTokenPublico('token-que-no-existe-jamas')).toBeNull();

    const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado caduco', 15);
    const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'CAD001', tipoVehiculo: 'carro', servicioIds: [lavado.id] });
    await svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'en_lavado' }, USUARIO_ID, false);
    await svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'listo' }, USUARIO_ID, false);
    await svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'entregado', forzarSinCobro: true, motivo: 'test' }, USUARIO_ID, true);

    // Simula que ya pasaron las horas de caducidad (default 24h) retrocediendo entregadoAt.
    await ds.query(`UPDATE cw_turnos SET "entregadoAt" = NOW() - INTERVAL '48 hours' WHERE id = $1`, [turno.id]);
    expect(await svc.obtenerPorTokenPublico(turno.tokenPublico)).toBeNull();
  });

  it('posición en cola y tiempo estimado: 3 en espera + 1 en lavado, con 2 bahías', async () => {
    if (!dbDisponible) return;
    const sucursalCola = 55;
    await ds.query(`DELETE FROM cw_turnos WHERE "empresaId" = $1 AND "sucursalId" = $2`, [EMPRESA_A, sucursalCola]);
    await ds.query(`DELETE FROM cw_config WHERE "empresaId" = $1 AND "sucursalId" = $2`, [EMPRESA_A, sucursalCola]);
    const configSvc = new CwConfigService(ds.getRepository(CwConfig));
    await configSvc.actualizar(EMPRESA_A, sucursalCola, { bahiasActivas: 2 });

    const lavado20 = await crearServicioDuracion(EMPRESA_A, 'Cola 20min', 20);

    // 3 en espera, en orden de llegada
    const t1 = await svc.crear(EMPRESA_A, sucursalCola, USUARIO_ID, { placa: 'COLA01', tipoVehiculo: 'carro', servicioIds: [lavado20.id] });
    await new Promise(r => setTimeout(r, 10));
    const t2 = await svc.crear(EMPRESA_A, sucursalCola, USUARIO_ID, { placa: 'COLA02', tipoVehiculo: 'carro', servicioIds: [lavado20.id] });
    await new Promise(r => setTimeout(r, 10));
    const t3 = await svc.crear(EMPRESA_A, sucursalCola, USUARIO_ID, { placa: 'COLA03', tipoVehiculo: 'carro', servicioIds: [lavado20.id] });

    // 1 ya en lavado (no cuenta como "delante" en la cola de espera, pero sí consume bahía)
    const t0 = await svc.crear(EMPRESA_A, sucursalCola, USUARIO_ID, { placa: 'COLA00', tipoVehiculo: 'carro', servicioIds: [lavado20.id] });
    await svc.cambiarEstado(EMPRESA_A, t0.id, { estado: 'en_lavado' }, USUARIO_ID, false);

    const publico2 = await svc.obtenerPorTokenPublico(t2.tokenPublico);
    // Delante de t2 solo está t1 (t0 está en_lavado, no en_espera)
    expect(publico2!.posicionEnCola).toBe(1);
    // minutosEstimados = ceil((20[t1 delante] + ~20[t0 en lavado, recién iniciado]) / 2 bahías) ≈ 20
    expect(publico2!.minutosEstimados).toBeGreaterThanOrEqual(15);
    expect(publico2!.minutosEstimados).toBeLessThanOrEqual(25);

    const publico3 = await svc.obtenerPorTokenPublico(t3.tokenPublico);
    expect(publico3!.posicionEnCola).toBe(2); // t1 y t2 delante
  });

  it('aislamiento multi-tenant: el tablero de una empresa no muestra turnos de otra', async () => {
    if (!dbDisponible) return;
    const lavadoA = await crearServicioDuracion(EMPRESA_A, 'Lavado A', 15);
    const lavadoB = await crearServicioDuracion(EMPRESA_B, 'Lavado B', 15);
    await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'TENA01', tipoVehiculo: 'carro', servicioIds: [lavadoA.id] });
    await svc.crear(EMPRESA_B, SUCURSAL, USUARIO_ID, { placa: 'TENB01', tipoVehiculo: 'carro', servicioIds: [lavadoB.id] });

    const tableroA = await svc.listarTablero(EMPRESA_A, SUCURSAL);
    const tableroB = await svc.listarTablero(EMPRESA_B, SUCURSAL);

    expect(tableroA.some(t => t.placa === 'TENB01')).toBe(false);
    expect(tableroB.some(t => t.placa === 'TENA01')).toBe(false);
    expect(tableroA.some(t => t.placa === 'TENA01')).toBe(true);
    expect(tableroB.some(t => t.placa === 'TENB01')).toBe(true);
  });

  it('un turno creado a las 23:30 hora RD cae en el día RD correcto (no el día UTC siguiente), y los filtros de historial lo respetan', async () => {
    if (!dbDisponible) return;
    const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado RD', 15);

    // RD es UTC-4 fijo (sin horario de verano): 23:30 del 10/oct hora RD es
    // 03:30 UTC del 11/oct. En vez de mover el reloj del proceso (afecta el
    // driver de Postgres y hace colgar los tests), se intercepta fechaHoyRD()
    // directamente — la misma función que usa svc.crear() internamente. Si
    // alguna comparación envolviera la columna en AT TIME ZONE con la
    // dirección invertida (el bug ya corregido una vez en cuota-ecf.service.ts),
    // este turno aparecería el 11, no el 10.
    const spy = jest.spyOn(fechaLocalUtil, 'fechaHoyRD').mockReturnValue('2026-10-10');
    let turno: any;
    try {
      turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'RD2330', tipoVehiculo: 'carro', servicioIds: [lavado.id] });
    } finally {
      spy.mockRestore();
    }

    expect(turno.fechaRD).toBe('2026-10-10');

    const diaCorrecto = await svc.listarHistorial(EMPRESA_A, SUCURSAL, { desde: '2026-10-10', hasta: '2026-10-10' } as any);
    expect(diaCorrecto.data.some((t: any) => t.id === turno.id)).toBe(true);

    const diaSiguienteUTC = await svc.listarHistorial(EMPRESA_A, SUCURSAL, { desde: '2026-10-11', hasta: '2026-10-11' } as any);
    expect(diaSiguienteUTC.data.some((t: any) => t.id === turno.id)).toBe(false);
  });

  it('CwDashboardService.resumen() también cuenta "vehiculosHoy" en hora RD, no UTC', async () => {
    if (!dbDisponible) return;
    const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado Dashboard RD', 15);
    const dashboardSvc = new CwDashboardService(ds);

    // Crea el turno "a las 23:30 RD del 12/oct" (fechaHoyRD() interceptado).
    const spyCrear = jest.spyOn(fechaLocalUtil, 'fechaHoyRD').mockReturnValue('2026-10-12');
    let turno: any;
    try {
      turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'DASH1230', tipoVehiculo: 'carro', servicioIds: [lavado.id] });
    } finally {
      spyCrear.mockRestore();
    }
    expect(turno.fechaRD).toBe('2026-10-12');

    // "Ahora" sigue siendo el 12 en RD (mismo instante de creación) → debe contarlo.
    const spyHoy12 = jest.spyOn(fechaLocalUtil, 'fechaHoyRD').mockReturnValue('2026-10-12');
    let resumenMismoDia: any;
    try {
      resumenMismoDia = await dashboardSvc.resumen(EMPRESA_A, SUCURSAL);
    } finally {
      spyHoy12.mockRestore();
    }
    expect(resumenMismoDia.vehiculosHoy).toBeGreaterThanOrEqual(1);

    // "Ahora" ya es el 13 en RD (cruzó medianoche RD) → no debe contarlo como "hoy".
    const spyHoy13 = jest.spyOn(fechaLocalUtil, 'fechaHoyRD').mockReturnValue('2026-10-13');
    let resumenDiaSiguiente: any;
    try {
      resumenDiaSiguiente = await dashboardSvc.resumen(EMPRESA_A, SUCURSAL);
    } finally {
      spyHoy13.mockRestore();
    }
    expect(resumenDiaSiguiente.vehiculosHoy).toBe(0);
  });

  describe('historialPorPlaca (hotfix Sentry 7769544465 — ultimoTurno nunca debe faltar)', () => {
    it('placa que nunca vino → null', async () => {
      if (!dbDisponible) return;
      expect(await svc.historialPorPlaca(EMPRESA_A, 'NUNCA999')).toBeNull();
    });

    it('placa con un solo turno CANCELADO → sigue devolviendo ultimoTurno con los datos del vehículo', async () => {
      if (!dbDisponible) return;
      const lavado = await crearServicioDuracion(EMPRESA_A, 'Lavado hist cancel', 15);
      const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, {
        placa: 'HISTCAN1', tipoVehiculo: 'carro', servicioIds: [lavado.id], marca: 'Toyota', color: 'Rojo',
      });
      await svc.cambiarEstado(EMPRESA_A, turno.id, { estado: 'cancelado', motivo: 'prueba' }, USUARIO_ID, false);

      const historial = await svc.historialPorPlaca(EMPRESA_A, 'HISTCAN1');
      expect(historial).not.toBeNull();
      expect(historial.visitas).toBe(1);
      expect(historial.ultimoTurno).toBeTruthy();
      expect(historial.ultimoTurno.marca).toBe('Toyota');
      expect(historial.ultimoTurno.color).toBe('Rojo');
      expect(Array.isArray(historial.ultimoTurno.servicios)).toBe(true);
    });

    it('placa con turno sin servicios (sin filas en cw_turno_servicios) → servicios es [], no undefined', async () => {
      if (!dbDisponible) return;
      const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, {
        placa: 'HISTVACIO', tipoVehiculo: 'moto', servicioIds: [],
      });
      await ds.query(`DELETE FROM cw_turno_servicios WHERE "turnoId" = $1`, [turno.id]);

      const historial = await svc.historialPorPlaca(EMPRESA_A, 'HISTVACIO');
      expect(historial.ultimoTurno.servicios).toEqual([]);
    });

    it('placa con cliente asociado null → clienteId/clienteNombre null, nunca lanza', async () => {
      if (!dbDisponible) return;
      const turno = await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, {
        placa: 'HISTSINCLI', tipoVehiculo: 'carro', servicioIds: [],
      });
      expect(turno.clienteId ?? null).toBeNull();

      const historial = await svc.historialPorPlaca(EMPRESA_A, 'HISTSINCLI');
      expect(historial.clienteId).toBeNull();
      expect(historial.clienteNombre).toBeNull();
      expect(historial.ultimoTurno).toBeTruthy();
    });

    it('visitas cuenta TODOS los turnos de la placa (incluidos cancelados) y ultimoTurno es el más reciente', async () => {
      if (!dbDisponible) return;
      await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'HISTMULTI', tipoVehiculo: 'carro', servicioIds: [], marca: 'Honda' });
      await new Promise(r => setTimeout(r, 10));
      await svc.crear(EMPRESA_A, SUCURSAL, USUARIO_ID, { placa: 'HISTMULTI', tipoVehiculo: 'carro', servicioIds: [], marca: 'Kia' });

      const historial = await svc.historialPorPlaca(EMPRESA_A, 'HISTMULTI');
      expect(historial.visitas).toBe(2);
      expect(historial.ultimoTurno.marca).toBe('Kia');
    });
  });
});
