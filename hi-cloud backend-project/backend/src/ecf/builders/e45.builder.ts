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
  buildItems,
  EcfRncRequeridoError,
} from './base-ecf.builder';

export function buildE45(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(45, Number(factura.total));

  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles    = factura.detalles as any[] ?? [];
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;

  const compradorExtras: Record<string, unknown> = {};
  if (cliente?.direccion)        compradorExtras['DireccionComprador'] = cliente.direccion;
  if (cliente?.numeroOrdenCompra) compradorExtras['NumeroOrdenCompra'] = cliente.numeroOrdenCompra;

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
        Totales:   buildTotalesGravados(detalles, Number(factura.total)),
      },
      DetallesItems: { Item: buildItems(detalles) },
    },
  };
}
