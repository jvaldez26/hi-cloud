/**
 * E44 — Comprobante para Regímenes Especiales Electrónico
 * Propósito: transacciones exentas a entidades acogidas a leyes/convenios especiales.
 * Comprador: RNC obligatorio del beneficiario del régimen.
 * IndicadorFacturacion: siempre 4 (Exento) en todos los ítems.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  buildTotalesExentos,
  EcfRncRequeridoError,
} from './base-ecf.builder';
import { round2 } from './sections/totales.section';

export function buildE44(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente     = factura.cliente as any;
  const rnc         = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(44, Number(factura.total));

  const montoExento = Number((factura as any).subtotal ?? factura.total);
  const fecha       = fmtFecha(factura.fecha ?? new Date());
  const emisor      = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // Todos los ítems son exentos (IndicadorFacturacion = 4)
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   4,
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
          tipo:                  44,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,
          tipoIngresos:          '01',
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: buildTotalesExentos(montoExento),
      },
      DetallesItems: { Item: items },
    },
  };
}
