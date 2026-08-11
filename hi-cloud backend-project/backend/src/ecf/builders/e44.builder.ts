/**
 * E44 — Comprobante para Regímenes Especiales Electrónico
 * Propósito: transacciones exentas a entidades acogidas a leyes/convenios especiales.
 * Comprador: RNC obligatorio del beneficiario del régimen.
 * IndicadorFacturacion: siempre 4 (Exento) en todos los ítems.
 * IndicadorMontoGravado: NO aplica en E44 — campo inválido para este tipo (causa error 3).
 *
 * TODO(buildItems): migrar a buildItems() con IndicadorFacturacion=4 fijo.
 * Riesgo bajo — regímenes especiales raramente tienen descuentos de línea.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  buildTotalesExentos,
  EcfRncRequeridoError,
  resolverMoneda,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';
import { truncarNombreItem } from './sections/items.section';

export function buildE44(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente     = factura.cliente as any;
  const mc          = resolverMoneda(factura);
  const rnc         = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(44, Number(factura.total));

  const montoME     = Number(factura.total);
  const montoExento = mc.toDOP(Number((factura as any).subtotal ?? factura.total));
  const fecha       = fmtFecha(factura.fecha ?? new Date());
  const emisor      = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // Todos los ítems son exentos (IndicadorFacturacion = 4)
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => {
    const precioME    = Number(d.precioUnitario);
    const itemMontoME = Number(d.subtotal);
    const otME        = mc.otraMonedaItem(precioME, itemMontoME);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   4,
      NombreItem:             truncarNombreItem(d.descripcion, encf),
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(mc.toDOP(precioME)),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              round2(mc.toDOP(itemMontoME)),
    };
  });

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:         44,
          encf,
          fechaVencSec,
          // Sin IndicadorMontoGravado (no existe en XSD E44)
          tipoIngresos: '01',
          tipoPago:     1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: buildTotalesExentos(montoExento),
        ...( mc.otraMonedaExentos(montoME) ? { OtraMoneda: mc.otraMonedaExentos(montoME) } : {} ),
      },
      DetallesItems: { Item: items },
    },
  };
}
