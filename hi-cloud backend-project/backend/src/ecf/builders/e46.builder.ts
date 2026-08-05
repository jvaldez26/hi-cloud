/**
 * E46 — Comprobante para Exportaciones Electrónico
 * Propósito: reportar ventas de bienes fuera del territorio nacional.
 * IndicadorFacturacion: obligatoriamente 3 (ITBIS Tasa Cero) en todos los ítems.
 * IndicadorMontoGravado: NO aplica en E46.
 *
 * Comprador (dos casos):
 *   A) Cliente extranjero → IdentificadorExtranjero (ID fiscal en su país) OBLIGATORIO
 *   B) Zona Franca / residente RD → RNCComprador OBLIGATORIO
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorExtranjero,
  buildTotalesTasaCero,
  EcfRncRequeridoError,
  resolverMoneda,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';
import { truncarNombreItem } from './sections/items.section';

function fmt2(v: number): number { return parseFloat(v.toFixed(2)); }

export function buildE46(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero, paisExtranjero } = input;
  const cliente  = factura.cliente as any;
  const mc       = resolverMoneda(factura);
  const totalME  = Number(factura.total);
  const total    = mc.toDOP(totalME);   // principal en DOP
  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const nombre = nombreExtranjero ?? cliente?.nombre ?? 'Cliente Extranjero';
  const pais   = paisExtranjero   ?? 'US';

  // Determinar identificación del comprador
  const esZonaFranca = !!(cliente?.rncReceptor && !cliente?.esExtranjero);
  const rncComprador = esZonaFranca ? cliente.rncReceptor : undefined;
  const idExtranjero = !esZonaFranca ? (cliente?.identificadorExtranjero as string | undefined) : undefined;

  if (!rncComprador && !idExtranjero) {
    throw new EcfRncRequeridoError(46, total);
  }

  // Exportaciones: IndicadorFacturacion = 3 (ITBIS Tasa Cero) obligatorio
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => {
    const precioME = Number(d.precioUnitario);
    const montoME  = Number(d.subtotal);
    const otME     = mc.otraMonedaItem(precioME, montoME);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   3,
      NombreItem:             truncarNombreItem(d.descripcion, encf),
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(mc.toDOP(precioME)),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              round2(mc.toDOP(montoME)),
    };
  });

  const encabezado: Record<string, unknown> = {
    Version: '1.0',
    IdDoc: buildIdDoc({
      tipo:         46,
      encf,
      fechaVencSec,
      tipoIngresos: '01',
      tipoPago:     1,
    }),
    Emisor: emisor,
    Comprador: buildCompradorExtranjero(nombre, pais, idExtranjero, rncComprador),
    Totales: buildTotalesTasaCero(total),
  };
  // OtraMoneda E46: Tasa 0% (IndicadorFacturacion=3), NO MontoExentoOtraMoneda
  if (mc.esME) {
    const subtotalUSD = parseFloat(fmt2(Number((factura as any).subtotal ?? totalME)).toFixed(2));
    encabezado['OtraMoneda'] = {
      TipoMoneda:                  mc.moneda,
      TipoCambio:                  mc.tasa.toFixed(4),
      MontoGravadoTotalOtraMoneda: subtotalUSD.toFixed(2),
      MontoGravado3OtraMoneda:     subtotalUSD.toFixed(2),  // Tasa 0% — NO MontoExento
      TotalITBISOtraMoneda:        '0.00',
      TotalITBIS3OtraMoneda:       '0.00',
      MontoTotalOtraMoneda:        fmt2(totalME).toFixed(2),
    };
  }

  return {
    ECF: { Encabezado: encabezado as any, DetallesItems: { Item: items } },
  };
}
