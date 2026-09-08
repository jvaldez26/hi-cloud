import { describe, it, expect } from 'vitest';
import { estadoDiferencia } from './diferenciaCaja';

/**
 * El caso que da sentido al archivo: una caja cuadrada llegaba como la CADENA
 * `"0.00"` —columna `decimal(12,2)`— y `"0.00" === 0` es `false`, así que se
 * pintaba de rojo como si faltara dinero. En pantalla se leía «RD$0.00» en el
 * color del faltante.
 */
describe('estadoDiferencia', () => {
  it('un cero que llega como cadena está CUADRADO, no faltante', () => {
    // Esto es literalmente lo que devuelve la API para una caja cuadrada.
    expect(estadoDiferencia('0.00')).toBe('cuadrado');
    expect(estadoDiferencia('0')).toBe('cuadrado');
    expect(estadoDiferencia(0)).toBe('cuadrado');
    expect(estadoDiferencia('-0.00')).toBe('cuadrado');
  });

  it('distingue sobrante de faltante, vengan como número o como cadena', () => {
    expect(estadoDiferencia('15.50')).toBe('sobrante');
    expect(estadoDiferencia(15.5)).toBe('sobrante');
    expect(estadoDiferencia('-15.50')).toBe('faltante');
    expect(estadoDiferencia(-15.5)).toBe('faltante');
  });

  it('el ruido de la coma flotante no es un faltante', () => {
    // El modal de cierre resta dos importes: cuando el arqueo cuadra exacto la
    // resta puede devolver esto, y antes anunciaba «Faltante RD$0.00».
    expect(estadoDiferencia(1.8189894035458565e-12)).toBe('cuadrado');
    expect(estadoDiferencia(-1e-9)).toBe('cuadrado');
    expect(estadoDiferencia(15524.81 - 15524.81)).toBe('cuadrado');
    expect(estadoDiferencia(0.1 + 0.2 - 0.3)).toBe('cuadrado');
  });

  it('un centavo sí es una diferencia', () => {
    // La tolerancia es de medio centavo: no puede tragarse un centavo real,
    // que es una diferencia que el cajero tiene que justificar.
    expect(estadoDiferencia('0.01')).toBe('sobrante');
    expect(estadoDiferencia('-0.01')).toBe('faltante');
  });

  it('lo que no es un número no se pinta como faltante', () => {
    // fmt.money ya muestra RD$0.00 en estos casos; marcarlo en rojo desmentiría
    // lo que se está leyendo.
    expect(estadoDiferencia(null)).toBe('cuadrado');
    expect(estadoDiferencia(undefined)).toBe('cuadrado');
    expect(estadoDiferencia('')).toBe('cuadrado');
    expect(estadoDiferencia('sin datos')).toBe('cuadrado');
    expect(estadoDiferencia(NaN)).toBe('cuadrado');
  });
});
