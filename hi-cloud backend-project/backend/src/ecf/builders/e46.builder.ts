/**
 * E46 — Comprobante para Exportaciones Electrónico
 * Propósito: reportar ventas de bienes fuera del territorio nacional.
 * IndicadorFacturacion: obligatoriamente 3 (ITBIS Tasa Cero) en todos los ítems.
 * IndicadorMontoGravado: NO aplica en E46.
 * Comprador: identificado por nombre y país (no requiere RNC).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorExtranjero,
  buildTotalesExentos,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

export function buildE46(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero, paisExtranjero } = input;
  const total  = Number(factura.total);
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // Exportaciones: IndicadorFacturacion = 3 (ITBIS Tasa Cero) obligatorio
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   3,
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
          tipo:         46,
          encf,
          fechaVencSec,
          // Sin IndicadorMontoGravado (no aplica en E46)
          tipoIngresos: '01',
          tipoPago:     1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorExtranjero(
          nombreExtranjero ?? (factura.cliente as any)?.nombre ?? 'Cliente Extranjero',
          paisExtranjero   ?? 'US',
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: items },
    },
  };
}
