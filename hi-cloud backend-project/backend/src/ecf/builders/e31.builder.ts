/**
 * E31 — Factura de Crédito Fiscal Electrónica
 * Comprador: RNC obligatorio.
 * Montos principales siempre en RD$ (DOP); si moneda extranjera →
 * agregar OtraMoneda/OtraMonedaDetalle según normativa DGII.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  buildTotalesGravados,
  EcfRncRequeridoError,
  resolverMoneda,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

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

  // Montos principales en RD$ (convertidos si moneda extranjera)
  const totalRD    = mc.toDOP(Number(factura.total));
  const subtotalME = Number((factura as any).subtotal ?? factura.total);
  const itbisME    = Number((factura as any).iva ?? 0);
  const totalME    = Number(factura.total);

  // Detalles: convertir precios a DOP, mantener valores ME para OtraMonedaDetalle
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
      ...(otME ? { OtraMonedaDetalle: otME } : {}),  // ANTES de MontoItem
      MontoItem:              round2(mc.toDOP(montoME)),  // SIEMPRE AL FINAL
    };
  });

  const encabezado: Record<string, unknown> = {
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
    Totales: buildTotalesGravados(detallesME.map(d => ({
      ...d,
      subtotal:   mc.toDOP(Number(d.subtotal)),
      importeIva: mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)),
      iva:        mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)),
      porcentajeIva: Number(d.porcentajeIva ?? 18),
    })), totalRD),
  };

  const otME = mc.otraMonedaGravados(subtotalME, itbisME, totalME);
  if (otME) encabezado['OtraMoneda'] = otME;

  return {
    ECF: {
      Encabezado: encabezado as any,
      DetallesItems: { Item: items },
    },
  };
}
