/**
 * E33 — Nota de Débito Electrónica
 * Propósito: recuperar costos/gastos posteriores (mora, fletes, etc.).
 * InformacionReferencia obligatoria (orden XSD estricto):
 *   NCFModificado → FechaNCFModificado → CodigoModificacion
 * FechaVencimientoSecuencia: obligatoria en E33.
 * Totales: dinámicos (con ITBIS si aplica), no siempre exentos.
 * CodigoModificacion válidos para E33: 3=Ajuste montos (habitual).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  buildTotalesGravados,
  buildItemsE33,
} from './base-ecf.builder';

const CODIGOS_MODIFICACION_E33: Record<string, string> = {
  '3': 'Ajuste de montos (cargo adicional)',
  '4': 'Reemplazo por contingencia',
};

export function buildE33(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, infoReferencia } = input;

  if (!infoReferencia?.NCFModificado) {
    throw new Error('E33 requiere infoReferencia.NCFModificado (eNCF de la factura original)');
  }

  const codigoMod = String(infoReferencia.CodigoModificacion ?? '3');
  if (!CODIGOS_MODIFICACION_E33[codigoMod]) {
    throw new Error(
      `CodigoModificacion "${codigoMod}" inválido para E33. ` +
      `Válidos: ${Object.entries(CODIGOS_MODIFICACION_E33).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    );
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
          tipo:            33,
          encf,
          fechaVencSec,
          // Sin IndicadorEnvioDiferido ni IndicadorMontoGravado en E33
          tipoIngresos:    '01',
          tipoPago:        1,
          tablaFormasPago: { FormaDePago: [{ FormaPago: 1, MontoPago: total.toFixed(2) }] },
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        // Totales dinámicos: incluye ITBIS si los ítems lo tienen
        Totales: buildTotalesGravados(detalles, total),
      },
      DetallesItems: { Item: buildItemsE33(detalles) },
      // InformacionReferencia: orden estricto XSD DGII
      InformacionReferencia: {
        NCFModificado:      infoReferencia.NCFModificado,
        FechaNCFModificado: infoReferencia.FechaNCFModificado,
        CodigoModificacion: codigoMod,
      },
    },
  };
}
