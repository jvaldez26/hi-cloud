import { describe, it, expect } from 'vitest';
import { esFormatoTarjetaSupervisor, PREFIJO_TARJETA_SUPERVISOR } from './tarjetaSupervisor';

const CODIGO_VALIDO = PREFIJO_TARJETA_SUPERVISOR + 'A1B2C3D4E5F6G7H8I9J0K1L2M3'; // 26 chars tras el prefijo

describe('esFormatoTarjetaSupervisor', () => {
  it('reconoce un código con el prefijo y largo correctos', () => {
    expect(esFormatoTarjetaSupervisor(CODIGO_VALIDO)).toBe(true);
  });

  it('es la razón por la que POSPage.procesarScan() NUNCA busca esto como producto — un código con el prefijo no es un código de barras de producto', () => {
    // Mismo criterio que procesarScan(): cualquier código con esta forma se
    // corta ANTES del lookup de productos (ver el guard al inicio de
    // procesarScan en POSPage.tsx). Esta prueba fija el contrato de esa
    // decisión — si esta función dice true, procesarScan nunca debe tocar
    // el catálogo, la balanza ni la API para ese código.
    expect(esFormatoTarjetaSupervisor(CODIGO_VALIDO)).toBe(true);
  });

  it('no reconoce un código de barras de producto típico (EAN-13 numérico)', () => {
    expect(esFormatoTarjetaSupervisor('7501234567890')).toBe(false);
  });

  it('no reconoce un SKU de producto con guiones', () => {
    expect(esFormatoTarjetaSupervisor('PROD-00123')).toBe(false);
  });

  it('acepta minúsculas y espacios — normaliza igual que el campo de escaneo', () => {
    expect(esFormatoTarjetaSupervisor(`  ${CODIGO_VALIDO.toLowerCase()}  `)).toBe(true);
  });

  it('rechaza un prefijo correcto con longitud incorrecta', () => {
    expect(esFormatoTarjetaSupervisor(PREFIJO_TARJETA_SUPERVISOR + 'ABC')).toBe(false);
    expect(esFormatoTarjetaSupervisor(CODIGO_VALIDO + 'X')).toBe(false);
  });

  it('rechaza un texto vacío o solo espacios', () => {
    expect(esFormatoTarjetaSupervisor('')).toBe(false);
    expect(esFormatoTarjetaSupervisor('   ')).toBe(false);
  });
});
