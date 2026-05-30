/**
 * E32 — Factura de Consumidor Final Electrónica
 * Comprador: RNC opcional si monto < RD$250,000.
 * Montos principales siempre en RD$; OtraMoneda si moneda extranjera.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC, COMPRADOR_CONSUMIDOR_FINAL,
  buildTotalesMixtos, tieneMontoGravado,
  EcfRncRequeridoError,
  resolverMoneda,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

const MONTO_RNC_OBLIGATORIO = 250_000;

export function buildE32(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;

  const mc         = resolverMoneda(factura);
  const detallesME = factura.detalles as any[] ?? [];
  const totalRD    = mc.toDOP(Number(factura.total));
  const totalME    = Number(factura.total);

  if (totalRD >= MONTO_RNC_OBLIGATORIO && !rnc) {
    throw new EcfRncRequeridoError(32, totalRD);
  }

  const fecha      = fmtFecha(factura.fecha ?? new Date());
  const emisor     = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detallesRD = detallesME.map(d => ({
    ...d,
    subtotal:   mc.toDOP(Number(d.subtotal)),
    importeIva: mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)),
    iva:        mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)),
  }));
  const hayGravado: 0 | 1 = tieneMontoGravado(detallesME) ? 1 : 0;

  const comprador = rnc
    ? buildCompradorRNC(rnc, cliente?.nombre ?? 'Cliente',
        cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
      )
    : { ...COMPRADOR_CONSUMIDOR_FINAL };

  const items = detallesME.map((d: any, idx: number) => {
    const precioME = Number(d.precioUnitario);
    const montoME  = Number(d.subtotal);
    const otME     = mc.otraMonedaItem(precioME, montoME);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   d.porcentajeIva === 18 ? 1 : d.porcentajeIva === 16 ? 2 : 4,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(mc.toDOP(precioME)),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              round2(mc.toDOP(montoME)),
    };
  });

  const encabezado: Record<string, unknown> = {
    Version: '1.0',
    IdDoc: buildIdDoc({
      tipo:                   32,
      encf,
      indicadorEnvioDiferido: 1,
      indicadorMontoGravado:  hayGravado ? 0 : (0 as 0 | 1),
      tipoIngresos:           '01',
      tipoPago:               1,
    }),
    Emisor:    emisor,
    Comprador: comprador,
    Totales:   buildTotalesMixtos(detallesRD, totalRD),
  };

  const otME = mc.otraMonedaGravados(
    Number((factura as any).subtotal ?? factura.total),
    Number((factura as any).iva ?? 0),
    totalME,
  );
  if (otME) encabezado['OtraMoneda'] = otME;

  return {
    ECF: { Encabezado: encabezado as any, DetallesItems: { Item: items } },
  };
}
