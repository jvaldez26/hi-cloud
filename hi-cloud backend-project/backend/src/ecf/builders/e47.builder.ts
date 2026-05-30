/**
 * E47 — Comprobante para Pagos al Exterior Electrónico
 * Propósito: pagos por servicios de fuente dominicana a no residentes.
 *
 * Diferencias clave vs E46:
 * - SIN TipoIngresos en IdDoc (no corresponde a E47)
 * - SIN PaisComprador en Comprador (no existe en XSD E47)
 * - IndicadorBienoServicio = 2 (Servicio) obligatorio
 * - IndicadorFacturacion  = 4 (Exento ITBIS local) obligatorio
 * - Retencion OBLIGATORIA en cada Item (antes de NombreItem), mínimo 0
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildTotalesExentos,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

export function buildE47(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero } = input;
  const cliente = factura.cliente as any;
  const total   = Number(factura.total);
  const fecha   = fmtFecha(factura.fecha ?? new Date());
  const emisor  = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // Comprador E47: IdentificadorExtranjero + RazonSocialComprador
  // SIN PaisComprador (no existe en XSD E47)
  const nombreBenef = nombreExtranjero ?? cliente?.nombre ?? 'Beneficiario Exterior';
  const comprador: Record<string, unknown> = {};
  if (cliente?.rncReceptor) {
    comprador['RNCComprador'] = cliente.rncReceptor;
  } else if (cliente?.identificadorExtranjero) {
    comprador['IdentificadorExtranjero'] = cliente.identificadorExtranjero;
  }
  comprador['RazonSocialComprador'] = nombreBenef;
  // Nota: PaisComprador NO se incluye en E47 (solo en E46)

  // Items: orden estricto XSD — Retencion ANTES de NombreItem
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => {
    const retencionISR = round2(Number(d.retencionISR ?? 0));
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   4,            // siempre Exento (ITBIS local no aplica)
      // Retencion OBLIGATORIA antes de NombreItem
      Retencion: {
        RetencionISR: retencionISR,         // monto ISR retenido (0 si no aplica)
      },
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 2,            // siempre Servicio
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
      MontoItem:              round2(Number(d.subtotal)),
    };
  });

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:         47,
          encf,
          fechaVencSec,
          // SIN TipoIngresos (no corresponde a E47)
          // SIN IndicadorMontoGravado (no aplica en E47)
          tipoPago:     1,
        }),
        Emisor:    emisor,
        Comprador: comprador,
        Totales:   buildTotalesExentos(total),
      },
      DetallesItems: { Item: items },
    },
  };
}
