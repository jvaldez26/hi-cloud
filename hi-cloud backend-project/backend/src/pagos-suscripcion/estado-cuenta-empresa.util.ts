/**
 * Estado de cuenta de una empresa — UNA sola fórmula, reutilizada por Mi
 * Suscripción (cliente), el panel de Cobros (super admin), el banner de
 * período de gracia/suspensión y los recordatorios. Antes cada pantalla
 * tenía su propio cálculo de "cuánto debe" y "cuántos días quedan", y
 * divergían: el cliente veía "Crédito disponible RD$5,600" mientras el
 * panel de Cobros, para la MISMA empresa, mostraba RD$10,000 pendientes
 * (auditoría 2026-10-06, empresa MOTO REPUESTO MANOLIN SRL).
 *
 * Dos funciones, no una, porque no todos los consumidores tienen a mano los
 * cargos pendientes (una query aparte contra pagos_suscripcion):
 *
 *   - construirEstadoFechas(): fechas, días restantes, gracia y la deuda de
 *     SUSCRIPCIÓN (calcularDeudaSuscripcion, que ya era la única pieza bien
 *     compartida). No necesita cargos — la usa SuscripcionesService.getSuscripcion()
 *     (GET /suscripciones/mi-plan, que alimenta el banner y el candado de
 *     suspensión) sin que ese servicio tenga que conocer la tabla de pagos.
 *   - construirEstadoCuenta(): todo lo anterior MÁS cargos pendientes, abono
 *     y el saldo neto real. La usan getMiResumen() y resumenCobros().
 *
 * Ambas son puras — nada de DB aquí, por eso se pueden probar sin mocks
 * pesados (ver estado-cuenta-empresa.util.spec.ts) y por eso resumenCobros()
 * puede seguir trayendo cargos/suscripciones de TODAS las empresas en una
 * sola query (sin esto, un estadoCuentaEmpresa(id) por fila sería N+1).
 *
 * TODAS las fechas de calendario (fechaVencimiento, fechaFinPrueba,
 * fechaFinGracia, fechaInicio) salen como 'YYYY-MM-DD' o null — nunca un
 * Date crudo. Un Date crudo en la respuesta JSON se serializa con `Z`
 * (medianoche UTC) y el formateador del frontend lo confunde con un
 * instante real, mostrando el día anterior en RD (UTC-4) — la causa exacta
 * del bug de fecha. Ver fechaDeVencimiento() en preview-pago.util.ts.
 */
import { calcularDeudaSuscripcion } from './deuda-suscripcion.util';
import { fechaDeVencimiento } from './preview-pago.util';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { redondearMoneda } from '../common/utils/moneda.util';

type FechaEntrada = string | Date | null | undefined;

function aFechaStr(v: FechaEntrada): string | null {
  if (v == null) return null;
  return fechaDeVencimiento(v);
}

/**
 * Días de `hoy` a `fecha` ('YYYY-MM-DD' ambas), positivo si `fecha` es
 * futura. NO se usa `diferenciaDiasRD` de fecha-local.util.ts: esa función
 * siempre calcula contra la fecha REAL del proceso (no acepta un `hoy` de
 * prueba), lo que vuelve esta función no determinística en los tests y
 * acoplada al reloj de la máquina en vez del `hoy` de RD que el caller ya
 * resolvió. Mismo anclaje a mediodía UTC que esa función, para evitar que
 * la resta cruce el borde por el desfase UTC-4 de RD.
 */
export function diasHasta(fecha: string, hoy: string): number {
  const [ay, am, ad] = fecha.split('-').map(Number);
  const objetivo = Date.UTC(ay, am - 1, ad, 12);
  const [hy, hm, hd] = hoy.split('-').map(Number);
  const hoyUtc = Date.UTC(hy, hm - 1, hd, 12);
  return Math.round((objetivo - hoyUtc) / 86_400_000);
}

export interface EntradaEstadoFechas {
  /** Estado tal como está guardado — NUNCA el efectivo, eso lo calcula esta función. */
  estado:            string;
  fechaInicio?:      FechaEntrada;
  fechaVencimiento:  FechaEntrada;
  fechaFinPrueba?:   FechaEntrada;
  diaCorte:          number;
  modalidad:         string;
  /** Precio del plan por MES — en modalidad anual, calcularDeudaSuscripcion lo multiplica ×12. */
  precioMensual:     number;
  enPeriodoGracia:   boolean;
  fechaFinGracia?:   FechaEntrada;
  motivoSuspension?: string | null;
  /** Hoy en RD ('YYYY-MM-DD'). Solo se pasa en los tests. */
  hoy?:              string;
}

export interface EstadoFechas {
  /** Estado EFECTIVO: si la gracia ya venció pero el cron aún no corrió, se reporta 'suspendida' en tiempo real. */
  estado:              string;
  motivoSuspension?:   string;
  fechaInicio:         string | null;
  /** La fecha que de verdad importa para "vence"/"venció": fechaFinPrueba en prueba, fechaVencimiento el resto. */
  fechaVencimiento:    string | null;
  fechaFinPrueba:      string | null;
  diasRestantes:       number;
  enPeriodoGracia:     boolean;
  fechaFinGracia:      string | null;
  diasGraciaRestantes: number;
  /** Deuda por períodos de plan vencidos — ver deuda-suscripcion.util.ts. No incluye cargos por servicios. */
  saldoSuscripcion:    number;
  periodosVencidos:    number;
  /** true si calcularDeudaSuscripcion tuvo que cortar en el tope de seguridad — el caller decide si avisa (Sentry). */
  topeDeudaAlcanzado:  boolean;
}

export function construirEstadoFechas(e: EntradaEstadoFechas): EstadoFechas {
  const hoy = e.hoy ?? fechaHoyRD();

  const fechaVencimiento = aFechaStr(e.fechaVencimiento);
  const fechaFinPrueba   = aFechaStr(e.fechaFinPrueba);
  const fechaFinGracia   = aFechaStr(e.fechaFinGracia);
  const fechaInicio      = aFechaStr(e.fechaInicio);

  // En prueba, lo que importa es cuándo termina la prueba, no un
  // fechaVencimiento que puede seguir ahí sin uso real.
  const fechaRef = e.estado === 'prueba' ? (fechaFinPrueba ?? fechaVencimiento) : fechaVencimiento;
  const diasRestantes = fechaRef ? diasHasta(fechaRef, hoy) : 0;

  const enGracia = e.enPeriodoGracia === true;
  const diasGraciaRestantes = enGracia && fechaFinGracia
    ? Math.max(0, diasHasta(fechaFinGracia, hoy))
    : 0;

  // Si la gracia venció pero el cron de suspensión aún no corrió, se deriva
  // 'suspendida' en tiempo real — el usuario no debe ver "activa" un rato
  // después de que su gracia ya se acabó.
  const estadoEfectivo =
    e.estado === 'activa' && enGracia && fechaFinGracia && fechaFinGracia < hoy
      ? 'suspendida'
      : e.estado;
  const motivoEfectivo =
    estadoEfectivo === 'suspendida' && e.estado !== 'suspendida'
      ? 'GRACIA_VENCIDA'
      : (e.motivoSuspension ?? undefined);

  const deuda = fechaVencimiento
    ? calcularDeudaSuscripcion({
        estado:           e.estado,
        fechaVencimiento,
        diaCorte:         Number(e.diaCorte ?? 1),
        modalidad:        e.modalidad ?? 'mensual',
        precioMensual:    Number(e.precioMensual ?? 0),
        hoy:              e.hoy,
      })
    : { periodosVencidos: 0, monto: 0, tope: false };

  return {
    estado:              estadoEfectivo,
    motivoSuspension:    motivoEfectivo,
    fechaInicio,
    fechaVencimiento,
    fechaFinPrueba,
    diasRestantes,
    enPeriodoGracia:     enGracia,
    fechaFinGracia,
    diasGraciaRestantes,
    saldoSuscripcion:    deuda.monto,
    periodosVencidos:    deuda.periodosVencidos,
    topeDeudaAlcanzado:  deuda.tope,
  };
}

export interface CargoPendienteEntrada {
  id:         number;
  concepto:   string;
  monto:      number;
  montoPagado: number;
  creadoEn?:  FechaEntrada;
}

export interface CargoPendiente {
  id:             number;
  concepto:       string;
  monto:          number;
  montoPagado:    number;
  saldoPendiente: number;
  creadoEn:       string | null;
}

export interface EntradaEstadoCuenta extends EntradaEstadoFechas {
  abonoDisponible:  number;
  /**
   * Cargos de la empresa con monto > montoPagado (el caller filtra — mismo
   * criterio que calcularImputacion(), no se repite aquí para no obligar a
   * esta función a saber de dónde vienen los cargos).
   */
  cargosPendientes: CargoPendienteEntrada[];
}

export interface EstadoCuentaEmpresa extends EstadoFechas {
  cargosPendientes: CargoPendiente[];
  /** Suma de saldoPendiente de cargosPendientes — cargos YA pagados no cuentan, a diferencia del viejo "saldo" (ledger completo). */
  saldoCargos:      number;
  /** Abono/crédito ya reservado — suscripciones.abonoDisponible, lo único que cuenta como crédito REAL. */
  abonoDisponible:  number;
  /** saldoCargos + saldoSuscripcion — lo que la empresa debe hoy, sin tocar abono. */
  totalAdeudado:    number;
  /**
   * totalAdeudado − abonoDisponible. Positivo = debe esa cantidad (tarjeta
   * roja "Saldo pendiente"). Negativo = los pagos superaron lo adeudado —
   * crédito a favor REAL, no un acumulado histórico que ignora deuda nueva
   * (ver comentario de archivo). Cero = al día.
   */
  saldoNeto:        number;
}

export function construirEstadoCuenta(e: EntradaEstadoCuenta): EstadoCuentaEmpresa {
  const fechas = construirEstadoFechas(e);

  const cargosPendientes: CargoPendiente[] = (e.cargosPendientes ?? [])
    .map(c => ({
      id:             c.id,
      concepto:       c.concepto,
      monto:          redondearMoneda(Number(c.monto ?? 0)),
      montoPagado:    redondearMoneda(Number(c.montoPagado ?? 0)),
      saldoPendiente: redondearMoneda(Number(c.monto ?? 0) - Number(c.montoPagado ?? 0)),
      creadoEn:       aFechaStr(c.creadoEn),
    }))
    .filter(c => c.saldoPendiente > 0);

  const saldoCargos = redondearMoneda(
    cargosPendientes.reduce((acc, c) => acc + c.saldoPendiente, 0),
  );
  const abonoDisponible = redondearMoneda(Number(e.abonoDisponible ?? 0));
  const totalAdeudado   = redondearMoneda(saldoCargos + fechas.saldoSuscripcion);
  const saldoNeto       = redondearMoneda(totalAdeudado - abonoDisponible);

  return {
    ...fechas,
    cargosPendientes,
    saldoCargos,
    abonoDisponible,
    totalAdeudado,
    saldoNeto,
  };
}
