import { describe, it, expect } from 'vitest';
import { esFormatoTarjetaSupervisor, PREFIJO_TARJETA_SUPERVISOR } from './tarjetaSupervisor';

const CODIGO_VALIDO = PREFIJO_TARJETA_SUPERVISOR + '1234567890123456789012'; // 22 dígitos tras el prefijo

describe('esFormatoTarjetaSupervisor', () => {
  it('reconoce un código con el prefijo y largo correctos (24 dígitos)', () => {
    expect(esFormatoTarjetaSupervisor(CODIGO_VALIDO)).toBe(true);
  });

  it('es la razón por la que POSPage.procesarScan() NUNCA busca esto como producto — un código con este formato no es un código de barras de producto', () => {
    // Mismo criterio que procesarScan(): cualquier código con esta forma se
    // corta ANTES del lookup de productos (ver el guard al inicio de
    // procesarScan en POSPage.tsx). Esta prueba fija el contrato de esa
    // decisión — si esta función dice true, procesarScan nunca debe tocar
    // el catálogo, la balanza ni la API para ese código.
    expect(esFormatoTarjetaSupervisor(CODIGO_VALIDO)).toBe(true);
  });

  it('no reconoce un código de barras de producto típico (EAN-13, 13 dígitos)', () => {
    expect(esFormatoTarjetaSupervisor('7501234567890')).toBe(false);
  });

  it('no reconoce un UPC-A (12 dígitos) ni un EAN-8 (8 dígitos)', () => {
    expect(esFormatoTarjetaSupervisor('036000291452')).toBe(false);
    expect(esFormatoTarjetaSupervisor('96385074')).toBe(false);
  });

  it('no reconoce un SKU de producto alfanumérico', () => {
    expect(esFormatoTarjetaSupervisor('PROD-00123')).toBe(false);
  });

  it('recorta espacios al validar — igual que el campo de escaneo', () => {
    expect(esFormatoTarjetaSupervisor(`  ${CODIGO_VALIDO}  `)).toBe(true);
  });

  it('rechaza un prefijo correcto con longitud incorrecta (23 o 25 dígitos)', () => {
    expect(esFormatoTarjetaSupervisor(PREFIJO_TARJETA_SUPERVISOR + '123')).toBe(false);
    expect(esFormatoTarjetaSupervisor(CODIGO_VALIDO + '9')).toBe(false);
    expect(esFormatoTarjetaSupervisor(CODIGO_VALIDO.slice(0, -1))).toBe(false);
  });

  it('rechaza un código de otro prefijo numérico, misma longitud', () => {
    expect(esFormatoTarjetaSupervisor('91' + '1234567890123456789012')).toBe(false);
  });

  it('rechaza cualquier letra — el formato es solo dígitos', () => {
    expect(esFormatoTarjetaSupervisor(PREFIJO_TARJETA_SUPERVISOR + 'A' + '23456789012345678901')).toBe(false); // 22 chars, 1 letra + 21 dígitos
  });

  it('rechaza un texto vacío o solo espacios', () => {
    expect(esFormatoTarjetaSupervisor('')).toBe(false);
    expect(esFormatoTarjetaSupervisor('   ')).toBe(false);
  });
});
