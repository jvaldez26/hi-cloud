/**
 * Cómo se reparte un pago entre cargos pendientes, períodos de plan y abono.
 *
 * ORDEN DE IMPUTACIÓN (decidido, no reabrir):
 *   1. Cargos pendientes, del más antiguo al más reciente (FIFO por fecha).
 *      Un cargo puede quedar parcialmente pagado, con su saldo restante.
 *   2. El remanente avanza períodos de plan: floor(resto / precio del plan).
 *   3. Lo que sobre queda como abono en el saldo, sin mover la fecha.
 *
 * Antes de esto, registrarPago() hacía floor(monto / precio) sobre el monto
 * COMPLETO, ignorando cualquier cargo pendiente: un cliente que debía un
 * cargo de 18,000 más su mensualidad de 5,200 y pagaba 23,200 recibía 4
 * períodos de plan en vez de 1, y el cargo quedaba vivo.
 *
 * Pura y exportada para poder verificarla — ver imputacion-pago.util.spec.ts.
 * La usan previewPago() (solo lee, no escribe) y registrarPago()/
 * confirmarTransferencia() (que además persisten el resultado) — una sola
 * fórmula, igual que preview-pago.util.ts ya hace para el cálculo de
 * períodos por sí solo.
 */
import { redondearMoneda } from '../common/utils/moneda.util';
import { calcularPreviewPago, type EntradaPreview } from './preview-pago.util';

export type OverrideImputacion = 'solo_cargos' | 'solo_suscripcion' | null;

export interface CargoPendienteEntrada {
  id:             number;
  concepto:       string;
  /** monto - montoPagado del cargo. Se asume > 0 (ya filtrado por el caller). */
  saldoPendiente: number;
}

export interface CargoLiquidado {
  cargoId:        number;
  concepto:       string;
  montoAplicado:  number;
  /** 0 si el cargo quedó totalmente liquidado con este pago. */
  saldoRestante:  number;
}

export interface EntradaImputacion {
  /** El pago que se está registrando ahora — SIN el abono previo todavía. */
  monto:            number;
  /** Abono existente de la empresa (suscripciones.abonoDisponible). Se suma
   *  al monto ANTES de imputar — un abono que no se consume queda huérfano. */
  abonoDisponible:  number;
  /** Ya ordenados del más antiguo al más reciente (FIFO) — lo ordena el caller. */
  cargosPendientes: CargoPendienteEntrada[];
  precioMensual:    number;
  venceSuscripcion: string | Date;
  diaCorte:         number;
  modalidad:        string;
  override?:        OverrideImputacion;
  /** Hoy en RD ('YYYY-MM-DD'). Solo se pasa en los tests. */
  hoy?:             string;
}

export interface ResultadoImputacion {
  /** monto + abonoDisponible — lo que en total se repartió. */
  montoTotalImputado: number;
  cargosLiquidados:   CargoLiquidado[];
  montoACargos:       number;
  montoAPeriodos:     number;
  periodos:           number;
  precioPorPeriodo:   number;
  nuevaFecha:         string | null;
  /** Lo que falta para completar un período, si periodos = 0. */
  faltante:           number;
  enPasado:           boolean;
  sinPrecio:          boolean;
  /** Lo que sobró tras cargos y períodos — el nuevo abonoDisponible. */
  abonoFinal:         number;
}

export function imputarPago(e: EntradaImputacion): ResultadoImputacion {
  const override = e.override ?? null;
  const montoTotalImputado = redondearMoneda(Number(e.monto ?? 0) + Number(e.abonoDisponible ?? 0));
  let disponible = montoTotalImputado;

  // ── 1. Cargos pendientes, FIFO ──────────────────────────────────────────
  const cargosLiquidados: CargoLiquidado[] = [];
  let montoACargos = 0;

  if (override !== 'solo_suscripcion') {
    for (const cargo of e.cargosPendientes) {
      if (disponible <= 0) break;
      const saldo = redondearMoneda(cargo.saldoPendiente);
      if (saldo <= 0) continue;
      const aplicar = redondearMoneda(Math.min(disponible, saldo));
      if (aplicar <= 0) continue;

      cargosLiquidados.push({
        cargoId:       cargo.id,
        concepto:      cargo.concepto,
        montoAplicado: aplicar,
        saldoRestante: redondearMoneda(saldo - aplicar),
      });
      montoACargos = redondearMoneda(montoACargos + aplicar);
      disponible   = redondearMoneda(disponible - aplicar);
    }
  }

  // ── 2. Remanente → períodos de plan (misma fórmula que preview-pago.util) ──
  let periodos = 0, precioPorPeriodo = 0, nuevaFecha: string | null = null,
      faltante = 0, enPasado = false, sinPrecio = false, montoAPeriodos = 0;

  if (override !== 'solo_cargos') {
    const entradaPreview: EntradaPreview = {
      monto:            disponible,
      precioMensual:    e.precioMensual,
      venceSuscripcion: e.venceSuscripcion,
      diaCorte:         e.diaCorte,
      modalidad:        e.modalidad,
      hoy:              e.hoy,
    };
    const preview = calcularPreviewPago(entradaPreview);
    periodos         = preview.periodos;
    precioPorPeriodo = preview.precioPorPeriodo;
    nuevaFecha       = preview.nuevaFecha;
    faltante         = preview.faltante;
    enPasado         = preview.enPasado;
    sinPrecio        = preview.sinPrecio;

    montoAPeriodos = redondearMoneda(periodos * precioPorPeriodo);
    disponible     = redondearMoneda(disponible - montoAPeriodos);
  }

  // ── 3. Lo que sobra queda como abono ────────────────────────────────────
  return {
    montoTotalImputado,
    cargosLiquidados,
    montoACargos,
    montoAPeriodos,
    periodos,
    precioPorPeriodo,
    nuevaFecha,
    faltante,
    enPasado,
    sinPrecio,
    abonoFinal: disponible,
  };
}
