/**
 * E31 — Factura de Crédito Fiscal Electrónica
 * Comprador: RNC obligatorio.
 * Montos principales en RD$; OtraMoneda/OtraMonedaDetalle si moneda extranjera.
 * Totales calculados DESDE los items (no desde factura.subtotal/iva).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  EcfRncRequeridoError,
  resolverMoneda,
  round2,
} from './base-ecf.builder';
import { Logger } from '@nestjs/common';
import { warnCuadraturaDGII } from './sections/items.section';

const logger = new Logger('E31Builder');

function cap4(n: number | string): number { return parseFloat(Number(n).toFixed(4)); }

export function buildE31(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(31, Number(factura.total));

  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const mc         = resolverMoneda(factura);
  const detallesME = factura.detalles as any[] ?? [];

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

  // ── PASO 1: construir items con DOP como principal ─────────────────────────
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

  // ── PASO 2: calcular totales DESDE los items ajustados (en RD$) ───────────
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;

  detallesME.forEach((d: any, idx: number) => {
    const pct   = parseFloat(String(d.porcentajeIva ?? 18));
    const adjME = adjustedAmounts[idx];
    const sub   = round2(mc.toDOP(adjME));
    const iva   = round2(sub * (pct / 100));
    if (pct >= 18) { montoGravado18 += sub; itbis18 += iva; }
    else if (pct >= 16) { montoGravado16 += sub; itbis16 += iva; }
    else { montoExento += sub; }
  });

  const montoGravadoTotal = round2(montoGravado18 + montoGravado16);
  const totalITBIS        = round2(itbis18 + itbis16);
  const montoTotal        = round2(montoGravadoTotal + montoExento + totalITBIS);

  // Totales E31 — MontoExento solo si hay items exentos (prohibido si es 0)
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
  // MontoExento SOLO si hay items exentos (E31 no debe tenerlos normalmente)
  if (montoExento > 0) totales['MontoExento'] = round2(montoExento);

  // Retenciones (E31 agente de retención) — orden correcto DGII: después de TotalITBIS
  const factData = factura as any;
  if (factData?.aplicaRetenciones) {
    const retItbis = round2(Number(factData.montoRetencionItbis ?? 0));
    const retIsr   = round2(Number(factData.montoRetencionIsr   ?? 0));
    if (retItbis > 0) totales['TotalITBISRetenido'] = retItbis;
    if (retIsr   > 0) totales['TotalISRRetencion']  = retIsr;
  }

  totales['MontoTotal'] = montoTotal;

  // ── PASO 3: OtraMoneda calculada DESDE los items en moneda original ──────────
  // Se calcula directamente de detallesME (no de factura.subtotal/iva)
  // para garantizar cuadratura exacta con MontoItemOtraMoneda de cada item.
  let otraMoneda: Record<string, unknown> | undefined;
  if (mc.esME) {
    let montoGrav1ME = 0, itbis1ME = 0, montoExentoME = 0;
    detallesME.forEach((d: any, idx: number) => {
      const pct  = parseFloat(String(d.porcentajeIva ?? 18));
      const adjME = adjustedAmounts[idx];               // monto ajustado (post descuento general)
      const iva  = round2(adjME * (pct / 100));
      if (pct >= 18)      { montoGrav1ME += adjME; itbis1ME += iva; }
      else if (pct >= 16) { /* no común en E31, ignorar por ahora */ }
      else                { montoExentoME += adjME; }
    });
    const montoTotalME = round2(montoGrav1ME + montoExentoME + itbis1ME);
    otraMoneda = {
      TipoMoneda:                    mc.moneda,
      TipoCambio:                    mc.tasa.toFixed(4),
      MontoGravadoTotalOtraMoneda:   round2(montoGrav1ME).toFixed(2),  // suma todos los gravados
      MontoGravado1OtraMoneda:       round2(montoGrav1ME).toFixed(2),  // items tasa 18%
      ...(montoExentoME > 0 ? { MontoExentoOtraMoneda: round2(montoExentoME).toFixed(2) } : {}),
      TotalITBISOtraMoneda:          round2(itbis1ME).toFixed(2),
      TotalITBIS1OtraMoneda:         round2(itbis1ME).toFixed(2),      // era ITBIS1OtraMoneda (incorrecto)
      MontoTotalOtraMoneda:          montoTotalME.toFixed(2),       // siempre al final
    };
  }

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   31,
          encf,
          fechaVencSec,
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  0,
          tipoIngresos:           '01',
          tipoPago:               1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales:   totales,
        ...(otraMoneda ? { OtraMoneda: otraMoneda } : {}),
      } as any,
      DetallesItems: { Item: items },
    },
  };
}
