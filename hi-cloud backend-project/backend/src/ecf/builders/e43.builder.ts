/**
 * E43 — Comprobante para Gastos Menores Electrónico
 * Propósito: sustentar pagos del personal (peajes, pasajes, parqueos, dietas).
 * IndicadorFacturacion: siempre 4 (Exento) en todos los ítems.
 * IndicadorBienoServicio: dinámico — 2 (Servicio) para peajes/pasajes/parqueos, 1 (Bien) para consumibles.
 * SIN Comprador (E43 es autofactura interna — minOccurs=0).
 * SIN TipoIngresos en IdDoc (no corresponde a E43).
 * Totales: solo MontoExento y MontoTotal.
 *
 * TODO(buildItems): migrar a buildItems() con IndicadorFacturacion=4 fijo y
 * IndicadorBienoServicio dinámico. Riesgo muy bajo — gastos menores sin descuentos.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildTotalesExentos,
  round2,
} from './base-ecf.builder';
import { truncarNombreItem } from './sections/items.section';

export function buildE43(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const total  = round2(Number(factura.total));
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // Items: IndicadorFacturacion siempre 4 (Exento).
  // IndicadorBienoServicio: 2=Servicio (peaje/pasaje/parqueo/dieta), 1=Bien (consumible).
  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   4,
    NombreItem:             truncarNombreItem(d.descripcion, encf),
    IndicadorBienoServicio: d.esServicio === false ? 1 : 2,  // default Servicio para gastos menores
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
          tipo:         43,
          encf,
          fechaVencSec,
          // SIN TipoIngresos (no corresponde a E43)
          // SIN IndicadorMontoGravado (no aplica en E43)
          tipoPago:     1,
        }),
        Emisor:    emisor,
        // SIN Comprador (E43 es autofactura interna, Comprador minOccurs=0)
        Totales:   buildTotalesExentos(total),   // solo MontoExento + MontoTotal
      },
      DetallesItems: { Item: items },
    },
  };
}
