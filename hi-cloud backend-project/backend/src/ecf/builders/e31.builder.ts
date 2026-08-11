/**
 * E31 — Factura de Crédito Fiscal Electrónica
 * Comprador: RNC obligatorio.
 * Montos principales en RD$; OtraMoneda/OtraMonedaDetalle si moneda extranjera.
 * Totales calculados DESDE los items (no desde factura.subtotal/iva).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha, addDias,
  buildCompradorRNC,
  EcfRncRequeridoError,
  resolverMoneda,
  round2,
} from './base-ecf.builder';
import { Logger } from '@nestjs/common';
import { buildItems } from './sections/items.section';

const logger = new Logger('E31Builder');

export function buildE31(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  // Fallback: el use-case merges datosComprador → cliente, pero si llegara sin merge,
  // rncComprador en la factura es el último recurso (guardado al crear desde POS).
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc ?? (factura as any).rncComprador;
  if (!rnc) throw new EcfRncRequeridoError(31, Number(factura.total));

  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const mc         = resolverMoneda(factura);
  const detallesME = factura.detalles as any[] ?? [];

  // ── PASO 1: construir items con DOP como principal ─────────────────────────
  // buildItems gestiona la estrategia de precio (cap4 sin descuento, round2 con
  // descuento real) y emite DescuentoMonto+TablaSubDescuento cuando d.descuentoMonto>0.
  const items = buildItems(detallesME, encf, {
    toDOP:          (v) => mc.toDOP(v),
    otraMonedaItem: (p, m) => mc.otraMonedaItem(p, m) ?? undefined,
  });

  // ── PASO 2: calcular totales DESDE los items (en RD$) ─────────────────────
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;

  detallesME.forEach((d: any) => {
    const pct    = parseFloat(String(d.porcentajeIva ?? 18));
    const sub    = round2(mc.toDOP(Number(d.subtotal)));
    const ivaRaw = Number(d.importeIva ?? d.iva ?? 0);
    const iva    = round2(mc.toDOP(ivaRaw));
    if (pct >= 18) { montoGravado18 += sub; itbis18 += iva; }
    else if (pct >= 16) { montoGravado16 += sub; itbis16 += iva; }
    else { montoExento += sub; }
  });

  const montoGravadoTotal = round2(montoGravado18 + montoGravado16);
  const totalITBIS        = round2(itbis18 + itbis16);
  const montoTotal        = round2(montoGravadoTotal + montoExento + totalITBIS);

  // Totales E31 — ORDEN ESTRICTO XSD DGII (el orden de inserción = orden XML en MSeller):
  //   MontoGravado* → MontoExento → ITBIS* → TotalITBIS* → MontoTotal → Retenciones
  // MontoExento va ANTES de cualquier ITBIS; antes se insertaba después del bloque
  // ITBIS y DGII lo rechazaba ("invalid child element 'MontoExento'"). Solo si hay
  // items exentos (prohibido si es 0).
  const totales: Record<string, unknown> = {};
  // 1. Montos gravados
  if (montoGravadoTotal > 0) {
    totales['MontoGravadoTotal'] = montoGravadoTotal;
    totales['MontoGravadoI1']    = round2(montoGravado18);
  }
  if (montoGravado16 > 0) totales['MontoGravadoI2'] = round2(montoGravado16);
  // 2. Exento — ANTES de cualquier ITBIS
  if (montoExento > 0) totales['MontoExento'] = round2(montoExento);
  // 3. Tasas primero (ITBIS1, ITBIS2), luego montos (TotalITBIS, TotalITBIS1, TotalITBIS2).
  //    Mezclarlos (ITBIS1 → TotalITBIS1 → ITBIS2 → TotalITBIS2) hace que DGII rechace
  //    con "invalid child element 'ITBIS2'" porque espera 'TotalITBIS2' en esa posición.
  if (montoGravado18 > 0)    totales['ITBIS1']      = 18;
  if (montoGravado16 > 0)    totales['ITBIS2']      = 16;
  if (montoGravadoTotal > 0) totales['TotalITBIS']  = totalITBIS;
  if (montoGravado18 > 0)    totales['TotalITBIS1'] = round2(itbis18);
  if (montoGravado16 > 0)    totales['TotalITBIS2'] = round2(itbis16);
  // 4. Total
  totales['MontoTotal'] = montoTotal;
  // 5. Retenciones (E31 agente de retención) — DESPUÉS de MontoTotal (orden XSD)
  const factData = factura as any;
  if (factData?.aplicaRetenciones) {
    const retItbis = round2(Number(factData.montoRetencionItbis ?? 0));
    const retIsr   = round2(Number(factData.montoRetencionIsr   ?? 0));
    if (retItbis > 0) totales['TotalITBISRetenido'] = retItbis;
    if (retIsr   > 0) totales['TotalISRRetencion']  = retIsr;
  }

  // ── PASO 3: OtraMoneda calculada DESDE los items en moneda original ──────────
  // Se calcula directamente de detallesME (no de factura.subtotal/iva)
  // para garantizar cuadratura exacta con MontoItemOtraMoneda de cada item.
  let otraMoneda: Record<string, unknown> | undefined;
  if (mc.esME) {
    let montoGrav1ME = 0, itbis1ME = 0, montoExentoME = 0;
    detallesME.forEach((d: any) => {
      const pct = parseFloat(String(d.porcentajeIva ?? 18));
      const sub = round2(Number(d.subtotal));           // subtotal en USD (original)
      const iva = round2(Number(d.importeIva ?? d.iva ?? 0)); // ITBIS en USD
      if (pct >= 18)      { montoGrav1ME += sub; itbis1ME += iva; }
      else if (pct >= 16) { /* no común en E31, ignorar por ahora */ }
      else                { montoExentoME += sub; }
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

  // ── TipoPago: derivado de factura.tipoPago (CONTADO=1, CREDITO=2) ─────────
  // Antes estaba hardcoded a 1; las facturas a crédito se declaraban incorrectamente
  // a DGII como "Contado". XSD E31 confirma que TipoPago=2 es válido. §IdDoc.
  const tipoPagoECF        = factura.tipoPago === 'CREDITO' ? 2 : 1;
  const fechaLimitePagoECF = tipoPagoECF === 2
    ? (factura.fechaVencimiento
        ? fmtFecha(factura.fechaVencimiento)
        : addDias(factura.fecha ?? new Date(), factura.diasCredito || 30))
    : undefined;

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
          tipoPago:               tipoPagoECF,
          fechaLimitePago:        fechaLimitePagoECF,
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
