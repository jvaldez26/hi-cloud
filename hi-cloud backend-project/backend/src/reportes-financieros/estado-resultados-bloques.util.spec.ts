import { construirEstadoResultados, aplanarEstadoResultados, CuentaSaldo } from './estado-resultados-bloques.util';
import { CuentaClasificable } from './clasificacion-resultado.util';

function saldo(codigo: string, nombre: string, tipo: string, saldoMonto: number): CuentaSaldo {
  return { codigo, nombre, tipo, saldo: saldoMonto };
}

function cuenta(p: Partial<CuentaClasificable> & { id: number; codigo: string }): CuentaClasificable {
  return { cuentaPadreId: null, clasificacionResultado: null, ...p };
}

describe('construirEstadoResultados', () => {
  it('Ingresos en 0: todos los % dan 0 (nunca NaN/Infinity)', () => {
    const er = construirEstadoResultados([], [], true);
    expect(er.ingresos.total).toBe(0);
    expect(er.ingresos.porcentajeIngresos).toBe(0);
    expect(er.utilidadBruta.porcentajeIngresos).toBe(0);
    expect(er.utilidadBruta.porcentajeMargen).toBe(0);
    expect(er.gananciaPerdidaDelPeriodo.porcentajeMargen).toBe(0);
    expect(Number.isFinite(er.ingresos.porcentajeIngresos)).toBe(true);
  });

  it('pérdida del período: monto negativo, sin formatear (el signo y paréntesis son del frontend)', () => {
    const saldos = [
      saldo('4.1.1.01', 'Ventas', 'ingreso', 1000),
      saldo('6.1.2.01', 'Alquiler', 'gasto', 5000),
    ];
    const er = construirEstadoResultados(saldos, [], true);
    expect(er.gananciaPerdidaDelPeriodo.monto).toBe(-4000);
    expect(er.resultadoOperacional.monto).toBe(-4000);
    // % margen negativo también es válido — -400% de margen sobre 1000 de ingresos
    expect(er.gananciaPerdidaDelPeriodo.porcentajeMargen).toBe(-400);
  });

  it('cuenta de costo vs gasto: cada una en su bloque correcto, nunca mezcladas', () => {
    const saldos = [
      saldo('4.1.1.01', 'Ventas', 'ingreso', 10000),
      saldo('5.1.1.01', 'Costo de Ventas de Bienes', 'costo', 4000),
      saldo('6.1.2.01', 'Alquiler', 'gasto', 1000),
    ];
    const er = construirEstadoResultados(saldos, [], true);
    expect(er.costoDeVentas.cuentas.map(c => c.codigo)).toEqual(['5.1.1.01']);
    expect(er.gastos.cuentas.map(c => c.codigo)).toEqual(['6.1.2.01']);
    expect(er.costoDeVentas.total).toBe(4000);
    expect(er.gastos.total).toBe(1000);
    expect(er.utilidadBruta.monto).toBe(6000);   // 10000 - 4000
    expect(er.resultadoOperacional.monto).toBe(5000); // 6000 - 1000
  });

  it('ingreso/gasto operacional vs no operacional (herencia): cada uno en Ingresos/Otros Ingresos o Gastos/Otros Gastos', () => {
    const catalogo = [
      cuenta({ id: 1, codigo: '4.2', clasificacionResultado: 'no_operacional' }),
      cuenta({ id: 2, codigo: '4.2.1.03', cuentaPadreId: 1 }), // Intereses Ganados — hereda no_operacional
    ];
    const saldos = [
      saldo('4.1.1.01', 'Ventas', 'ingreso', 10000),
      saldo('4.2.1.03', 'Intereses Ganados', 'ingreso', 500),
    ];
    const er = construirEstadoResultados(saldos, catalogo, true);
    expect(er.ingresos.cuentas.map(c => c.codigo)).toEqual(['4.1.1.01']);
    expect(er.otrosIngresos.cuentas.map(c => c.codigo)).toEqual(['4.2.1.03']);
    // El % de Otros Ingresos se calcula sobre el Total de Ingresos OPERACIONALES, no sobre 10500.
    expect(er.ingresos.total).toBe(10000);
    expect(er.otrosIngresos.cuentas[0].porcentajeIngresos).toBe(5); // 500/10000
  });

  it('contraingreso (Descuentos en Ventas, saldo negativo) reduce el total del bloque Ingresos', () => {
    const saldos = [
      saldo('4.1.1.01', 'Ventas de Bienes', 'ingreso', 10000),
      saldo('4.1.1.03', 'Descuentos en Ventas', 'ingreso', -300), // naturaleza deudora en cuenta ingreso → saldo negativo
    ];
    const er = construirEstadoResultados(saldos, [], true);
    expect(er.ingresos.total).toBe(9700);
  });

  it('ocultarCuentasEnCero: una cuenta con saldo 0 no aparece cuando está activo', () => {
    const saldos = [saldo('4.1.1.01', 'Ventas', 'ingreso', 10000), saldo('4.1.1.02', 'Servicios', 'ingreso', 0)];
    const conOcultar = construirEstadoResultados(saldos, [], true);
    expect(conOcultar.ingresos.cuentas.map(c => c.codigo)).toEqual(['4.1.1.01']);
    const sinOcultar = construirEstadoResultados(saldos, [], false);
    expect(sinOcultar.ingresos.cuentas.map(c => c.codigo).sort()).toEqual(['4.1.1.01', '4.1.1.02']);
  });

  it('cuenta huérfana en el catálogo (madre no está) → operacional, no rompe la construcción', () => {
    const catalogo = [cuenta({ id: 1, codigo: '6.1.1.04', cuentaPadreId: 999 })];
    const saldos = [saldo('6.1.1.04', 'Horas Extras', 'gasto', 100)];
    expect(() => construirEstadoResultados(saldos, catalogo, true)).not.toThrow();
    const er = construirEstadoResultados(saldos, catalogo, true);
    expect(er.gastos.cuentas.map(c => c.codigo)).toEqual(['6.1.1.04']); // operacional por default
  });

  it('% Margen es null en bloques y en las cuentas — solo las 3 líneas de resultado lo llevan', () => {
    const saldos = [saldo('4.1.1.01', 'Ventas', 'ingreso', 1000)];
    const er = construirEstadoResultados(saldos, [], true);
    expect(er.utilidadBruta.porcentajeMargen).not.toBeNull();
    expect(er.resultadoOperacional.porcentajeMargen).not.toBeNull();
    expect(er.gananciaPerdidaDelPeriodo.porcentajeMargen).not.toBeNull();
  });
});

describe('aplanarEstadoResultados', () => {
  it('respeta el orden exacto de la estructura y marca totales/líneas calculadas', () => {
    const saldos = [
      saldo('4.1.1.01', 'Ventas', 'ingreso', 10000),
      saldo('5.1.1.01', 'Costo de Ventas', 'costo', 4000),
      saldo('6.1.2.01', 'Alquiler', 'gasto', 1000),
    ];
    const er = construirEstadoResultados(saldos, [], true);
    const filas = aplanarEstadoResultados(er);

    expect(filas.map(f => f.nombre)).toEqual([
      'Ventas', 'Total Ingresos',
      'Costo de Ventas', 'Total Costo de Ventas',
      'UTILIDAD BRUTA',
      'Alquiler', 'Total Gastos',
      'RESULTADO OPERACIONAL',
      'Total Otros Ingresos',
      'Total Otros Gastos',
      'GANANCIA (PÉRDIDA) DEL PERÍODO',
    ]);
    expect(filas.filter(f => f.esTotal).every(f => f.monto !== undefined)).toBe(true);
    expect(filas.find(f => f.nombre === 'UTILIDAD BRUTA')?.esLineaCalculada).toBe(true);
    expect(filas.find(f => f.nombre === 'Ventas')?.esTotal).toBe(false);
  });
});
