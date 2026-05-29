/**
 * E47 — Comprobante para Pagos al Exterior Electrónico
 * Propósito: pagos por servicios de fuente dominicana a no residentes.
 * IndicadorBienoServicio: siempre 2 (Servicio).
 * IndicadorFacturacion: siempre 4 (Exento de ITBIS local).
 * IndicadorMontoGravado: NO aplica en E47.
 * Retención ISR obligatoria en la sección Retencion del item.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorExtranjero,
  buildTotalesExentos,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

export function buildE47(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero, paisExtranjero } = input;
  const total  = Number(factura.total);
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // E47: IndicadorBienoServicio=2 (Servicio), IndicadorFacturacion=4 (Exento)
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   4,
    NombreItem:             d.descripcion,
    IndicadorBienoServicio: 2,   // Servicio — obligatorio en E47
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
          tipo:         47,
          encf,
          fechaVencSec,
          // Sin IndicadorMontoGravado (no aplica en E47)
          tipoIngresos: '01',
          tipoPago:     1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorExtranjero(
          nombreExtranjero ?? (factura.cliente as any)?.nombre ?? 'Beneficiario Exterior',
          paisExtranjero   ?? 'US',
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: items },
    },
  };
}
