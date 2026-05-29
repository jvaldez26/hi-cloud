/**
 * E43 — Comprobante para Gastos Menores Electrónico
 * Propósito: sustentar pagos del personal (peajes, pasajes, parqueos).
 * IndicadorFacturacion: siempre 4 (Exento) en todos los ítems.
 * IndicadorMontoGravado: NO aplica en E43.
 * ITBIS: no utilizable como adelanto de ITBIS.
 * Comprador: dato fijo "GASTOS MENORES" requerido por DGII.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  COMPRADOR_GASTOS_MENORES,
  buildTotalesExentos,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

export function buildE43(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const total  = Number(factura.total);
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // Todos los ítems son exentos en E43 (IndicadorFacturacion = 4)
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   4,
    NombreItem:             d.descripcion,
    IndicadorBienoServicio: 1,
    CantidadItem:           Number(d.cantidad),
    UnidadMedida:           43,
    PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
    MontoItem:              round2(Number(d.subtotal)),
  }));

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:         43,
          encf,
          fechaVencSec,
          // Sin IndicadorMontoGravado (no aplica en E43)
          tipoIngresos: '01',
          tipoPago:     1,
        }),
        Emisor:    emisor,
        Comprador: { ...COMPRADOR_GASTOS_MENORES },
        Totales:   buildTotalesExentos(total),
      },
      DetallesItems: { Item: items },
    },
  };
}
