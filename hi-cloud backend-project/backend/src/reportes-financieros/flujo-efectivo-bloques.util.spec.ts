/**
 * Estado de Flujo de Efectivo — "regla de oro" (2026-09-22, ampliado tras el
 * barrido de catálogo del mismo día): Efectivo al Inicio + Cambio Neto en el
 * Efectivo DEBE dar exactamente Efectivo al Final. Si no cuadra, hay una
 * cuenta de flujo mal clasificada o falta una — por eso cada escenario aquí
 * parte de un balance de apertura/cierre COHERENTE (la única cuenta que
 * cambia entre saldosInicio y saldosFin es la que el escenario describe, más
 * el efectivo que ese movimiento mueve), no solo números sueltos.
 */

import { construirFlujoEfectivo, type CuentaSaldoFlujo } from './flujo-efectivo-bloques.util';

const cta = (codigo: string, nombre: string, tipo: string, naturaleza: 'deudora' | 'acreedora', saldo: number): CuentaSaldoFlujo =>
  ({ codigo, nombre, tipo, naturaleza, saldo });

// Balance base: efectivo 100,000, sin ninguna otra cuenta con movimiento.
const BASE_INICIO: CuentaSaldoFlujo[] = [cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 100_000)];

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
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 150_000), // +50,000 en efectivo
      cta('2.2.1.01', 'Préstamos Bancarios LP', 'pasivo', 'acreedora', 50_000), // +50,000 en préstamos
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
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 70_000), // −30,000 en efectivo
      cta('1.2.1.02', 'Equipos de Cómputo', 'activo', 'deudora', 30_000), // +30,000 en activo fijo
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

  it('depreciación del período de 5,000: se suma de vuelta al Resultado Neto, NO mueve efectivo por sí sola, y la acumulada (1.2.2) queda EXCLUIDA a propósito', () => {
    const saldosInicio: CuentaSaldoFlujo[] = [
      ...BASE_INICIO,
      cta('1.2.2.03', 'Depreciación Acumulada - Equipos', 'activo', 'acreedora', 2_000),
    ];
    // La acumulada SÍ sube 5,000 (crédito de la partida de depreciación) — si
    // esto rompiera la regla de oro sin una línea propia, sería la prueba de
    // que hace falta cubrirla. No la rompe: el gasto ya se sumó de vuelta.
    const saldosFin: CuentaSaldoFlujo[] = [
      ...BASE_INICIO,
      cta('1.2.2.03', 'Depreciación Acumulada - Equipos', 'activo', 'acreedora', 7_000),
    ];
    const saldosPeriodo: CuentaSaldoFlujo[] = [
      cta('6.2.1.03', 'Depreciación - Equipos', 'gasto', 'deudora', 5_000),
    ];
    const r = construirFlujoEfectivo(saldosInicio, saldosFin, saldosPeriodo);

    const lineaDeprec = r.operaciones.lineas.find(l => l.nombre === 'Depreciaciones del período')!;
    expect(lineaDeprec.monto).toBe(5_000);
    // Resultado Neto = 0 − 0 − 5000 (el gasto de depreciación) = −5000; se compensa
    // exactamente con el ajuste de +5000 → operaciones.total = 0, cuadra con
    // que el efectivo tampoco se movió — SIN ninguna línea para 1.2.2.
    expect(r.resultadoNeto).toBe(-5_000);
    expect(r.operaciones.total).toBe(0);
    expect(r.cambioNetoEfectivo).toBe(0);
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.cuadrado).toBe(true);
  });

  it('capital SIN cambio: la línea "Aumento en Capital" da 0 — no aparece como financiamiento', () => {
    const saldosInicioConCapital: CuentaSaldoFlujo[] = [
      ...BASE_INICIO,
      cta('3.1.1.01', 'Capital Suscrito y Pagado', 'patrimonio', 'acreedora', 200_000),
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
      cta('3.2.1.01', 'Utilidades Acumuladas', 'patrimonio', 'acreedora', 40_000), // solo en saldosFin — no debe tocar la línea de Capital
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const lineaCapital = r.financiamientos.lineas.find(l => l.nombre === 'Aumento en Capital')!;
    expect(lineaCapital.monto).toBe(0);
  });

  it('escenario combinado: préstamo nuevo + compra de activo fijo + depreciación + capital sin cambio — cuadra igual', () => {
    const saldosInicio: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 100_000),
      cta('3.1.1.01', 'Capital Suscrito y Pagado', 'patrimonio', 'acreedora', 200_000),
      cta('1.2.1.02', 'Equipos de Cómputo', 'activo', 'deudora', 10_000),
      cta('1.2.2.03', 'Depreciación Acumulada - Equipos', 'activo', 'acreedora', 2_000),
    ];
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 120_000), // 100,000 +50,000 −30,000
      cta('3.1.1.01', 'Capital Suscrito y Pagado', 'patrimonio', 'acreedora', 200_000), // sin cambio
      cta('2.2.1.01', 'Préstamos Bancarios LP', 'pasivo', 'acreedora', 50_000),
      cta('1.2.1.02', 'Equipos de Cómputo', 'activo', 'deudora', 40_000), // 10,000 + compra de 30,000
      cta('1.2.2.03', 'Depreciación Acumulada - Equipos', 'activo', 'acreedora', 7_000), // 2,000 + 5,000
    ];
    const saldosPeriodo: CuentaSaldoFlujo[] = [
      cta('6.2.1.03', 'Depreciación - Equipos', 'gasto', 'deudora', 5_000),
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
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 80_000), // −20,000 en efectivo
      cta('1.1.4.01', 'ITBIS Crédito Fiscal (Compras)', 'activo', 'deudora', 20_000), // +20,000 en crédito fiscal
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const lineaImpAnticipados = r.operaciones.lineas.find(l => l.nombre === 'Aumento en Impuestos Anticipados')!;
    expect(lineaImpAnticipados.monto).toBe(-20_000); // invertido: acumular más crédito fiscal USA efectivo
    expect(r.cambioNetoEfectivo).toBe(-20_000);
    expect(r.efectivoFin).toBe(80_000);
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.cuadrado).toBe(true);
  });

  it('barrido de catálogo 2026-09-22: las 8 líneas nuevas (Otras CxC, Otros Inventarios, Gastos Anticipados, Otras CxP, Otras Retenciones, Nómina y Cargas Sociales, Otros Pasivos Corrientes) cuadran, todas juntas', () => {
    const saldosInicio: CuentaSaldoFlujo[] = [cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 500_000)];
    const saldosFin: CuentaSaldoFlujo[] = [
      // Efectivo: 500,000 − 10,000(CxCotras) − 3,000(Invotros) − 2,000(GastosAnt) + 4,000(CxPotras)
      //   + 1,000(Retenciones) + 6,000(Nómina) + 2,500(OtrosPasivos) = 498,500
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 498_500),
      cta('1.1.2.03', 'CxC Empleados', 'activo', 'deudora', 10_000),                    // Otras CxC, +10,000 → usa efectivo
      cta('1.1.3.03', 'Inventario de Productos Terminados', 'activo', 'deudora', 3_000), // Otros Inventarios, +3,000 → usa efectivo
      cta('1.1.6.01', 'Seguros Pagados por Anticipado', 'activo', 'deudora', 2_000),     // Gastos Anticipados, +2,000 → usa efectivo
      cta('2.1.1.02', 'Tarjeta de Crédito', 'pasivo', 'acreedora', 4_000),               // Otras CxP, +4,000 → fuente
      cta('2.1.2.03', 'Retenciones por Pagar', 'pasivo', 'acreedora', 1_000),            // Otras Retenciones, +1,000 → fuente
      cta('2.1.3.02', 'TSS por Pagar', 'pasivo', 'acreedora', 6_000),                    // Nómina y Cargas Sociales, +6,000 → fuente
      cta('2.1.5.01', 'Anticipos Recibidos de Clientes', 'pasivo', 'acreedora', 2_500),  // Otros Pasivos Corrientes, +2,500 → fuente
    ];
    const r = construirFlujoEfectivo(saldosInicio, saldosFin, []);

    expect(r.operaciones.lineas.find(l => l.nombre === 'Aumento en Otras Cuentas por Cobrar')!.monto).toBe(-10_000);
    expect(r.operaciones.lineas.find(l => l.nombre === 'Aumento en Otros Inventarios')!.monto).toBe(-3_000);
    expect(r.operaciones.lineas.find(l => l.nombre === 'Aumento en Gastos Pagados por Anticipado')!.monto).toBe(-2_000);
    expect(r.operaciones.lineas.find(l => l.nombre === 'Aumento en Otras Cuentas por Pagar')!.monto).toBe(4_000);
    expect(r.operaciones.lineas.find(l => l.nombre === 'Aumento en Otras Retenciones por Pagar')!.monto).toBe(1_000);
    expect(r.operaciones.lineas.find(l => l.nombre === 'Aumento en Nómina y Cargas Sociales por Pagar')!.monto).toBe(6_000);
    expect(r.operaciones.lineas.find(l => l.nombre === 'Aumento en Otros Pasivos Corrientes')!.monto).toBe(2_500);

    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.diferenciaCuadre).toBe(0);
    expect(r.cuadrado).toBe(true);
  });

  it('cuenta CONTRA dentro de un grupo mixto: Provisión para Cuentas Incobrables (1.1.2.06, acreedora) se firma por SU PROPIA naturaleza, no por la del grupo (mayormente deudora)', () => {
    const saldosInicio: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 100_000),
      cta('1.1.2.06', 'Provisión para Cuentas Incobrables', 'activo', 'acreedora', 1_000),
    ];
    // La provisión SUBE 500 (más reserva) — eso es una FUENTE en términos de
    // la identidad contable (misma dirección que un pasivo creciendo), no un
    // uso: si se firmara con -1 (como el resto del grupo, deudora), la regla
    // de oro NO cuadraría.
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 100_500),
      cta('1.1.2.06', 'Provisión para Cuentas Incobrables', 'activo', 'acreedora', 1_500),
    ];
    const r = construirFlujoEfectivo(saldosInicio, saldosFin, []);

    const lineaOtrasCxC = r.operaciones.lineas.find(l => l.nombre === 'Aumento en Otras Cuentas por Cobrar')!;
    expect(lineaOtrasCxC.monto).toBe(500); // +1 (acreedora), no -1
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.cuadrado).toBe(true);
  });

  it('catch-all: una cuenta de balance SIN línea nombrada ni conocida igual cuadra — "Otras variaciones de activos y pasivos"', () => {
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 91_000), // −9,000 en efectivo
      cta('9.9.9.01', 'Cuenta Inventada Sin Línea Propia', 'pasivo', 'deudora', 9_000), // pasivo, pero naturaleza deudora (caso raro) → -1
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const catchAll = r.operaciones.lineas.find(l => l.nombre === 'Otras variaciones de activos y pasivos')!;
    expect(catchAll.monto).toBe(-9_000);
    expect(catchAll.cuentas).toEqual([{ codigo: '9.9.9.01', nombre: 'Cuenta Inventada Sin Línea Propia', monto: -9_000 }]);
    expect(r.efectivoInicio + r.cambioNetoEfectivo).toBe(r.efectivoFin);
    expect(r.cuadrado).toBe(true);
  });

  it('catch-all NUNCA incluye Depreciación Acumulada (1.2.2) — seguiría duplicando el ajuste', () => {
    const saldosInicio: CuentaSaldoFlujo[] = [
      ...BASE_INICIO,
      cta('1.2.2.05', 'Depreciación Acumulada - Vehículos Pesados', 'activo', 'acreedora', 1_000),
    ];
    const saldosFin: CuentaSaldoFlujo[] = [
      ...BASE_INICIO,
      cta('1.2.2.05', 'Depreciación Acumulada - Vehículos Pesados', 'activo', 'acreedora', 4_000),
    ];
    const saldosPeriodo: CuentaSaldoFlujo[] = [cta('6.2.1.05', 'Depreciación - Vehículos Pesados', 'gasto', 'deudora', 3_000)];
    const r = construirFlujoEfectivo(saldosInicio, saldosFin, saldosPeriodo);

    const catchAll = r.operaciones.lineas.find(l => l.nombre === 'Otras variaciones de activos y pasivos')!;
    expect(catchAll.monto).toBe(0);
    expect(catchAll.cuentas).toEqual([]);
    expect(r.cuadrado).toBe(true);
  });

  it('vista Detallado: cada línea de variación de balance trae sus cuentas individuales con el signo ya aplicado', () => {
    const saldosFin: CuentaSaldoFlujo[] = [
      cta('1.1.1.02', 'Caja General', 'activo', 'deudora', 80_000),
      cta('1.1.2.01', 'Clientes', 'activo', 'deudora', 20_000), // aumento de CxC → usa efectivo
    ];
    const r = construirFlujoEfectivo(BASE_INICIO, saldosFin, []);

    const lineaCxC = r.operaciones.lineas.find(l => l.nombre === 'Aumento en Cuentas por Cobrar')!;
    expect(lineaCxC.monto).toBe(-20_000);
    expect(lineaCxC.cuentas).toEqual([{ codigo: '1.1.2.01', nombre: 'Clientes', monto: -20_000 }]);
  });
});
