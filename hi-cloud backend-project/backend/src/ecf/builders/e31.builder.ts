/**
 * E31 — Factura de Crédito Fiscal Electrónica
 * Comprador: RNC obligatorio para sustentar gastos/crédito fiscal.
 * IndicadorMontoGravado: 0 = precios sin ITBIS incluido (estándar HiCloud).
 * TipoPago 1 = contado.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  buildTotalesGravados,
  buildItems,
  EcfRncRequeridoError,
} from './base-ecf.builder';

export function buildE31(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(31, Number(factura.total));

  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles = factura.detalles as any[] ?? [];

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   31,
          encf,
          fechaVencSec,
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  0,   // precios sin ITBIS incluido
          tipoIngresos:           '01',
          tipoPago:               1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: buildTotalesGravados(detalles, Number(factura.total)),
      },
      DetallesItems: { Item: buildItems(detalles) },
    },
  };
}
