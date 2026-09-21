/**
 * Enriquecimiento del catálogo (2026-09-21) — un catálogo de referencia de
 * otro ERP incorporado dentro de la jerarquía 1.x.x.xx ya existente de
 * HiCloud. NINGÚN código existente cambia — solo se agregan cuentas nuevas
 * (y se etiqueta clasificacionResultado en 4 cuentas madre ya existentes:
 * 4.1.3, 4.2, 6.1.3, 6.1.5).
 *
 * Este archivo prueba lo que pidió el encargo, sin BD:
 *   1. El seed "cuadra" — sin duplicados, sin huérfanas (cuentaPadreId se
 *      resuelve por prefijo de código; una madre que nunca se sembró deja a
 *      la hija sin padre real).
 *   2. Naturaleza correcta en TODAS las contra-cuentas — el punto que el
 *      encargo pidió probar "uno por uno".
 *   3. El motor de asientos automáticos sigue encontrando todos sus COD.*
 *      (ningún código que el motor referencia por literal se movió).
 */

import { PLAN_CUENTAS } from './contabilidad.service';
import { COD } from './asientos-automaticos.service';
import { TipoCuenta, NaturalezaCuenta, ClasificacionResultado } from '../entities/cuenta-contable.entity';

function porCodigo(codigo: string) {
  const c = PLAN_CUENTAS.find(x => x.codigo === codigo);
  if (!c) throw new Error(`Cuenta ${codigo} no está en el seed`);
  return c;
}

describe('PLAN_CUENTAS — seed cuadra (estructura)', () => {
  it('ningún código se repite', () => {
    const codigos = PLAN_CUENTAS.map(c => c.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('toda cuenta que no es raíz (nivel 1) tiene su madre real en el catálogo — cuentaPadreId se resuelve por prefijo de código', () => {
    const codigos = new Set(PLAN_CUENTAS.map(c => c.codigo));
    const huerfanas: string[] = [];
    for (const c of PLAN_CUENTAS) {
      const partes = c.codigo.split('.');
      if (partes.length === 1) continue; // raíz, sin madre
      const codigoMadre = partes.slice(0, -1).join('.');
      if (!codigos.has(codigoMadre)) huerfanas.push(`${c.codigo} (madre esperada: ${codigoMadre})`);
    }
    expect(huerfanas).toEqual([]);
  });

  it('toda cuenta de agrupación (permiteMovimientos=false) tiene al menos una hija — no hay grupos vacíos nuevos', () => {
    const codigos = PLAN_CUENTAS.map(c => c.codigo);
    const grupoSinHijas = PLAN_CUENTAS.filter(c =>
      !c.permiteMovimientos && !codigos.some(otro => otro !== c.codigo && otro.startsWith(c.codigo + '.')),
    );
    // '2.1.4 Otras Cuentas por Pagar CP' ya existía sin hijas ANTES de este
    // encargo — se le agregaron 2.1.4.01/.02 en este mismo commit, así que
    // ya no debería aparecer aquí. Si algo más aparece, es un grupo nuevo
    // sin ninguna cuenta real — revisar.
    expect(grupoSinHijas.map(c => c.codigo)).toEqual([]);
  });
});

describe('PLAN_CUENTAS — naturaleza de las contra-cuentas (uno por uno)', () => {
  it('Provisión para Cuentas Incobrables (1.1.2.06) — activo, ACREEDORA (reduce Cuentas por Cobrar)', () => {
    const c = porCodigo('1.1.2.06');
    expect(c.tipo).toBe(TipoCuenta.ACTIVO);
    expect(c.naturaleza).toBe(NaturalezaCuenta.ACREEDORA);
  });

  it.each([
    ['1.2.2.01', 'Deprec. Acumulada Activos Fijos'],
    ['1.2.2.02', 'Depreciación Acumulada - Edificios'],
    ['1.2.2.03', 'Depreciación Acumulada - Equipos'],
    ['1.2.2.04', 'Depreciación Acumulada - Vehículos Livianos'],
    ['1.2.2.05', 'Depreciación Acumulada - Vehículos Pesados'],
    ['1.2.2.06', 'Depreciación Acumulada - Mejoras a Propiedad Arrendada'],
  ])('Depreciación Acumulada %s (%s) — activo, ACREEDORA (reduce el activo fijo)', (codigo) => {
    const c = porCodigo(codigo);
    expect(c.tipo).toBe(TipoCuenta.ACTIVO);
    expect(c.naturaleza).toBe(NaturalezaCuenta.ACREEDORA);
  });

  it.each([
    ['4.1.1.03', 'Descuentos en Ventas'],
    ['4.1.1.04', 'Devoluciones en Ventas'],
  ])('%s (%s) — CONTRAINGRESO: tipo ingreso, naturaleza DEUDORA (reduce Ventas, que es acreedora)', (codigo) => {
    const c = porCodigo(codigo);
    expect(c.tipo).toBe(TipoCuenta.INGRESO);
    expect(c.naturaleza).toBe(NaturalezaCuenta.DEUDORA);
  });

  it('cuentas normales de activo fijo (no contra) siguen siendo DEUDORA — no se invirtió nada por error', () => {
    for (const codigo of ['1.2.1.04', '1.2.1.05', '1.2.1.06', '1.2.1.07', '1.2.1.08', '1.2.1.09', '1.2.1.10']) {
      const c = porCodigo(codigo);
      expect(c.tipo).toBe(TipoCuenta.ACTIVO);
      expect(c.naturaleza).toBe(NaturalezaCuenta.DEUDORA);
    }
  });

  it('ingresos normales (no contra) del enriquecimiento siguen siendo ACREEDORA', () => {
    for (const codigo of ['4.1.1.05', '4.2.1.03', '4.2.1.04']) {
      const c = porCodigo(codigo);
      expect(c.tipo).toBe(TipoCuenta.INGRESO);
      expect(c.naturaleza).toBe(NaturalezaCuenta.ACREEDORA);
    }
  });
});

describe('PLAN_CUENTAS — clasificacionResultado de las cuentas madre marcadas explícitas', () => {
  it.each([
    ['4.1.3', 'Diferencial Cambiario (Ingreso)'],
    ['4.2', 'Ingresos No Operacionales'],
    ['6.1.3', 'Gastos Financieros'],
    ['6.1.5', 'Diferencial Cambiario (Gasto)'],
    ['6.1.8', 'Otros Gastos No Operacionales'],
  ])('%s (%s) está marcada no_operacional — sus hijas heredan sin marcarse una por una', (codigo) => {
    expect(porCodigo(codigo).clasificacionResultado).toBe(ClasificacionResultado.NO_OPERACIONAL);
  });

  it('las hijas de esas 5 cuentas madre NO llevan clasificacionResultado propio — dependen de la herencia', () => {
    const codigos = new Set(PLAN_CUENTAS.map(c => c.codigo));
    const madresNoOperacional = ['4.1.3', '4.2', '6.1.3', '6.1.5', '6.1.8'];
    for (const c of PLAN_CUENTAS) {
      const esHijaDirecta = madresNoOperacional.some(m => c.codigo !== m && c.codigo.startsWith(m + '.'));
      if (esHijaDirecta && codigos.has(c.codigo)) {
        expect(c.clasificacionResultado).toBeUndefined();
      }
    }
  });

  it('6.1.7 (Impuesto Sobre la Renta) se queda OPERACIONAL — el encargo lo listó dentro de "Gastos", no en "No operacionales"', () => {
    expect(porCodigo('6.1.7').clasificacionResultado).toBeUndefined();
  });
});

describe('PLAN_CUENTAS — el motor de asientos sigue encontrando todos sus COD.*', () => {
  const codigos = new Set(PLAN_CUENTAS.map(c => c.codigo));

  it('cada código referenciado en COD.* existe en el seed — ninguno se movió ni se borró', () => {
    for (const codigo of Object.values(COD)) {
      expect(codigos.has(codigo)).toBe(true);
    }
  });

  it('los literales sueltos que el motor referencia sin pasar por COD también siguen ahí', () => {
    // Ver CODIGOS_SISTEMA en contabilidad.service.ts — los mismos 5 que ese
    // comentario documenta como referenciados por literal directo.
    for (const codigo of ['1.1.4.02', '1.1.4.03', '1.1.2.10', '4.1.2.01', '4.1.2.02']) {
      expect(codigos.has(codigo)).toBe(true);
    }
  });
});
