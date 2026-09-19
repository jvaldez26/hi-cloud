/**
 * PLAN_CUENTAS (Fase 2 del catálogo fiscal dominicano) — verifica que el
 * seed nace ya etiquetado, sin paso adicional: seedPlanCuentas()/
 * onModuleInit() hacen `this.cuentaRepository.create({ ...c, ... })` sobre
 * cada entrada de PLAN_CUENTAS, así que basta con que las etiquetas estén
 * en el objeto — no hace falta tocar esos dos métodos.
 *
 * No cubre la migración de datos que etiqueta lo YA existente en
 * producción (ver 1764300000000-EtiquetarCuentasFiscalesSeed.ts) ni la
 * pantalla de excepciones — solo el propio PLAN_CUENTAS.
 */

import { PLAN_CUENTAS } from './contabilidad.service';
import { TipoCuenta, AnexoIR2 } from '../entities/cuenta-contable.entity';

function porCodigo(codigo: string) {
  const c = PLAN_CUENTAS.find(x => x.codigo === codigo);
  if (!c) throw new Error(`Cuenta ${codigo} no está en el seed — revisa el código`);
  return c;
}

describe('PLAN_CUENTAS — etiquetas fiscales del seed', () => {
  it('las cuentas de agrupación (permiteMovimientos=false) no llevan ninguna etiqueta fiscal', () => {
    for (const c of PLAN_CUENTAS.filter(c => !c.permiteMovimientos)) {
      expect(c.tipoGasto606).toBeUndefined();
      expect(c.anexoIR2).toBeUndefined();
      expect(c.requiereNCF).toBeUndefined();
    }
  });

  it('13 de las 14 cuentas de gasto/costo de movimiento tienen tipoGasto606 — solo ITBIS no Recuperable queda sin él', () => {
    const gastoYCosto = PLAN_CUENTAS.filter(
      c => c.permiteMovimientos && (c.tipo === TipoCuenta.GASTO || c.tipo === TipoCuenta.COSTO),
    );
    expect(gastoYCosto).toHaveLength(14);
    const sinTipoGasto606 = gastoYCosto.filter(c => !c.tipoGasto606);
    expect(sinTipoGasto606.map(c => c.codigo)).toEqual(['6.1.2.06']); // ITBIS no Recuperable
  });

  it('"ITBIS no Recuperable" (6.1.2.06) no lleva ninguna etiqueta — es la única genuinamente ambigua, a confirmar con el contador', () => {
    const c = porCodigo('6.1.2.06');
    expect(c.nombre).toBe('ITBIS no Recuperable');
    expect(c.tipoGasto606).toBeUndefined();
    expect(c.anexoIR2).toBeUndefined();
    expect(c.requiereNCF).toBeUndefined();
  });

  it('activo/pasivo/patrimonio de movimiento llevan anexoIR2=A1, EXCEPTO las 4 cuentas de Inventario', () => {
    const inventario = ['1.1.3.01', '1.1.3.02', '1.1.3.03', '1.1.3.04'];
    for (const c of PLAN_CUENTAS.filter(
      c => c.permiteMovimientos && [TipoCuenta.ACTIVO, TipoCuenta.PASIVO, TipoCuenta.PATRIMONIO].includes(c.tipo),
    )) {
      if (inventario.includes(c.codigo)) {
        expect(c.anexoIR2).toBeUndefined();
      } else {
        expect(c.anexoIR2).toBe(AnexoIR2.A1);
      }
    }
  });

  it('las 4 cuentas de Inventario quedan SIN anexoIR2 — alimentan A1 (Balance) Y D (Anexo D) a la vez, y la columna solo permite uno', () => {
    for (const codigo of ['1.1.3.01', '1.1.3.02', '1.1.3.03', '1.1.3.04']) {
      expect(porCodigo(codigo).anexoIR2).toBeUndefined();
    }
  });

  it('ingreso de movimiento lleva anexoIR2=B1 siempre (no depende de ningún diccionario)', () => {
    for (const c of PLAN_CUENTAS.filter(c => c.permiteMovimientos && c.tipo === TipoCuenta.INGRESO)) {
      expect(c.anexoIR2).toBe(AnexoIR2.B1);
    }
  });

  it('costo de movimiento lleva anexoIR2=D (ambas cuentas de costo del seed tienen tipoGasto606 confiable)', () => {
    for (const c of PLAN_CUENTAS.filter(c => c.permiteMovimientos && c.tipo === TipoCuenta.COSTO)) {
      expect(c.anexoIR2).toBe(AnexoIR2.D);
    }
  });

  it('gasto de movimiento lleva anexoIR2=B1 solo si tiene tipoGasto606 — ITBIS no Recuperable no tiene ninguno de los dos', () => {
    for (const c of PLAN_CUENTAS.filter(c => c.permiteMovimientos && c.tipo === TipoCuenta.GASTO)) {
      if (c.tipoGasto606) expect(c.anexoIR2).toBe(AnexoIR2.B1);
      else expect(c.anexoIR2).toBeUndefined();
    }
  });

  it('ninguna cuenta del seed lleva casillaIR2 — no hay números de casilla DGII verificados todavía (gate de Fase 3)', () => {
    for (const c of PLAN_CUENTAS) {
      expect((c as any).casillaIR2).toBeUndefined();
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
  });

  it('el seed sigue teniendo 79 cuentas — esta fase no agrega, quita ni renumera nada del catálogo', () => {
    expect(PLAN_CUENTAS).toHaveLength(79);
  });
});
