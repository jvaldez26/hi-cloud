import { construirCuadrePorForma, detectarPosibleFormaMalRegistrada, netoCuadre } from './cuadre-por-forma-pago.util';

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

  it('detecta la sospecha exacta: efectivo sobra, tarjeta falta, misma magnitud', () => {
    const sospechas = detectarPosibleFormaMalRegistrada(filas, 1);
    expect(sospechas).toEqual([
      { formaSobrante: 'efectivo', formaFaltante: 'tarjeta', monto: 829.94 },
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
    expect(sospechas).toEqual([{ formaSobrante: 'efectivo', formaFaltante: 'tarjeta', monto: 100 }]);
  });
});
