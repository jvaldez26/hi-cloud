/**
 * E45 — Comprobante Gubernamental Electrónico
 * Propósito: venta de bienes/servicios a instituciones del Estado.
 * Comprador: RNC de la institución pública obligatorio.
 * Totales calculados DESDE los items — MontoExento omitido si es 0.
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
import { truncarNombreItem } from './sections/items.section';

const logger = new Logger('E45Builder');

export function buildE45(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(45, Number(factura.total));

  const mc       = resolverMoneda(factura);
  const totalME  = Number(factura.total);
  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detallesME = factura.detalles as any[] ?? [];

  const compradorExtras: Record<string, unknown> = {};
  if (cliente?.direccion)         compradorExtras['DireccionComprador'] = cliente.direccion;
  if (cliente?.numeroOrdenCompra) compradorExtras['NumeroOrdenCompra']  = cliente.numeroOrdenCompra;

  // PASO 1: construir items con DOP
  const items = detallesME.map((d: any, idx: number) => {
    const precioME = Number(d.precioUnitario);
    const montoME  = Number(d.subtotal);
    const pct      = parseFloat(String(d.porcentajeIva ?? 18));
    const indFact  = pct >= 18 ? 1 : pct >= 16 ? 2 : 4;
    const otME     = mc.otraMonedaItem(precioME, montoME);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indFact,
      NombreItem:             truncarNombreItem(d.descripcion, encf),
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(mc.toDOP(precioME)),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              round2(mc.toDOP(montoME)),
    };
  });

  // PASO 2: calcular totales DESDE los items (en RD$)
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;

  detallesME.forEach((d: any) => {
    const pct = parseFloat(String(d.porcentajeIva ?? 18));
    const sub = round2(mc.toDOP(Number(d.subtotal)));
    const iva = round2(mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)));
    if (pct >= 18)      { montoGravado18 += sub; itbis18 += iva; }
    else if (pct >= 16) { montoGravado16 += sub; itbis16 += iva; }
    else                { montoExento += sub; }
  });

  const montoGravadoTotal = round2(montoGravado18 + montoGravado16);
  const totalITBIS        = round2(itbis18 + itbis16);
  const montoTotal        = round2(montoGravadoTotal + montoExento + totalITBIS);
  const hayGravado: 0 | 1 = montoGravadoTotal > 0 ? 1 : 0;

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
  if (montoExento > 0) totales['MontoExento'] = round2(montoExento);  // OMITIR si es 0
  totales['MontoTotal'] = montoTotal;

  logger.debug(`[E45] Totales: ${JSON.stringify(totales)}`);

  // PASO 3: OtraMoneda si USD
  const subtotalME = Number((factura as any).subtotal ?? factura.total);
  const itbisME    = Number((factura as any).iva ?? 0);
  const otMEEncab  = mc.otraMonedaGravados(subtotalME, itbisME, totalME);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  45,
          encf,
          fechaVencSec,
          indicadorMontoGravado: hayGravado,
          tipoIngresos:          '01',
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Entidad Gubernamental', compradorExtras),
        Totales:   totales,
        ...(otMEEncab ? { OtraMoneda: otMEEncab } : {}),
      } as any,
      DetallesItems: { Item: items },
    },
  };
}
