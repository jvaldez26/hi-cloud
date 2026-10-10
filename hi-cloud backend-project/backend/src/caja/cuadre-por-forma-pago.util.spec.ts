import {
  construirCuadrePorForma, detectarPosibleFormaMalRegistrada, netoCuadre,
  derivarCuadreLegacy, aplicarAjustesAlCuadre,
} from './cuadre-por-forma-pago.util';

describe('cuadre-por-forma-pago.util — caso real (empresa 73, Bellamar González, 2026-10-09)', () => {
  // FAC-1803: Tarjeta 955 + Efectivo 125 cuando fue Efectivo 955 + Tarjeta 125.
  // Efectivo esperado 5,608.06 vs contado 6,438.00 (+829.94). Tarjeta esperado
  // 2,605.00 vs declarado 1,775.00 (−830.00). Neto −0.06 (redondeo del turno).
  const filas = construirCuadrePorForma(
    { efectivo: 5608.06, tarjeta: 2605.00 },
    { efectivo: 6438.00, tarjeta: 1775.00 },
  );

  it('construye una fila por forma con esperado/declarado/diferencia', () => {
    expect(filas).toEqual([
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
      { forma: 'tarjeta',  esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    ]);
  });

  it('detecta la sospecha con las diferencias REALES de cada forma, no asumidas simétricas', () => {
    const sospechas = detectarPosibleFormaMalRegistrada(filas, 1);
    expect(sospechas).toEqual([
      { formaSobrante: 'efectivo', formaFaltante: 'tarjeta', monto: 829.94, montoSobrante: 829.94, montoFaltante: -830.00 },
    ]);
  });

  it('el neto es prácticamente cero — confirma que es un error de registro, no una pérdida real', () => {
    expect(netoCuadre(filas)).toBeCloseTo(-0.06, 2);
  });

  it('con tolerancia menor al desfase (0.01 contra 0.06 de diferencia neta), igual detecta — la tolerancia es sobre el PAR, no sobre el neto', () => {
    expect(detectarPosibleFormaMalRegistrada(filas, 0.1)).toHaveLength(1);
  });
});

describe('cuadre-por-forma-pago.util — casos generales', () => {
  it('sin diferencias: ninguna fila por fuera de 0, ninguna sospecha', () => {
    const filas = construirCuadrePorForma({ efectivo: 1000, tarjeta: 500 }, { efectivo: 1000, tarjeta: 500 });
    expect(filas.every(f => f.diferencia === 0)).toBe(true);
    expect(detectarPosibleFormaMalRegistrada(filas)).toHaveLength(0);
  });

  it('un sobrante real (sin faltante que lo explique): no genera sospecha', () => {
    const filas = construirCuadrePorForma({ efectivo: 1000 }, { efectivo: 1050 });
    expect(detectarPosibleFormaMalRegistrada(filas)).toHaveLength(0);
  });

  it('forma declarada que no tenía nada esperado (ej. un método que no se usó) también entra en el cuadre', () => {
    const filas = construirCuadrePorForma({ efectivo: 1000 }, { efectivo: 1000, transferencia: 50 });
    expect(filas.find(f => f.forma === 'transferencia')).toEqual({ forma: 'transferencia', esperado: 0, declarado: 50, diferencia: 50 });
  });

  it('tres formas con dos pares de sospecha simultáneos', () => {
    const filas = construirCuadrePorForma(
      { efectivo: 1000, tarjeta: 500, transferencia: 300 },
      { efectivo: 1100, tarjeta: 400, transferencia: 300 },
    );
    const sospechas = detectarPosibleFormaMalRegistrada(filas, 1);
    expect(sospechas).toEqual([{ formaSobrante: 'efectivo', formaFaltante: 'tarjeta', monto: 100, montoSobrante: 100, montoFaltante: -100 }]);
  });
});

// El cierre real de Bellamar González (2026-10-09) se cerró ANTES de que
// cuadrePorFormaPago existiera — al reimprimirlo después del deploy, sale
// con las columnas legacy (ventasTarjeta/saldoCierre/saldoFisico/desglosePago,
// este con la clave vieja 'tarjetaDebito') y SIN el snapshot nuevo. Sin esta
// derivación, el ticket vuelve al formato viejo para todo cierre anterior al
// fix — exactamente el bug reportado.
describe('derivarCuadreLegacy — reconstruye el cuadre de un cierre viejo sin snapshot', () => {
  it('caso real: efectivo 6,438.00 / Tarjeta Débito 1,775.00 → misma sospecha que el cuadre nuevo', () => {
    const filas = derivarCuadreLegacy({
      saldoCierre: 5608.06, saldoFisico: 6438.00,
      ventasTarjeta: 2605.00, ventasTransferencia: 0,
      desglosePago: { efectivo: '6438.00', tarjetaDebito: '1775.00' },
    });
    expect(filas.find(f => f.forma === 'efectivo')).toEqual(
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
    );
    expect(filas.find(f => f.forma === 'tarjeta')).toEqual(
      { forma: 'tarjeta', esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    );
    expect(detectarPosibleFormaMalRegistrada(filas, 1)).toEqual([
      { formaSobrante: 'efectivo', formaFaltante: 'tarjeta', monto: 829.94, montoSobrante: 829.94, montoFaltante: -830.00 },
    ]);
  });

  it('también suma tarjetaCredito/tarjeta (unificado) al mismo bucket — compatibilidad con cualquier variante histórica', () => {
    const filas = derivarCuadreLegacy({
      saldoCierre: 0, saldoFisico: 0, ventasTarjeta: 300, ventasTransferencia: 0,
      desglosePago: { tarjetaCredito: '100', tarjetaDebito: '100', tarjeta: '100' },
    });
    expect(filas.find(f => f.forma === 'tarjeta')?.declarado).toBe(300);
  });

  it('transferencia agrupa cheque y depósito, otros agrupa otro y documentos — sin desglosePago, todo en cero', () => {
    const filas = derivarCuadreLegacy({
      saldoCierre: 100, saldoFisico: 100, ventasTarjeta: 0, ventasTransferencia: 50, ventasCredito: 20,
      desglosePago: { cheque: '30', deposito: '20', otro: '5', documentos: '15' },
    });
    expect(filas.find(f => f.forma === 'transferencia')).toMatchObject({ esperado: 50, declarado: 50 });
    expect(filas.find(f => f.forma === 'otros')).toMatchObject({ esperado: 20, declarado: 20 });
  });

  it('sin desglosePago (cierre muy viejo): no revienta, todo declarado en cero salvo efectivo', () => {
    const filas = derivarCuadreLegacy({ saldoCierre: 500, saldoFisico: 500, ventasTarjeta: 0, ventasTransferencia: 0 });
    expect(filas.find(f => f.forma === 'efectivo')).toEqual({ forma: 'efectivo', esperado: 500, declarado: 500, diferencia: 0 });
    expect(filas.filter(f => f.forma !== 'efectivo').every(f => f.esperado === 0 && f.declarado === 0)).toBe(true);
  });
});

describe('aplicarAjustesAlCuadre — cuadre corregido tras arreglar la forma de pago de una factura', () => {
  it('invierte el sobrante/faltante del caso real cuando se corrige FAC-1803 (Tarjeta 955 + Efectivo 125 → Efectivo 955 + Tarjeta 125)', () => {
    const original = construirCuadrePorForma(
      { efectivo: 5608.06, tarjeta: 2605.00 },
      { efectivo: 6438.00, tarjeta: 1775.00 },
    );
    const corregido = aplicarAjustesAlCuadre(original, [{
      formasPagoAnterior: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }],
      formasPagoNuevo:    [{ tipo: 1, monto: 955 }, { tipo: 3, monto: 125 }],
    }]);
    // efectivo esperado sube 830 (pierde 125, gana 955 netos +830), tarjeta esperado baja 830 — el declarado no cambia.
    expect(corregido.find(f => f.forma === 'efectivo')).toEqual(
      { forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 },
    );
    expect(corregido.find(f => f.forma === 'tarjeta')).toEqual(
      { forma: 'tarjeta', esperado: 1775.00, declarado: 1775.00, diferencia: 0 },
    );
    expect(detectarPosibleFormaMalRegistrada(corregido, 1)).toEqual([]);
  });

  it('sin ajustes, el cuadre corregido es idéntico al original', () => {
    const original = construirCuadrePorForma({ efectivo: 100 }, { efectivo: 90 });
    expect(aplicarAjustesAlCuadre(original, [])).toEqual(original);
  });

  it('un ajuste que no toca una forma presente en el cuadre original la deja sin cambios', () => {
    const original = construirCuadrePorForma({ efectivo: 100, transferencia: 50 }, { efectivo: 100, transferencia: 50 });
    const corregido = aplicarAjustesAlCuadre(original, [{
      formasPagoAnterior: [{ tipo: 3, monto: 20 }],
      formasPagoNuevo:    [{ tipo: 1, monto: 20 }],
    }]);
    expect(corregido.find(f => f.forma === 'transferencia')).toEqual({ forma: 'transferencia', esperado: 50, declarado: 50, diferencia: 0 });
  });
});
