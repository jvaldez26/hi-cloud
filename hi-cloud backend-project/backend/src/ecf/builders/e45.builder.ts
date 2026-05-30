/**
 * E45 — Comprobante Gubernamental Electrónico
 * Propósito: venta de bienes/servicios a instituciones del Estado.
 * Comprador: RNC de la institución pública obligatorio.
 * IndicadorMontoGravado: condicional (0 si exento, 1 si hay gravado).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  buildTotalesGravados, tieneMontoGravado,
  EcfRncRequeridoError,
  resolverMoneda,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

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
  const hayGravado: 0 | 1 = tieneMontoGravado(detallesME) ? 1 : 0;
  const detallesRD = detallesME.map(d => ({
    ...d,
    subtotal:   mc.toDOP(Number(d.subtotal)),
    importeIva: mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)),
    iva:        mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)),
  }));

  const compradorExtras: Record<string, unknown> = {};
  if (cliente?.direccion)         compradorExtras['DireccionComprador'] = cliente.direccion;
  if (cliente?.numeroOrdenCompra) compradorExtras['NumeroOrdenCompra']  = cliente.numeroOrdenCompra;

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
      tipo:                  45,
      encf,
      fechaVencSec,
      indicadorMontoGravado: hayGravado,
      tipoIngresos:          '01',
      tipoPago:              1,
    }),
    Emisor:    emisor,
    Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Entidad Gubernamental', compradorExtras),
    Totales:   buildTotalesGravados(detallesRD, mc.toDOP(totalME)),
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
