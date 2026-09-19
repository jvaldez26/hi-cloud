/**
 * PLAN_CUENTAS (Fase 2 del catálogo fiscal dominicano, actualizado en Fase 4
 * Bloque A) — verifica que el seed nace ya etiquetado, sin paso adicional:
 * seedPlanCuentas()/onModuleInit() hacen `this.cuentaRepository.create({
 * ...c, ... })` sobre cada entrada de PLAN_CUENTAS y luego
 * guardarAnexosSeed() inserta una fila de cuenta_anexo_ir2 por cada
 * elemento de `c.anexos` — basta con que las etiquetas estén en el objeto.
 *
 * FASE 4 Bloque A: `anexoIR2` dejó de ser un campo único en cada entrada
 * del seed — ahora es `anexos: { anexoIR2, casillaIR2? }[]`, porque una
 * cuenta puede aportar a más de un anexo del IR-2 a la vez. El caso de
 * referencia son las 4 cuentas de Inventario (A1 Balance + D Costo de
 * Venta simultáneamente) — antes se quedaban SIN ninguna etiqueta porque
 * la columna única no podía llevar las dos a la vez.
 *
 * No cubre la migración de datos que etiqueta lo YA existente en
 * producción (ver 1764300000000-EtiquetarCuentasFiscalesSeed.ts y
 * 1764800000000-CuentaAnexoIR2MultiValor.ts) ni la pantalla de
 * excepciones — solo el propio PLAN_CUENTAS.
 */

import { PLAN_CUENTAS } from './contabilidad.service';
import { TipoCuenta, AnexoIR2 } from '../entities/cuenta-contable.entity';

function porCodigo(codigo: string) {
  const c = PLAN_CUENTAS.find(x => x.codigo === codigo);
  if (!c) throw new Error(`Cuenta ${codigo} no está en el seed — revisa el código`);
  return c;
}

function anexosDe(codigo: string): AnexoIR2[] {
  return (porCodigo(codigo).anexos ?? []).map(a => a.anexoIR2).sort();
}

describe('PLAN_CUENTAS — etiquetas fiscales del seed', () => {
  it('las cuentas de agrupación (permiteMovimientos=false) no llevan ninguna etiqueta fiscal', () => {
    for (const c of PLAN_CUENTAS.filter(c => !c.permiteMovimientos)) {
      expect(c.tipoGasto606).toBeUndefined();
      expect(c.anexos).toBeUndefined();
      expect(c.requiereNCF).toBeUndefined();
    }
  });

  it('18 de las 22 cuentas de gasto/costo de movimiento tienen tipoGasto606 — 4 quedan genuinamente ambiguas', () => {
    // 22 = las 15 previas + las 7 nuevas del selector de cuenta contable
    // (2026-09-19): Mantenimiento, Seguros, Otros Gastos, Gasto Menor,
    // Transporte, Marketing y Publicidad, Impuestos y Tasas — cierran el
    // mapeo CATEGORIA_LABELS de gastos.service.ts, antes muerto.
    const gastoYCosto = PLAN_CUENTAS.filter(
      c => c.permiteMovimientos && (c.tipo === TipoCuenta.GASTO || c.tipo === TipoCuenta.COSTO),
    );
    expect(gastoYCosto).toHaveLength(22);
    const sinTipoGasto606 = gastoYCosto.filter(c => !c.tipoGasto606);
    // ITBIS no Recuperable (ya ambigua desde Fase 2) + Otros Gastos, Gasto
    // Menor (régimen E43, ni siquiera es parte del 606) e Impuestos y Tasas
    // (puede o no venir facturado) — ninguna se fuerza a un código.
    expect(sinTipoGasto606.map(c => c.codigo).sort()).toEqual(
      ['6.1.2.06', '6.1.2.09', '6.1.2.10', '6.1.4.01'].sort(),
    );
  });

  it('"ITBIS no Recuperable" (6.1.2.06) no lleva ninguna etiqueta — es la única genuinamente ambigua, a confirmar con el contador', () => {
    const c = porCodigo('6.1.2.06');
    expect(c.nombre).toBe('ITBIS no Recuperable');
    expect(c.tipoGasto606).toBeUndefined();
    expect(c.anexos).toBeUndefined();
    expect(c.requiereNCF).toBeUndefined();
  });

  it('activo/pasivo/patrimonio de movimiento llevan A1, SIEMPRE — ya no se excluye a Inventario (Fase 4 Bloque A)', () => {
    for (const c of PLAN_CUENTAS.filter(
      c => c.permiteMovimientos && [TipoCuenta.ACTIVO, TipoCuenta.PASIVO, TipoCuenta.PATRIMONIO].includes(c.tipo),
    )) {
      expect(anexosDe(c.codigo)).toContain(AnexoIR2.A1);
    }
  });

  it('las 4 cuentas de Inventario llevan A1 Y D a la vez — caso de referencia del Bloque A, ya no quedan sin etiquetar', () => {
    const porCasilla: Record<string, string> = {
      '1.1.3.01': 'inv_mercancias',
      '1.1.3.02': 'inv_produccion_proceso',
      '1.1.3.03': 'inv_productos_terminados',
      '1.1.3.04': 'inv_materia_prima',
    };
    for (const [codigo, casilla] of Object.entries(porCasilla)) {
      const anexos = porCodigo(codigo).anexos ?? [];
      expect(anexos.map(a => a.anexoIR2).sort()).toEqual([AnexoIR2.A1, AnexoIR2.D].sort());
      const filaD = anexos.find(a => a.anexoIR2 === AnexoIR2.D);
      expect(filaD?.casillaIR2).toBe(casilla);
      const filaA1 = anexos.find(a => a.anexoIR2 === AnexoIR2.A1);
      expect(filaA1?.casillaIR2).toBeUndefined(); // A1 es texto libre, no se inventa un número de casilla
    }
  });

  it('ingreso de movimiento lleva B1 siempre (no depende de ningún diccionario)', () => {
    for (const c of PLAN_CUENTAS.filter(c => c.permiteMovimientos && c.tipo === TipoCuenta.INGRESO)) {
      expect(anexosDe(c.codigo)).toEqual([AnexoIR2.B1]);
    }
  });

  it('costo de movimiento lleva D (ambas cuentas de costo del seed tienen tipoGasto606 confiable), nunca dos veces', () => {
    for (const c of PLAN_CUENTAS.filter(c => c.permiteMovimientos && c.tipo === TipoCuenta.COSTO)) {
      expect(anexosDe(c.codigo)).toEqual([AnexoIR2.D]);
    }
  });

  it('gasto de movimiento lleva B1 solo si tiene tipoGasto606 — ITBIS no Recuperable no tiene ninguno de los dos', () => {
    for (const c of PLAN_CUENTAS.filter(c => c.permiteMovimientos && c.tipo === TipoCuenta.GASTO)) {
      if (c.tipoGasto606) expect(anexosDe(c.codigo)).toEqual([AnexoIR2.B1]);
      else expect(c.anexos).toBeUndefined();
    }
  });

  it('ninguna cuenta del seed repite el mismo anexo dos veces', () => {
    for (const c of PLAN_CUENTAS) {
      const codigos = (c.anexos ?? []).map(a => a.anexoIR2);
      expect(new Set(codigos).size).toBe(codigos.length);
    }
  });

  it('requiereNCF: nómina/TSS y depreciación en false; costo y cargos bancarios sin dictamen', () => {
    expect(porCodigo('6.1.1.01').requiereNCF).toBe(false); // Sueldos y Salarios
    expect(porCodigo('6.1.2.05').requiereNCF).toBe(false); // Depreciación y Amortización
    expect(porCodigo('6.1.2.01').requiereNCF).toBe(true);  // Alquiler de Local
    expect(porCodigo('6.1.3.01').requiereNCF).toBeUndefined(); // Intereses Bancarios
    expect(porCodigo('6.1.3.02').requiereNCF).toBeUndefined(); // Comisiones Bancarias
    expect(porCodigo('5.1.1.01').requiereNCF).toBeUndefined(); // Costo de Ventas de Bienes
    expect(porCodigo('5.1.1.02').requiereNCF).toBeUndefined(); // Costo de Producción
    expect(porCodigo('6.1.5.01').requiereNCF).toBeUndefined(); // Pérdida en Diferencial Cambiario — ajuste contable, no una compra con NCF
  });

  it('el seed tiene 98 cuentas — 90 de Fase 4 + 8 del selector de cuenta contable (2026-09-19)', () => {
    expect(PLAN_CUENTAS).toHaveLength(98);
  });

  describe('las 8 cuentas que cierran CATEGORIA_LABELS de Gastos (selector de cuenta contable, 2026-09-19)', () => {
    it('ninguna es cuenta del sistema — el motor las recibe como parámetro, no las referencia por código fijo', () => {
      for (const codigo of ['6.1.2.07', '6.1.2.08', '6.1.2.09', '6.1.2.10', '6.1.2.11', '6.1.2.12', '6.1.4', '6.1.4.01']) {
        expect(porCodigo(codigo).esCuentaSistema).toBeUndefined();
      }
    });

    it('Mantenimiento, Seguros, Transporte y Marketing reciben tipoGasto606 y B1 — Otros/Gasto Menor/Impuestos quedan sin dictamen', () => {
      expect(porCodigo('6.1.2.07').tipoGasto606).toBe('02'); // Mantenimiento
      expect(porCodigo('6.1.2.08').tipoGasto606).toBe('11'); // Seguros
      expect(porCodigo('6.1.2.11').tipoGasto606).toBe('02'); // Transporte
      expect(porCodigo('6.1.2.12').tipoGasto606).toBe('02'); // Marketing y Publicidad
      for (const codigo of ['6.1.2.07', '6.1.2.08', '6.1.2.11', '6.1.2.12']) {
        expect(anexosDe(codigo)).toEqual([AnexoIR2.B1]);
      }
      for (const codigo of ['6.1.2.09', '6.1.2.10', '6.1.4.01']) {
        expect(porCodigo(codigo).tipoGasto606).toBeUndefined();
        expect(porCodigo(codigo).anexos).toBeUndefined();
      }
    });

    it('"Gasto Menor" va sin NCF (régimen E43); "Impuestos y Tasas" queda ambiguo, sin forzar ninguno de los dos', () => {
      expect(porCodigo('6.1.2.10').requiereNCF).toBe(false);
      expect(porCodigo('6.1.4.01').requiereNCF).toBeUndefined();
    });

    it('6.1.4 (nodo padre nuevo) es de agrupación, sin ninguna etiqueta', () => {
      const c = porCodigo('6.1.4');
      expect(c.permiteMovimientos).toBe(false);
      expect(c.tipoGasto606).toBeUndefined();
      expect(c.anexos).toBeUndefined();
    });
  });

  describe('las 8 cuentas que cierran códigos huérfanos del motor (2026-09-19)', () => {
    it('todas quedan marcadas esCuentaSistema — el motor las referencia por código, mismo riesgo que COD.*', () => {
      for (const codigo of ['1.1.2.10', '1.1.4.02', '1.1.4.03', '2.1.2.04', '4.1.2.01', '4.1.2.02', '4.1.3.01', '6.1.5.01']) {
        expect(porCodigo(codigo).esCuentaSistema).toBe(true);
      }
    });

    it('las de activo/pasivo (retenciones E41, cartera de préstamos) llevan A1', () => {
      for (const codigo of ['1.1.2.10', '1.1.4.02', '1.1.4.03', '2.1.2.04']) {
        expect(anexosDe(codigo)).toEqual([AnexoIR2.A1]);
      }
    });

    it('las de ingreso (intereses/mora de préstamos, ganancia cambiaria) llevan B1', () => {
      for (const codigo of ['4.1.2.01', '4.1.2.02', '4.1.3.01']) {
        expect(anexosDe(codigo)).toEqual([AnexoIR2.B1]);
      }
    });

    it('"Pérdida en Diferencial Cambiario" (6.1.5.01) recibe tipoGasto606=07 (Gastos financieros) y B1 — mismo diccionario que "Intereses/Comisiones Bancarias"', () => {
      const c = porCodigo('6.1.5.01');
      expect(c.tipoGasto606).toBe('07');
      expect(anexosDe('6.1.5.01')).toEqual([AnexoIR2.B1]);
    });

    it('los 3 nodos padre nuevos (4.1.2, 4.1.3, 6.1.5) son de agrupación, sin ninguna etiqueta', () => {
      for (const codigo of ['4.1.2', '4.1.3', '6.1.5']) {
        const c = porCodigo(codigo);
        expect(c.permiteMovimientos).toBe(false);
        expect(c.esCuentaSistema).toBeUndefined();
        expect(c.anexos).toBeUndefined();
      }
    });
  });
});
