import { describe, it, expect } from 'vitest';
import { costoParaPrellenar } from './costoInicialEntrada';

/**
 * Modal "Registrar Entrada" de InventarioPage: al elegir un producto, el
 * campo "Costo unitario" se pre-llena con su costoPromedio (editable) para
 * que el usuario no tenga que ir a buscarlo — sin forzar nada cuando no se
 * conoce, que es el caso de la mayoría del catálogo hoy.
 */
describe('costoParaPrellenar', () => {
  it('producto con costoPromedio real: pre-llena ese valor', () => {
    expect(costoParaPrellenar({ costoPromedio: 95.58 })).toBe(95.58);
  });

  it('producto sin costoPromedio (0): deja el campo vacío (undefined)', () => {
    expect(costoParaPrellenar({ costoPromedio: 0 })).toBeUndefined();
  });

  it('producto con costoPromedio null: deja el campo vacío', () => {
    expect(costoParaPrellenar({ costoPromedio: null })).toBeUndefined();
  });

  it('producto sin la propiedad costoPromedio siquiera: deja el campo vacío', () => {
    expect(costoParaPrellenar({})).toBeUndefined();
  });

  it('sin producto seleccionado (undefined/null): deja el campo vacío', () => {
    expect(costoParaPrellenar(undefined)).toBeUndefined();
    expect(costoParaPrellenar(null)).toBeUndefined();
  });

  it('costoPromedio como string (tal como viaja desde el backend en decimales de Postgres): lo interpreta igual', () => {
    expect(costoParaPrellenar({ costoPromedio: '65.5000' })).toBe(65.5);
  });
});
