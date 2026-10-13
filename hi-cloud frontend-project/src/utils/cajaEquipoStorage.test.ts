import { describe, it, expect, beforeEach } from 'vitest';
import { registrarCajaAbiertaEquipo, limpiarCajaAbiertaEquipoSiEs, leerCajaAbiertaEquipo } from './cajaEquipoStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('cajaEquipoStorage — "hay una caja abierta de [cajero] en este equipo"', () => {
  it('sin registro: leerCajaAbiertaEquipo() devuelve null', () => {
    expect(leerCajaAbiertaEquipo()).toBeNull();
  });

  it('registrar + leer: devuelve exactamente lo guardado', () => {
    registrarCajaAbiertaEquipo({ cajaId: 788, vendedorId: 52, vendedorNombre: 'Franchesca Sosa' });
    expect(leerCajaAbiertaEquipo()).toEqual({ cajaId: 788, vendedorId: 52, vendedorNombre: 'Franchesca Sosa' });
  });

  it('limpiar con el mismo cajaId: borra el registro', () => {
    registrarCajaAbiertaEquipo({ cajaId: 788, vendedorId: 52, vendedorNombre: 'Franchesca Sosa' });
    limpiarCajaAbiertaEquipoSiEs(788);
    expect(leerCajaAbiertaEquipo()).toBeNull();
  });

  it('limpiar con un cajaId DISTINTO: no toca el registro de otra caja', () => {
    registrarCajaAbiertaEquipo({ cajaId: 788, vendedorId: 52, vendedorNombre: 'Franchesca Sosa' });
    limpiarCajaAbiertaEquipoSiEs(999); // otra caja — no debe pisar el registro de 788
    expect(leerCajaAbiertaEquipo()).toEqual({ cajaId: 788, vendedorId: 52, vendedorNombre: 'Franchesca Sosa' });
  });

  it('JSON corrupto en la clave: leerCajaAbiertaEquipo() no lanza, devuelve null', () => {
    localStorage.setItem('hc_caja_abierta_equipo', 'undefined');
    expect(leerCajaAbiertaEquipo()).toBeNull();
  });
});
