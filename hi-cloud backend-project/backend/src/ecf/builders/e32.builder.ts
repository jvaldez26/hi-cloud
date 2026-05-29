/**
 * E32 — Factura de Consumidor Final Electrónica
 * Comprador: RNC opcional si monto < RD$250,000; obligatorio si ≥ RD$250,000.
 * FechaVencimientoSecuencia: NO incluir (spec definitiva DGII).
 * IndicadorMontoGravado: 0 si todo exento, 1 si hay monto gravado.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC, COMPRADOR_CONSUMIDOR_FINAL,
  buildTotalesMixtos, tieneMontoGravado,
  buildItems,
  EcfRncRequeridoError,
} from './base-ecf.builder';

const MONTO_RNC_OBLIGATORIO = 250_000;

export function buildE32(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  const total   = Number(factura.total);

  if (total >= MONTO_RNC_OBLIGATORIO && !rnc) {
    throw new EcfRncRequeridoError(32, total);
  }

  const fecha      = fmtFecha(factura.fecha ?? new Date());
  const emisor     = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles   = factura.detalles as any[] ?? [];
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;
  const comprador  = rnc
    ? buildCompradorRNC(rnc, cliente?.nombre ?? 'Cliente',
        cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
      )
    : { ...COMPRADOR_CONSUMIDOR_FINAL };

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   32,
          encf,
          // Sin FechaVencimientoSecuencia (spec definitiva E32)
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  hayGravado,
          tipoIngresos:           '01',
          tipoPago:               1,
        }),
        Emisor:    emisor,
        Comprador: comprador,
        Totales:   buildTotalesMixtos(detalles, total),
      },
      DetallesItems: { Item: buildItems(detalles) },
    },
  };
}
