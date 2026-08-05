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
import { warnCuadraturaItem, truncarNombreItem } from './sections/items.section';

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

  // PASO 2: construir items con DOP
  const items = detallesME.map((d: any, idx: number) => {
    const precioME = Number(d.precioUnitario);
    const montoME  = Number(d.subtotal);
    const pct      = parseFloat(String(d.porcentajeIva ?? 18));
    const indFact  = pct === 18 ? 1 : pct === 16 ? 2 : pct === 0 ? 4
      : (() => { throw new Error(`[E32] porcentajeIva inválido: ${pct}. Valores válidos: 0, 16, 18`); })();
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
      NombreItem:             truncarNombreItem(d.descripcion, encf),
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

  // PASO 3: calcular totales DESDE los items en RD$
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;

  detallesME.forEach((d: any) => {
    const pct = parseFloat(String(d.porcentajeIva ?? 18));
    const sub = round2(mc.toDOP(Number(d.subtotal)));
    const iva = round2(mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)));
    if (pct === 18)      { montoGravado18 += sub; itbis18 += iva; }
    else if (pct === 16) { montoGravado16 += sub; itbis16 += iva; }
    else                 { montoExento += sub; }
  });

  const montoGravadoTotal = round2(montoGravado18 + montoGravado16);
  const hayGravado: 0 | 1 = montoGravadoTotal > 0 ? 0 : 0; // siempre 0 en E32
  const totalITBIS = round2(itbis18 + itbis16);
  const montoTotal = round2(montoGravadoTotal + montoExento + totalITBIS);

  // Orden estricto XSD DGII: MontoGravadoXX → MontoExento → ITBISXX → TotalITBISXX → MontoTotal
  const hayI1 = montoGravado18 > 0;
  const hayI2 = montoGravado16 > 0;
  const totales: Record<string, unknown> = {};
  if (hayI1 || hayI2) totales['MontoGravadoTotal'] = montoGravadoTotal;
  if (hayI1)          totales['MontoGravadoI1']    = round2(montoGravado18);
  if (hayI2)          totales['MontoGravadoI2']    = round2(montoGravado16);
  if (montoExento > 0) totales['MontoExento']      = round2(montoExento);
  if (hayI1)          totales['ITBIS1']            = 18;
  if (hayI2)          totales['ITBIS2']            = 16;
  if (hayI1 || hayI2) totales['TotalITBIS']        = totalITBIS;
  if (hayI1)          totales['TotalITBIS1']       = round2(itbis18);
  if (hayI2)          totales['TotalITBIS2']       = round2(itbis16);
  totales['MontoTotal'] = montoTotal;

  // PASO 4: OtraMoneda si USD
  const totalME   = Number(factura.total);
  const subtotME  = Number((factura as any).subtotal ?? factura.total);
  const itbisME   = Number((factura as any).iva ?? 0);
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
