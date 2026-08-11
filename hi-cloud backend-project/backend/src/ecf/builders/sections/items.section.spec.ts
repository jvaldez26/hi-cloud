import { buildItems } from './items.section';

/**
 * Regla DGII por línea (adv. 2394 / errores 1924, 11105):
 *   CantidadItem × PrecioUnitarioItem − DescuentoMonto = MontoItem  (±0.01)
 *
 * El caso que motivó estas pruebas: FAC-142 / E320000000033 — venta POS con
 * descuento GENERAL de factura. El servicio reparte ese descuento reduciendo
 * detalle.subtotal SIN tocar precioUnitario ni descuentoMonto, así que el
 * builder debe derivar DescuentoMonto de la diferencia, no del detalle.
 */
describe('buildItems — cuadratura DGII', () => {
  const cuadra = (item: Record<string, any>) => {
    const bruto = Number(item.CantidadItem) * Number(item.PrecioUnitarioItem);
    const suma  = Number(item.MontoItem) + Number(item.DescuentoMonto ?? 0);
    return Math.abs(Math.round((bruto - suma) * 100) / 100) <= 0.01;
  };

  it('declara el descuento GENERAL repartido en la línea (RD$200 c/ITBIS − RD$10)', () => {
    // 1 × 169.49 base; descuento general de 8.47 base (= RD$10 c/ITBIS)
    const [item] = buildItems([{
      descripcion: 'Producto', cantidad: 1,
      precioUnitario: 169.49, porcentajeIva: 18,
      subtotal: 161.02, importeIva: 28.98,
      descuentoMonto: 0,           // el descuento general NO vive en el detalle
    }], 'E320000000033');

    expect(item.DescuentoMonto).toBe(8.47);
    expect(item.MontoItem).toBe(161.02);
    expect(cuadra(item)).toBe(true);
  });

  it('declara el descuento POR ÍTEM (convención B del POS)', () => {
    const [item] = buildItems([{
      descripcion: 'Producto', cantidad: 2,
      precioUnitario: 169.49, porcentajeIva: 18,
      subtotal: 322.04,            // 2 × 161.02
      descuentoMonto: 8.47,
    }]);

    expect(item.DescuentoMonto).toBe(16.94);
    expect(cuadra(item)).toBe(true);
  });

  it('no emite DescuentoMonto cuando no hay descuento', () => {
    const [item] = buildItems([{
      descripcion: 'Producto', cantidad: 3,
      precioUnitario: 100, porcentajeIva: 18,
      subtotal: 300,
    }]);

    expect(item.DescuentoMonto).toBeUndefined();
    expect(item.TablaSubDescuento).toBeUndefined();
    expect(cuadra(item)).toBe(true);
  });

  it('ignora diferencias de redondeo dentro de la tolerancia DGII (≤ 0.01)', () => {
    const [item] = buildItems([{
      descripcion: 'Producto', cantidad: 1,
      precioUnitario: 84.75, porcentajeIva: 18,
      subtotal: 84.746,            // raw de 4dp vs decimal(12,2) en DB
    }]);

    expect(item.DescuentoMonto).toBeUndefined();
    expect(cuadra(item)).toBe(true);
  });

  it('cuadra con descuento de ítem Y descuento general en la misma línea', () => {
    // precio lista 200 base, desc ítem 20 → neto 180; desc general reparte 9 más
    const [item] = buildItems([{
      descripcion: 'Producto', cantidad: 1,
      precioUnitario: 180, porcentajeIva: 18,
      subtotal: 171,
      descuentoMonto: 20,
    }]);

    expect(item.DescuentoMonto).toBe(9);   // sobre el precio serializado (180)
    expect(cuadra(item)).toBe(true);
  });
});
