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
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

export function buildE46(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero, paisExtranjero } = input;
  const cliente = factura.cliente as any;
  const total   = Number(factura.total);
  const fecha   = fmtFecha(factura.fecha ?? new Date());
  const emisor  = buildEmisor(toEmpresaConfig(config), fecha);
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
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   3,
    NombreItem:             d.descripcion,
    IndicadorBienoServicio: 1,
    CantidadItem:           Number(d.cantidad),
    UnidadMedida:           43,
    PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
    MontoItem:              round2(Number(d.subtotal)),
  }));

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:         46,
          encf,
          fechaVencSec,
          // Sin IndicadorMontoGravado (no aplica en E46)
          tipoIngresos: '01',
          tipoPago:     1,
        }),
        Emisor: emisor,
        Comprador: buildCompradorExtranjero(nombre, pais, idExtranjero, rncComprador),
        // E46: Tasa 0% (no exento) — MontoGravadoI3, ITBIS3=0
        Totales: buildTotalesTasaCero(total),
      },
      DetallesItems: { Item: items },
    },
  };
}
