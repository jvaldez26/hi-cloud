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

  // El placeholder del logo (cuando la empresa no tiene uno subido) decía
  // "FERRETERIA" fijo, igual que el resto de los datos — caso real:
  // "Ventas Diversas Elido" veía "FERRETERIA" en su propia vista previa.
  describe('logo de muestra (sin logo real subido)', () => {
    function textoSvg(dataUri: string): string {
      const svg = decodeURIComponent(dataUri.replace('data:image/svg+xml;utf8,', ''));
      return svg.match(/<text[^>]*>([^<]*)<\/text>/)?.[1] ?? '';
    }

    it('usa el nombre REAL de la empresa, no "FERRETERIA"', () => {
      const venta = ventaEjemploTicket(null, { nombre: 'Ventas Diversas Elido' });
      expect(textoSvg(venta.empresaLogo!)).toBe('VENTAS DIVERSAS ELIDO');
      expect(textoSvg(venta.empresaLogo!)).not.toContain('FERRETERIA');
    });

    it('sin nombre de empresa, cae a un placeholder genérico ("LOGO"), no a un rubro inventado', () => {
      const venta = ventaEjemploTicket(null);
      expect(textoSvg(venta.empresaLogo!)).toBe('LOGO');
    });

    it('con un logo REAL subido, no genera ningún placeholder', () => {
      const venta = ventaEjemploTicket('https://cdn.example.com/logo-real.png', { nombre: 'Cualquier Empresa' });
      expect(venta.empresaLogo).toBe('https://cdn.example.com/logo-real.png');
    });

    it('escapa caracteres especiales del nombre para no romper el SVG', () => {
      const venta = ventaEjemploTicket(null, { nombre: 'AT&T <Store>' });
      expect(venta.empresaLogo).not.toContain('<Store>'); // sin escapar rompería el XML
      expect(textoSvg(venta.empresaLogo!)).toContain('&amp;T');
    });
  });
});
