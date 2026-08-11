import { BadRequestException } from '@nestjs/common';
import { FacturasService } from './facturas.service';

/**
 * Invariantes ARITMÉTICAS de formasPago — las que hacen que el arqueo de caja
 * cierre, independientemente de lo que mande el cliente.
 *
 * `monto` es lo APLICADO a la venta (lo que entra a caja por esa vía);
 * `montoEntregado` es el billete que puso el cliente cuando hubo vuelto.
 *
 * Se invoca el método privado directamente: es lógica pura sin dependencias,
 * y así se prueba sin levantar el módulo Nest completo.
 */
describe('FacturasService — invariantes de formasPago', () => {
  const validar = (dto: any, total: number) =>
    (FacturasService.prototype as any).validarFormasPago.call({}, dto, total);

  it('acepta el reparto correcto de un pago mixto con vuelto', () => {
    expect(() => validar({
      formasPago: [
        { tipo: 3, monto: 1650 },
        { tipo: 1, monto: 385, montoEntregado: 1000 },
      ],
    }, 2035)).not.toThrow();
  });

  it('acepta una venta simple sin formas de pago', () => {
    expect(() => validar({}, 2035)).not.toThrow();
    expect(() => validar({ formasPago: [] }, 2035)).not.toThrow();
  });

  // ── Invariante 1: la suma de aplicados es el total ────────────────────────
  it('rechaza cuando los montos aplicados NO suman el total', () => {
    // el bug corregido: se guardaba el billete entregado como monto
    expect(() => validar({
      formasPago: [{ tipo: 3, monto: 1650 }, { tipo: 1, monto: 1000 }],
    }, 2035)).toThrow(BadRequestException);
  });

  it('rechaza cuando los aplicados suman de menos', () => {
    expect(() => validar({
      formasPago: [{ tipo: 3, monto: 1000 }],
    }, 2035)).toThrow(BadRequestException);
  });

  it('tolera el céntimo de redondeo (0.01)', () => {
    expect(() => validar({
      formasPago: [{ tipo: 1, monto: 2035.01 }],
    }, 2035)).not.toThrow();
  });

  it('suma total + propina cuando la propina viene declarada', () => {
    expect(() => validar({
      formasPago: [{ tipo: 1, monto: 2135 }], propina: 100,
    }, 2035)).not.toThrow();
    // sin declararla, ese mismo cobro no cuadra
    expect(() => validar({
      formasPago: [{ tipo: 1, monto: 2135 }],
    }, 2035)).toThrow(BadRequestException);
  });

  // ── Invariante 2: montoEntregado >= monto ─────────────────────────────────
  it('rechaza montoEntregado menor que el monto aplicado', () => {
    expect(() => validar({
      formasPago: [{ tipo: 1, monto: 2035, montoEntregado: 1000 }],
    }, 2035)).toThrow(BadRequestException);
  });

  it('acepta montoEntregado igual al aplicado', () => {
    expect(() => validar({
      formasPago: [{ tipo: 1, monto: 2035, montoEntregado: 2035 }],
    }, 2035)).not.toThrow();
  });

  // ── Invariante 3: ningún monto aplicado negativo o cero ───────────────────
  it('rechaza un monto aplicado negativo', () => {
    expect(() => validar({
      formasPago: [{ tipo: 3, monto: 2500 }, { tipo: 1, monto: -465 }],
    }, 2035)).toThrow(BadRequestException);
  });

  it('rechaza un monto aplicado en cero', () => {
    expect(() => validar({
      formasPago: [{ tipo: 1, monto: 2035 }, { tipo: 3, monto: 0 }],
    }, 2035)).toThrow(BadRequestException);
  });

  // ── Invariante 4: las vías sin vuelto no exceden el total ─────────────────
  it('rechaza tarjeta por encima del total (de una tarjeta no se da cambio)', () => {
    expect(() => validar({
      formasPago: [{ tipo: 3, monto: 2500 }, { tipo: 1, monto: 100 }],
    }, 2035)).toThrow(/sin vuelto/);
  });

  // ── Lo que NO se valida: exceso legítimo confirmado en el POS ─────────────
  it('acepta el caso legítimo: tarjeta 500 + billete de 2500 (entran 1535)', () => {
    expect(() => validar({
      formasPago: [
        { tipo: 3, monto: 500 },
        { tipo: 1, monto: 1535, montoEntregado: 2500 },
      ],
    }, 2035)).not.toThrow();
  });

  it('acepta FAC-219 ya repartida correctamente (el POS pide confirmación, no el backend)', () => {
    expect(() => validar({
      formasPago: [
        { tipo: 2, monto: 22000 },
        { tipo: 1, monto: 8019.20, montoEntregado: 30019.20 },
      ],
    }, 30019.20)).not.toThrow();
  });
});
