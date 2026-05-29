/**
 * E34 — Nota de Crédito Electrónica
 * InformacionReferencia obligatoria.
 * FechaVencimientoSecuencia: NO incluir (spec definitiva DGII).
 * IndicadorNotaCredito: '0' obligatorio.
 * IndicadorMontoGravado: 0 si todo exento, 1 si hay monto gravado.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha, addDias,
  buildCompradorRNC,
  buildTotalesExentos, tieneMontoGravado,
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
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;
  const fechaLimite = addDias(factura.fecha ?? new Date(), 30);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   34,
          encf,
          fechaVencSec,
          indicadorNotaCredito:   '0',
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  hayGravado,
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
