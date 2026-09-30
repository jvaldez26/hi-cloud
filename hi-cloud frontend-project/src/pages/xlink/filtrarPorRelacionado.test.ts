import { describe, it, expect } from 'vitest';
import { filtrarPorRelacionado } from './filtrarPorRelacionado';

describe('filtrarPorRelacionado', () => {
  const filas = [
    { id: 1, contraparteNombre: 'Ventas Populares R&M' },
    { id: 2, contraparteNombre: 'Repuestos Crancha SRL' },
  ];

  it('sin término de búsqueda, devuelve todas las filas', () => {
    expect(filtrarPorRelacionado(filas, '')).toEqual(filas);
  });

  it('con término, filtra por coincidencia parcial e insensible a mayúsculas', () => {
    expect(filtrarPorRelacionado(filas, 'crancha')).toEqual([filas[1]]);
  });

  it('sin coincidencias, devuelve un array vacío', () => {
    expect(filtrarPorRelacionado(filas, 'nadie')).toEqual([]);
  });

  it('ignora espacios en blanco alrededor del término', () => {
    expect(filtrarPorRelacionado(filas, '  ventas  ')).toEqual([filas[0]]);
  });
});
