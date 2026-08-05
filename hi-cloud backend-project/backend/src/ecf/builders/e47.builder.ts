/**
 * E47 — Comprobante para Pagos al Exterior Electrónico
 * Propósito: pagos por servicios de fuente dominicana a no residentes.
 *
 * Diferencias clave vs E46:
 * - SIN TipoIngresos en IdDoc
 * - SIN PaisComprador en Comprador
 * - IndicadorBienoServicio = 2 (Servicio) obligatorio
 * - IndicadorFacturacion  = 4 (Exento ITBIS local)
 * - Retencion SIEMPRE presente en cada ítem (minOccurs=1 en el XSD), con
 *   MontoISRRetenido=0 cuando no hay retención; TotalISRRetencion cuadra
 *   exactamente con la suma de los ítems
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildTotalesE47,
  resolverMoneda,
  round2,
} from './base-ecf.builder';
import { Logger } from '@nestjs/common';
import { truncarNombreItem } from './sections/items.section';

const logger = new Logger('E47Builder');

export function buildE47(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero } = input;
  const cliente = factura.cliente as any;
  const mc      = resolverMoneda(factura);
  const totalME  = Number(factura.total);
  const total    = mc.toDOP(totalME);   // principal en DOP
  const subtotal = mc.toDOP(Number((factura as any).subtotal ?? factura.total));
  const fecha   = fmtFecha(factura.fecha ?? new Date());
  const emisor  = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // Comprador: solo IdentificadorExtranjero + RazonSocialComprador
  const nombreBenef = nombreExtranjero ?? cliente?.nombre ?? 'Beneficiario Exterior';
  const comprador: Record<string, unknown> = {};
  if (cliente?.identificadorExtranjero) {
    comprador['IdentificadorExtranjero'] = cliente.identificadorExtranjero;
  }
  comprador['RazonSocialComprador'] = nombreBenef;

  const detalles = factura.detalles as any[] ?? [];

  // ── PASO 1: construir items con valores ya redondeados ─────────────────────
  const items = detalles.map((d: any, idx: number) => {
    const retencionISR = round2(Number(d.retencionISR ?? 0));
    const item: Record<string, unknown> = {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   4,
      // Retencion SIEMPRE presente (minOccurs=1 en XSD E47), incluso con 0
      Retencion: {
        IndicadorAgenteRetencionoPercepcion: 1,
        MontoISRRetenido: retencionISR,   // 0.00 si no hay retención
      },
      NombreItem:             truncarNombreItem(d.descripcion, encf),
      IndicadorBienoServicio: 2,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(mc.toDOP(Number(d.precioUnitario))),
      MontoItem:              round2(mc.toDOP(Number(d.subtotal))),
    };
    return item;
  });

  // ── PASO 2: sumar retenciones DESDE los items ya construidos (cuadratura exacta)
  let totalISR = 0;
  for (const item of items) {
    const r = item['Retencion'] as any;
    if (r?.MontoISRRetenido) totalISR = round2(totalISR + r.MontoISRRetenido);
  }

  logger.debug(
    `E47 cuadratura retenciones: ` +
    `items=[${items.map(i => ((i['Retencion'] as any)?.MontoISRRetenido ?? 0)).join('+')}] ` +
    `total=${totalISR} | MontoExento=${subtotal} MontoTotal=${total}`,
  );

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:     47,
          encf,
          fechaVencSec,
          tipoPago: 1,
        }),
        Emisor:    emisor,
        Comprador: comprador,
        Totales:   buildTotalesE47(total, subtotal, totalISR),
        ...( mc.otraMonedaExentos(totalME) ? { OtraMoneda: mc.otraMonedaExentos(totalME) } : {} ),
      },
      DetallesItems: { Item: items },
    },
  };
}
