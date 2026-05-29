/**
 * E33 — Nota de Débito Electrónica
 * Propósito: recuperar costos/gastos posteriores (mora, fletes, etc.).
 * InformacionReferencia obligatoria: NCFModificado, FechaNCFModificado, CodigoModificacion.
 * FechaVencimientoSecuencia: obligatoria en E33.
 * IndicadorMontoGravado: 0 (precios sin ITBIS incluido).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  buildTotalesExentos,
  buildItemsE33,
} from './base-ecf.builder';

export function buildE33(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, infoReferencia } = input;
  if (!infoReferencia) {
    throw new Error('E33 requiere infoReferencia con NCFModificado y FechaNCFModificado');
  }

  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc ?? '00000000000';
  const total   = Number(factura.total);
  const fecha   = fmtFecha(factura.fecha ?? new Date());
  const emisor  = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles = factura.detalles as any[] ?? [];

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  33,
          encf,
          fechaVencSec,
          // Sin IndicadorEnvioDiferido
          indicadorMontoGravado: 0,
          tipoIngresos:          '01',
          tipoPago:              1,
          tablaFormasPago:       { FormaDePago: [{ FormaPago: 1, MontoPago: total.toFixed(2) }] },
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItemsE33(detalles) },
      InformacionReferencia: {
        NCFModificado:      infoReferencia.NCFModificado,
        FechaNCFModificado: infoReferencia.FechaNCFModificado,
        CodigoModificacion: String(infoReferencia.CodigoModificacion ?? '3'),
      },
    },
  };
}
