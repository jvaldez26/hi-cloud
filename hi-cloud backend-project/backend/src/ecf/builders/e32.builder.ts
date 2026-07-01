/**
 * E32 — Factura de Consumidor Final Electrónica
 * Comprador: RNC opcional si monto < RD$250,000.
 * Totales calculados DESDE los items (no desde factura.subtotal/iva).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC, COMPRADOR_CONSUMIDOR_FINAL,
  EcfRncRequeridoError,
  resolverMoneda,
  round2,
} from './base-ecf.builder';
import { Logger } from '@nestjs/common';
import { warnCuadraturaDGII } from './sections/items.section';

const logger = new Logger('E32Builder');

function cap4(n: number | string): number { return parseFloat(Number(n).toFixed(4)); }

const MONTO_RNC_OBLIGATORIO = 250_000;

export function buildE32(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;

  const mc         = resolverMoneda(factura);
  const detallesME = factura.detalles as any[] ?? [];

  // PASO 1: calcular montoTotal en DOP primero para validar RNC
  const totalRD = mc.toDOP(Number(factura.total));
  if (totalRD >= MONTO_RNC_OBLIGATORIO && !rnc) {
    throw new EcfRncRequeridoError(32, totalRD);
  }

  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // ── Descuento general: distribuir proporcionalmente sobre MontoItem ────────
  const subtotalBrutoME = detallesME.reduce((s, d) => s + round2(Number(d.subtotal)), 0);
  const descGeneralME   = round2(Number((factura as any).descuentoGeneralMonto ?? 0));
  const baseGravableME  = round2(subtotalBrutoME - descGeneralME);
  const discFactor      = subtotalBrutoME > 0 && descGeneralME > 0
    ? baseGravableME / subtotalBrutoME : 1;

  const adjustedAmounts: number[] = [];
  let runningAdj = 0;
  for (let i = 0; i < detallesME.length; i++) {
    const isLast = i === detallesME.length - 1;
    let adj: number;
    if (descGeneralME === 0) {
      adj = round2(Number(detallesME[i].subtotal));
    } else if (isLast) {
      adj = round2(baseGravableME - runningAdj);
    } else {
      adj = round2(Number(detallesME[i].subtotal) * discFactor);
      runningAdj += adj;
    }
    adjustedAmounts.push(adj);
  }

  // PASO 2: construir items con DOP
  const items = detallesME.map((d: any, idx: number) => {
    const precioME = Number(d.precioUnitario);
    const cantME   = Number(d.cantidad);
    const brutME   = round2(precioME * cantME);
    const adjME    = adjustedAmounts[idx];
    const pct      = parseFloat(String(d.porcentajeIva ?? 18));
    const indFact  = pct >= 18 ? 1 : pct >= 16 ? 2 : 4;
    const pctDesc  = brutME > 0.005 && adjME < brutME - 0.005
      ? round2((1 - adjME / brutME) * 100) : 0;
    if (pctDesc === 0 && Math.abs(adjME - brutME) > 0.01) {
      warnCuadraturaDGII({ ...d, subtotal: adjME }, encf);
    }
    const otME = mc.otraMonedaItem(precioME, adjME);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indFact,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           cap4(cantME),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(mc.toDOP(precioME)),
      ...(pctDesc > 0 ? { DescuentoOTipo: pctDesc } : {}),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              round2(mc.toDOP(adjME)),
    };
  });

  // PASO 3: calcular totales DESDE los items ajustados en RD$
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;

  detallesME.forEach((d: any, idx: number) => {
    const pct   = parseFloat(String(d.porcentajeIva ?? 18));
    const adjME = adjustedAmounts[idx];
    const sub   = round2(mc.toDOP(adjME));
    const iva   = round2(sub * (pct / 100));
    if (pct >= 18)      { montoGravado18 += sub; itbis18 += iva; }
    else if (pct >= 16) { montoGravado16 += sub; itbis16 += iva; }
    else                { montoExento += sub; }
  });

  const montoGravadoTotal = round2(montoGravado18 + montoGravado16);
  const totalITBIS = round2(itbis18 + itbis16);
  const montoTotal = round2(montoGravadoTotal + montoExento + totalITBIS);

  const totales: Record<string, unknown> = {};
  if (montoGravadoTotal > 0) {
    totales['MontoGravadoTotal'] = montoGravadoTotal;
    totales['MontoGravadoI1']    = round2(montoGravado18);
    totales['ITBIS1']            = 18;
    totales['TotalITBIS']        = totalITBIS;
    totales['TotalITBIS1']       = round2(itbis18);
  }
  if (montoGravado16 > 0) {
    totales['MontoGravadoI2'] = round2(montoGravado16);
    totales['ITBIS2']         = 16;
    totales['TotalITBIS2']    = round2(itbis16);
  }
  if (montoExento > 0) totales['MontoExento'] = round2(montoExento);
  totales['MontoTotal'] = montoTotal;

  // PASO 4: OtraMoneda si USD — calcular desde items ajustados
  const totalME  = Number(factura.total);
  const subtotME = round2(adjustedAmounts.reduce((s, a) => s + a, 0));
  const itbisME  = round2(subtotME * 0.18); // simplificado para moneda extranjera
  const otMEEncab = mc.otraMonedaGravados(subtotME, itbisME, totalME);

  const comprador = rnc
    ? buildCompradorRNC(rnc, cliente?.nombre ?? 'Cliente',
        cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined)
    : { ...COMPRADOR_CONSUMIDOR_FINAL };

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   32,
          encf,
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  0,
          tipoIngresos:           '01',
          tipoPago:               1,
        }),
        Emisor:    emisor,
        Comprador: comprador,
        Totales:   totales,
        ...(otMEEncab ? { OtraMoneda: otMEEncab } : {}),
      } as any,
      DetallesItems: { Item: items },
    },
  };
}
