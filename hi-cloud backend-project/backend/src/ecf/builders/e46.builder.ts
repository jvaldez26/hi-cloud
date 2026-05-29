/**
 * E46 — Comprobante para Exportaciones Electrónico
 * Propósito: reportar ventas de bienes fuera del territorio nacional.
 * IndicadorFacturacion: obligatoriamente 3 (ITBIS Tasa Cero) en todos los ítems.
 * Comprador: identificado por nombre y país (no requiere RNC).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorExtranjero,
  buildTotalesExentos,
  buildItems,
} from './base-ecf.builder';

export function buildE46(input: ECFBuildInput): MSellerPayload {
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
          tipo:                  46,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,
          tipoIngresos:          '01',
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorExtranjero(
          nombreExtranjero ?? (factura.cliente as any)?.nombre ?? 'Cliente Extranjero',
          paisExtranjero   ?? 'US',
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItems(factura.detalles as any[] ?? []) },
    },
  };
}
