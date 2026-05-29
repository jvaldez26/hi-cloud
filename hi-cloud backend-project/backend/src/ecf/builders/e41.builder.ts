/**
 * E41 — Comprobante de Compras Electrónico
 * Propósito: emitido por el comprador para sustentar adquisición a personas
 * no registradas ante la DGII (proveedores informales).
 * IndicadorMontoGravado: 0 — el vendedor informal no transparenta ITBIS.
 * Sin TipoIngresos (no aplica en E41).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha, addDias,
  buildCompradorRNC,
  buildTotalesGravados, tieneMontoGravado,
  buildItems,
  EcfRncRequeridoError,
} from './base-ecf.builder';

export function buildE41(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const proveedor = factura.cliente as any;
  const rnc       = proveedor?.rncReceptor ?? proveedor?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(41, Number(factura.total));

  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles    = factura.detalles as any[] ?? [];
  const total       = Number(factura.total);
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;
  const fechaLimite = addDias(factura.fecha ?? new Date(), 30);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  41,
          encf,
          fechaVencSec,
          indicadorMontoGravado: hayGravado,
          tipoIngresos:          '01',
          tipoPago:              2,
          fechaLimitePago:       fechaLimite,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, proveedor?.nombre ?? 'Proveedor',
          proveedor?.direccion ? { DireccionComprador: proveedor.direccion } : undefined,
        ),
        Totales: buildTotalesGravados(detalles, total),
      },
      DetallesItems: { Item: buildItems(detalles) },
    },
  };
}
