/**
 * E43 — Comprobante para Gastos Menores Electrónico
 * Propósito: sustentar pagos del personal (peajes, pasajes, parqueos).
 * IndicadorFacturacion: siempre 4 (Exento).
 * ITBIS: no utilizable como adelanto de ITBIS.
 * Comprador: dato fijo "GASTOS MENORES" requerido por DGII.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  COMPRADOR_GASTOS_MENORES,
  buildTotalesExentos,
  buildItems,
} from './base-ecf.builder';

export function buildE43(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const total  = Number(factura.total);
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  43,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,   // siempre exento
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: { ...COMPRADOR_GASTOS_MENORES },
        Totales:   buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItems(factura.detalles as any[] ?? []) },
    },
  };
}
