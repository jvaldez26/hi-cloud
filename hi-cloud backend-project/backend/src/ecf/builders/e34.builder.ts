/**
 * E34 — Nota de Crédito Electrónica
 * InformacionReferencia obligatoria (orden XSD estricto):
 *   NCFModificado → FechaNCFModificado → CodigoModificacion → RazonModificacion(opt)
 * FechaVencimientoSecuencia: NO incluir (doc de modificación).
 * IndicadorNotaCredito: calculado según días desde factura original (≤30d=0, >30d=1).
 * IndicadorMontoGravado: incluir SOLO si hay ítems con ITBIS.
 * CodigoModificacion=2 (texto): todos los montos = 0.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, addDias,
  buildCompradorRNC,
  buildTotalesGravados, buildTotalesCero, tieneMontoGravado,
  buildItems,
  EcfRncRequeridoError,
} from './base-ecf.builder';
import { fmtFecha } from './sections/id-doc.section';

const CODIGOS_MODIFICACION_E34: Record<string, string> = {
  '1': 'Anulación total',
  '2': 'Corrección de texto (montos = 0)',
  '3': 'Ajuste de montos/devolución',
  '4': 'Reemplazo por contingencia',
  '5': 'Referencia a Factura de Consumo E32',
};

/** Calcula IndicadorNotaCredito: '0' = dentro de 30 días, '1' = después de 30 días. */
function calcIndicadorNC(fechaNcfModificado: string): '0' | '1' {
  try {
    const parts = fechaNcfModificado.split('-');
    if (parts.length !== 3) return '0';
    const [dd, mm, yyyy] = parts.map(Number);
    const fechaOrig = new Date(yyyy, mm - 1, dd);
    const dias = Math.floor((Date.now() - fechaOrig.getTime()) / 86_400_000);
    return dias <= 30 ? '0' : '1';
  } catch {
    return '0';
  }
}

export function buildE34(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, infoReferencia } = input;

  if (!infoReferencia?.NCFModificado) {
    throw new Error('E34 requiere infoReferencia.NCFModificado (eNCF de la factura original)');
  }

  const codigoMod = String(infoReferencia.CodigoModificacion ?? '3');
  if (!CODIGOS_MODIFICACION_E34[codigoMod]) {
    throw new Error(
      `CodigoModificacion "${codigoMod}" inválido para E34. ` +
      `Válidos: ${Object.entries(CODIGOS_MODIFICACION_E34).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    );
  }

  const cliente      = factura.cliente as any;
  const rnc          = cliente?.rncReceptor ?? cliente?.rfc ?? '';
  const tipoOriginal = infoReferencia.NCFModificado.substring(0, 3); // 'E31', 'E32', etc.

  // RNC obligatorio si modifica E31 (Factura Crédito Fiscal)
  if (tipoOriginal === 'E31' && (!rnc || rnc === '00000000000')) {
    throw new EcfRncRequeridoError(34, Number(factura.total));
  }

  const total       = Number(factura.total);
  const fecha       = fmtFecha(factura.fecha ?? new Date());
  const emisor      = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles    = factura.detalles as any[] ?? [];
  const fechaLimite = addDias(factura.fecha ?? new Date(), 30);
  const indicadorNC = calcIndicadorNC(infoReferencia.FechaNCFModificado);
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;

  // CodigoModificacion=2 (corrección de texto) → montos = 0; otros → totales reales con ITBIS
  const totales = codigoMod === '2'
    ? buildTotalesCero()
    : buildTotalesGravados(detalles, total);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   34,
          encf,
          // Sin FechaVencimientoSecuencia (doc de modificación)
          indicadorNotaCredito:   indicadorNC,
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  hayGravado === 1 ? 0 : undefined,  // 0 si hay ITBIS, omitir si exento
          tipoIngresos:           '01',
          tipoPago:               2,
          fechaLimitePago:        fechaLimite,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(
          rnc || '00000000000',
          cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: totales,
      },
      DetallesItems: { Item: buildItems(detalles) },
      // InformacionReferencia: orden estricto XSD DGII
      InformacionReferencia: {
        NCFModificado:      infoReferencia.NCFModificado,
        FechaNCFModificado: infoReferencia.FechaNCFModificado,
        CodigoModificacion: codigoMod,
      },
    },
  };
}
