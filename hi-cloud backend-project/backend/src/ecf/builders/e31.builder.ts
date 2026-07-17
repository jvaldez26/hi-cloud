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
import { warnCuadraturaItem } from './sections/items.section';

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

  // ── PASO 1: construir items con DOP como principal ─────────────────────────
  const items = detallesME.map((d: any, idx: number) => {
    const precioME = Number(d.precioUnitario);
    const montoME  = Number(d.subtotal);
    const pct      = parseFloat(String(d.porcentajeIva ?? 18));
    const indFact  = pct >= 18 ? 1 : pct >= 16 ? 2 : 4;
    const otME     = mc.otraMonedaItem(precioME, montoME);

    const cantidad     = cap4(d.cantidad);
    const precioDOP    = round2(mc.toDOP(precioME));
    const montoItemDOP = round2(mc.toDOP(montoME));
    // Descuento = precio×cant − monto, con el PrecioUnitarioItem YA redondeado
    // (lo que DGII multiplica) → cuadratura exacta con MontoItem.
    const descuentoDOP = round2(precioDOP * cantidad - montoItemDOP);

    const item = {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indFact,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           cantidad,
      UnidadMedida:           43,
      PrecioUnitarioItem:     precioDOP,
      // DescuentoMonto SOLO en DOP (sin OtraMonedaDetalle). En moneda extranjera
      // el orden XSD relativo a OtraMonedaDetalle y un posible DescuentoOtraMoneda
      // están sin confirmar. TODO(ME): habilitar tras validar el XSD oficial. Hoy
      // el path ME sale como antes (sin DescuentoMonto), no peor.
      ...(descuentoDOP > 0 && !otME ? { DescuentoMonto: descuentoDOP } : {}),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              montoItemDOP,
    };
    warnCuadraturaItem(item, encf);
    return item;
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
