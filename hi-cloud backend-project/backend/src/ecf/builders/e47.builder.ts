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
  buildTotalesE47,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

export function buildE47(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero } = input;
  const cliente = factura.cliente as any;
  const total   = Number(factura.total);
  const fecha   = fmtFecha(factura.fecha ?? new Date());
  const emisor  = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // Comprador E47: solo IdentificadorExtranjero + RazonSocialComprador
  // RNCComprador NO existe en XSD E47 (si receptor tiene RNC local → usar E31)
  // PaisComprador NO existe en XSD E47 (va en Transporte/PaisDestino si aplica)
  const nombreBenef = nombreExtranjero ?? cliente?.nombre ?? 'Beneficiario Exterior';
  const comprador: Record<string, unknown> = {};
  if (cliente?.identificadorExtranjero) {
    comprador['IdentificadorExtranjero'] = cliente.identificadorExtranjero;
  }
  comprador['RazonSocialComprador'] = nombreBenef;

  // Calcular TotalISRRetencion = suma de todas las retenciones de los ítems
  const detalles = factura.detalles as any[] ?? [];
  const totalISR = round2(detalles.reduce((s, d) => s + Number(d.retencionISR ?? 0), 0));
  const subtotal = Number((factura as any).subtotal ?? factura.total);

  const items = detalles.map((d: any, idx: number) => {
    const retencionISR = round2(Number(d.retencionISR ?? 0));
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   4,            // siempre Exento (ITBIS local no aplica)
      // Retencion OBLIGATORIA antes de NombreItem — orden estricto XSD DGII
      Retencion: {
        IndicadorAgenteRetencionoPercepcion: 1,   // 1 = Retención (siempre para E47)
        MontoISRRetenido: retencionISR,            // monto ISR retenido (0 si no aplica)
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
        Totales:   buildTotalesE47(total, subtotal, totalISR),
      },
      DetallesItems: { Item: items },
    },
  };
}
