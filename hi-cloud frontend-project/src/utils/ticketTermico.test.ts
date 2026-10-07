import { describe, it, expect } from 'vitest';
import { ventaEjemploTicket } from './ticketTermico';

/**
 * ventaEjemploTicket — la venta en sí (folio, items, montos) es de ejemplo a
 * propósito, pero los datos de LA EMPRESA no deben mentir: antes mostraban
 * siempre "FERRETERIA PAVEL, SRL." sin importar qué empresa estuviera viendo
 * Configuración → Punto de Venta (reporte real, 2026-10-07).
 */
describe('ventaEjemploTicket', () => {
  it('usa los datos REALES de la empresa cuando se pasan', () => {
    const venta = ventaEjemploTicket(null, {
      nombre: 'Multiservicios Hi Global SRL',
      rnc: '101234567',
      direccion: 'Av. Siempre Viva 123',
      telefono: '809-555-1234',
    });
    expect(venta.empresaNombreComercial).toBe('Multiservicios Hi Global SRL');
    expect(venta.empresaRnc).toBe('101234567');
    expect(venta.empresaDireccion).toBe('Av. Siempre Viva 123');
    expect(venta.empresaTelefono).toBe('809-555-1234');
  });

  it('sin empresaInfo, cae al ejemplo de siempre (no deja los campos vacíos)', () => {
    const venta = ventaEjemploTicket(null);
    expect(venta.empresaNombreComercial).toBe('FERRETERIA PAVEL, SRL.');
    expect(venta.empresaRnc).toBe('132716507');
  });

  it('con empresaInfo parcial, solo rellena con el ejemplo lo que falta', () => {
    const venta = ventaEjemploTicket(null, { nombre: 'Solo Nombre SRL', rnc: null, direccion: undefined, telefono: '' });
    expect(venta.empresaNombreComercial).toBe('Solo Nombre SRL');
    expect(venta.empresaRnc).toBe('132716507');
    expect(venta.empresaDireccion).toBe('C/ Francisco Caamaño 14, Progreso');
    expect(venta.empresaTelefono).toBe('829-562-4199');
  });

  it('la venta de ejemplo (folio, items, montos) sigue siendo la de siempre', () => {
    const venta = ventaEjemploTicket(null, { nombre: 'Otra Empresa' });
    expect(venta.folio).toBe('FAC-825');
    expect(venta.total).toBe(3600);
    expect(venta.items).toHaveLength(1);
  });
});
