/**
 * E34 — Nota de Crédito Electrónica
 * InformacionReferencia obligatoria.
 * FechaVencimientoSecuencia: NO incluir (doc de modificación — no tiene secuencia propia).
 * IndicadorNotaCredito: '0' obligatorio.
 * IndicadorMontoGravado: NO aplica en E34 (documento de modificación).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha, addDias,
  buildCompradorRNC,
  buildTotalesExentos,
  buildItems,
} from './base-ecf.builder';

export function buildE34(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, infoReferencia } = input;
  if (!infoReferencia) {
    throw new Error('E34 requiere infoReferencia con NCFModificado y CodigoModificacion ("1"–"5")');
  }

  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc ?? '00000000000';
  const total   = Number(factura.total);
  const fecha   = fmtFecha(factura.fecha ?? new Date());
  const emisor  = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles    = factura.detalles as any[] ?? [];
  const fechaLimite = addDias(factura.fecha ?? new Date(), 30);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   34,
          encf,
          // Sin FechaVencimientoSecuencia (E34 es doc de modificación)
          indicadorNotaCredito:   '0',
          indicadorEnvioDiferido: 1,
          // Sin IndicadorMontoGravado (no aplica en E34)
          tipoIngresos:           '01',
          tipoPago:               2,
          fechaLimitePago:        fechaLimite,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItems(detalles) },
      InformacionReferencia: {
        NCFModificado:      infoReferencia.NCFModificado,
        FechaNCFModificado: infoReferencia.FechaNCFModificado,
        CodigoModificacion: String(infoReferencia.CodigoModificacion),
      },
    },
  };
}
