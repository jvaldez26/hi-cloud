/**
 * Estado de Flujo de Efectivo — "regla de oro" (2026-09-22):
 * Efectivo al Inicio + Cambio Neto en el Efectivo DEBE dar exactamente
 * Efectivo al Final. Si no cuadra, hay una cuenta de flujo mal clasificada
 * o falta una — por eso cada escenario aquí parte de un balance de
 * apertura/cierre COHERENTE (la única cuenta que cambia entre saldosInicio
 * y saldosFin es la que el escenario describe, más el efectivo que ese
 * movimiento mueve), no solo números sueltos.
 */

import { construirFlujoEfectivo, type CuentaSaldoFlujo } from './flujo-efectivo-bloques.util';

const cta = (codigo: string, nombre: string, tipo: string, saldo: number): CuentaSaldoFlujo =>
  ({ codigo, nombre, tipo, saldo });

// Balance base: efectivo 100,000, sin ninguna otra cuenta con movimiento.
const BASE_INICIO: CuentaSaldoFlujo[] = [cta('1.1.1.02', 'Caja General', 'activo', 100_000)];

describe('construirFlujoEfectivo() — regla de oro: Inicio + Cambio Neto = Final', () => {
  it('período sin ningún movimiento: todo en cero, sin error', () => {
    const r = construirFlujoEfectivo(BASE_INICIO, BASE_INICIO, []);

    expect(r.resultadoNeto).toBe(0);
    expect(r.operaciones.total).toBe(0);
    expect(r.inversiones.total).toBe(0);
    expect(r.financiamientos.total).toBe(0);
    expect(r.cambioNetoEfectivo).toBe(0);
    expect(r.efectivoInicio).toBe(100_000);
    expect(r.efectivoFin).toBe(100_000);
    expect(r.diferenciaCuadre).toBe(0);
    expect(r.cuadrado).toBe(true);
  });

  it('préstamo bancario nuevo de 50,000: entra a financiamientos, efectivo aumenta igual', () => {
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 150_000), // +50,000 en efectivo
      cta('2.2.1.01', 'Préstamos Bancarios LP', 'pasivo', 50_000), // +50,000 en préstamos
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const lineaPrestamo = r.financiamientos.lineas.find(l => l.nombre === 'Aumento en Préstamos')!;
    expect(lineaPrestamo.monto).toBe(50_000);
    expect(r.financiamientos.total).toBe(50_000);
    expect(r.cambioNetoEfectivo).toBe(50_000);
    expect(r.efectivoFin).toBe(150_000);
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.cuadrado).toBe(true);
  });

  it('compra de activo fijo de 30,000 al contado: usa efectivo, sale en inversiones', () => {
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 70_000), // −30,000 en efectivo
      cta('1.2.1.02', 'Equipos de Cómputo', 'activo', 30_000), // +30,000 en activo fijo
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const lineaActivoFijo = r.inversiones.lineas.find(l => l.nombre === 'Aumento en Propiedades y Equipos')!;
    expect(lineaActivoFijo.monto).toBe(-30_000); // invertido: compra USA efectivo
    expect(r.inversiones.total).toBe(-30_000);
    expect(r.cambioNetoEfectivo).toBe(-30_000);
    expect(r.efectivoFin).toBe(70_000);
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.cuadrado).toBe(true);
  });

  it('depreciación del período de 5,000: se suma de vuelta al Resultado Neto, NO mueve efectivo por sí sola', () => {
    // Resultado Neto = 0 (sin ingresos/gastos más allá de la depreciación en sí,
    // que YA está descontada del resultado neto vía el gasto — se sube de vuelta).
    const saldosPeriodo: CuentaSaldoFlujo[] = [
      cta('6.2.1.03', 'Depreciación - Equipos', 'gasto', 5_000),
    ];
    // La depreciación es un gasto NO monetario: reduce el resultado (vía P&L,
    // ya reflejado en saldosPeriodo) pero incrementa la depreciación acumulada
    // (contra-activo, 1.2.2), no el efectivo — por eso el balance de apertura/
    // cierre de efectivo NO se mueve en este escenario.
    const r = construirFlujoEfectivo(BASE_INICIO, BASE_INICIO, saldosPeriodo);

    const lineaDeprec = r.operaciones.lineas.find(l => l.nombre === 'Depreciaciones del período')!;
    expect(lineaDeprec.monto).toBe(5_000);
    // Resultado Neto = 0 − 0 − 5000 (el gasto de depreciación) = −5000; se compensa
    // exactamente con el ajuste de +5000 → operaciones.total = 0, cuadra con
    // que el efectivo tampoco se movió.
    expect(r.resultadoNeto).toBe(-5_000);
    expect(r.operaciones.total).toBe(0);
    expect(r.cambioNetoEfectivo).toBe(0);
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.cuadrado).toBe(true);
  });

  it('capital SIN cambio: la línea "Aumento en Capital" da 0 — no aparece como financiamiento', () => {
    const saldosInicioConCapital: CuentaSaldoFlujo[] = [
      ...BASE_INICIO,
      cta('3.1.1.01', 'Capital Suscrito y Pagado', 'patrimonio', 200_000),
    ];
    const r = construirFlujoEfectivo(saldosInicioConCapital, saldosInicioConCapital, []);

    const lineaCapital = r.financiamientos.lineas.find(l => l.nombre === 'Aumento en Capital')!;
    expect(lineaCapital.monto).toBe(0);
    expect(r.financiamientos.total).toBe(0);
    expect(r.cuadrado).toBe(true);
  });

  it('utilidades acumuladas (3.2) NO cuentan como capital — solo 3.1 entra en "Aumento en Capital"', () => {
    const saldosFin: CuentaSaldoFlujo[] = [
      ...BASE_INICIO,
      cta('3.2.1.01', 'Utilidades Acumuladas', 'patrimonio', 40_000), // solo en saldosFin — no debe tocar la línea de Capital
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const lineaCapital = r.financiamientos.lineas.find(l => l.nombre === 'Aumento en Capital')!;
    expect(lineaCapital.monto).toBe(0);
  });

  it('escenario combinado: préstamo nuevo + compra de activo fijo + depreciación + capital sin cambio — cuadra igual', () => {
    const saldosInicio: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 100_000),
      cta('3.1.1.01', 'Capital Suscrito y Pagado', 'patrimonio', 200_000),
      cta('1.2.1.02', 'Equipos de Cómputo', 'activo', 10_000),
      cta('1.2.2.03', 'Depreciación Acumulada - Equipos', 'activo', 2_000),
    ];
    // Préstamo +50,000 (efectivo +50,000); compra de activo fijo +30,000 (efectivo −30,000);
    // depreciación del período 5,000 (sube la acumulada, no toca efectivo); capital sin cambio.
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 120_000), // 100,000 +50,000 −30,000
      cta('3.1.1.01', 'Capital Suscrito y Pagado', 'patrimonio', 200_000), // sin cambio
      cta('2.2.1.01', 'Préstamos Bancarios LP', 'pasivo', 50_000),
      cta('1.2.1.02', 'Equipos de Cómputo', 'activo', 40_000), // 10,000 + compra de 30,000
      cta('1.2.2.03', 'Depreciación Acumulada - Equipos', 'activo', 7_000), // 2,000 + 5,000
    ];
    const saldosPeriodo: CuentaSaldoFlujo[] = [
      cta('6.2.1.03', 'Depreciación - Equipos', 'gasto', 5_000),
    ];

    const r = construirFlujoEfectivo(saldosInicio, saldosFin, saldosPeriodo);

    expect(r.financiamientos.lineas.find(l => l.nombre === 'Aumento en Préstamos')!.monto).toBe(50_000);
    expect(r.financiamientos.lineas.find(l => l.nombre === 'Aumento en Capital')!.monto).toBe(0);
    expect(r.inversiones.lineas.find(l => l.nombre === 'Aumento en Propiedades y Equipos')!.monto).toBe(-30_000);
    expect(r.operaciones.lineas.find(l => l.nombre === 'Depreciaciones del período')!.monto).toBe(5_000);

    expect(r.efectivoInicio).toBe(100_000);
    expect(r.efectivoFin).toBe(120_000);
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.diferenciaCuadre).toBe(0);
    expect(r.cuadrado).toBe(true);
  });

  it('aumento en ITBIS Crédito Fiscal (Impuestos Anticipados, 1.1.4): usa efectivo — bug real encontrado el 2026-09-22', () => {
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 80_000), // −20,000 en efectivo
      cta('1.1.4.01', 'ITBIS Crédito Fiscal (Compras)', 'activo', 20_000), // +20,000 en crédito fiscal
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const lineaImpAnticipados = r.operaciones.lineas.find(l => l.nombre === 'Aumento en Impuestos Anticipados')!;
    expect(lineaImpAnticipados.monto).toBe(-20_000); // invertido: acumular más crédito fiscal USA efectivo
    expect(r.cambioNetoEfectivo).toBe(-20_000);
    expect(r.efectivoFin).toBe(80_000);
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.cuadrado).toBe(true);
  });

  it('vista Detallado: cada línea de variación de balance trae sus cuentas individuales con el signo ya aplicado', () => {
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 80_000),
      cta('1.1.2.01', 'Clientes', 'activo', 20_000), // aumento de CxC → usa efectivo
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const lineaCxC = r.operaciones.lineas.find(l => l.nombre === 'Aumento en Cuentas por Cobrar')!;
    expect(lineaCxC.monto).toBe(-20_000);
    expect(lineaCxC.cuentas).toEqual([{ codigo: '1.1.2.01', nombre: 'Clientes', monto: -20_000 }]);
  });
});
