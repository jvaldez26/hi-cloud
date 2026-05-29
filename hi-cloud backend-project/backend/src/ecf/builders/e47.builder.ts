/**
 * E47 — Comprobante para Pagos al Exterior Electrónico
 * Propósito: pagos por servicios de fuente dominicana a no residentes.
 * IndicadorBienoServicio: siempre 2 (Servicio).
 * IndicadorFacturacion: siempre 4 (Exento de ITBIS local).
 * Sin TipoIngresos (no aplica en E47).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorExtranjero,
  buildTotalesExentos,
  buildItems,
} from './base-ecf.builder';

export function buildE47(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero, paisExtranjero } = input;
  const total  = Number(factura.total);
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  47,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,
          // Sin TipoIngresos en E47
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorExtranjero(
          nombreExtranjero ?? (factura.cliente as any)?.nombre ?? 'Beneficiario Exterior',
          paisExtranjero   ?? 'US',
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItems(factura.detalles as any[] ?? []) },
    },
  };
}
