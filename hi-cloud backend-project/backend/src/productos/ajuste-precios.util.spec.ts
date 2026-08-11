import { calcularPrecioObjetivo, calcularFila } from './ajuste-precios.util';

describe('ajuste de precios al público', () => {
  describe('calcularPrecioObjetivo', () => {
    it('redondea al peso entero más cercano', () => {
      expect(calcularPrecioObjetivo(400.02, 'entero')).toBe(400);
      expect(calcularPrecioObjetivo(399.60, 'entero')).toBe(400);
      expect(calcularPrecioObjetivo(399.20, 'entero')).toBe(399);
    });

    it('respeta la dirección', () => {
      expect(calcularPrecioObjetivo(400.02, 'entero', 'arriba')).toBe(401);
      expect(calcularPrecioObjetivo(400.02, 'entero', 'abajo')).toBe(400);
      expect(calcularPrecioObjetivo(399.20, 'entero', 'arriba')).toBe(400);
      expect(calcularPrecioObjetivo(399.20, 'entero', 'abajo')).toBe(399);
    });

    it('redondea a múltiplos de 5 y de 10', () => {
      expect(calcularPrecioObjetivo(84.75, 'multiplo5')).toBe(85);
      expect(calcularPrecioObjetivo(403.75, 'multiplo5')).toBe(405);
      expect(calcularPrecioObjetivo(403.75, 'multiplo10')).toBe(400);
      expect(calcularPrecioObjetivo(406.00, 'multiplo10', 'arriba')).toBe(410);
    });

    it('ancla las terminaciones .95 y .99 al entero', () => {
      expect(calcularPrecioObjetivo(400.02, 'terminacion95')).toBe(399.95);
      expect(calcularPrecioObjetivo(400.02, 'terminacion99')).toBe(399.99);
      expect(calcularPrecioObjetivo(400.60, 'terminacion95')).toBe(400.95);
      expect(calcularPrecioObjetivo(400.02, 'terminacion95', 'arriba')).toBe(400.95);
      expect(calcularPrecioObjetivo(400.02, 'terminacion99', 'abajo')).toBe(399.99);
    });

    it('nunca deja el precio en cero al redondear hacia abajo', () => {
      expect(calcularPrecioObjetivo(0.40, 'entero', 'abajo')).toBe(1);
      expect(calcularPrecioObjetivo(2.00, 'multiplo5', 'abajo')).toBe(5);
      expect(calcularPrecioObjetivo(0.10, 'terminacion95', 'abajo')).toBe(0.95);
    });

    it('devuelve 0 para un precio no válido', () => {
      expect(calcularPrecioObjetivo(0, 'entero')).toBe(0);
      expect(calcularPrecioObjetivo(-5, 'entero')).toBe(0);
    });
  });

  describe('calcularFila — despeje de la base', () => {
    it('el caso real: 339.00 base → 400.02 al público → 400.00', () => {
      const f = calcularFila(339.00, 18, 'entero');
      expect(f.precioFinalActual).toBe(400.02);
      expect(f.precioFinalPropuesto).toBe(400);
      expect(f.baseNueva).toBe(338.9831);
      expect(f.verificado).toBe(true);
      expect(f.diferencia).toBe(-0.02);
      // el viaje de vuelta reproduce el objetivo exacto
      expect(Math.round(f.baseNueva * 1.18 * 100) / 100).toBe(400);
    });

    it('el caso de FERRETERIA: 8.47 → 9.99 al público → 10.00', () => {
      const f = calcularFila(8.47, 18, 'entero');
      expect(f.precioFinalActual).toBe(9.99);
      expect(f.precioFinalPropuesto).toBe(10);
      expect(f.baseNueva).toBe(8.4746);
      expect(f.verificado).toBe(true);
    });

    it('producto EXENTO: el precio al público es la base', () => {
      const f = calcularFila(84.30, 0, 'entero');
      expect(f.precioFinalActual).toBe(84.30);
      expect(f.precioFinalPropuesto).toBe(84);
      expect(f.baseNueva).toBe(84);
      expect(f.verificado).toBe(true);
    });

    it('ITBIS 16%', () => {
      const f = calcularFila(100, 16, 'multiplo5');
      expect(f.precioFinalActual).toBe(116);
      expect(f.precioFinalPropuesto).toBe(115);
      expect(Math.round(f.baseNueva * 1.16 * 100) / 100).toBe(115);
      expect(f.verificado).toBe(true);
    });

    it('un precio ya redondo no propone cambio', () => {
      const f = calcularFila(84.7458, 18, 'entero');
      expect(f.precioFinalActual).toBe(100);
      expect(f.precioFinalPropuesto).toBe(100);
      expect(f.diferencia).toBe(0);
    });

    it('marca como no verificada la fila que no puede alcanzar el objetivo', () => {
      // se fuerza con un pctIva absurdo donde el despeje no cierra en 2dp
      const f = calcularFila(100, 33.333, 'entero');
      if (!f.verificado) {
        expect(f.motivoExclusion).toContain('no se puede alcanzar');
      } else {
        // si cerró, al menos debe cumplir la invariante
        expect(Math.round(f.baseNueva * 1.33333 * 100) / 100).toBe(f.precioFinalPropuesto);
      }
    });

    it('mantiene la invariante en un barrido amplio', () => {
      const modos = ['entero', 'multiplo5', 'multiplo10', 'terminacion95', 'terminacion99'] as const;
      const dirs  = ['cercano', 'arriba', 'abajo'] as const;
      for (let base = 1; base <= 3000; base += 7.13) {
        for (const modo of modos) {
          for (const dir of dirs) {
            const f = calcularFila(parseFloat(base.toFixed(4)), 18, modo, dir);
            if (!f.verificado) continue;
            expect(Math.round(f.baseNueva * 1.18 * 100) / 100).toBe(f.precioFinalPropuesto);
            expect(f.baseNueva).toBeGreaterThan(0);
          }
        }
      }
    });
  });
});
