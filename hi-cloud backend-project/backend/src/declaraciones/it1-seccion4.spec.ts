/**
 * IT-1 — Sección IV (Penalidades) + Sección V (Monto a Pagar), Commit 3 del
 * rebuild 2026-09-22.
 *
 * Reusa RecargosInteresesService (Herramientas Fiscales) — UN SOLO motor,
 * mockeado aquí para no depender de los parámetros fiscales reales
 * (recargo_mora/interes_indemnizatorio_mensual están sembrados como
 * PENDIENTE_VALIDACION hasta que un Super Admin los confirme).
 */

import { DeclaracionesService } from './declaraciones.service';
import { ParametroFiscalPendienteError } from '../parametros-fiscales/errors/parametro-fiscal.errors';

function makeService(recargosResultado: any) {
  const recargosSvc = {
    calcular: recargosResultado instanceof Error
      ? jest.fn().mockRejectedValue(recargosResultado)
      : jest.fn().mockResolvedValue(recargosResultado),
  };
  const svc: any = Object.create(DeclaracionesService.prototype);
  svc.recargosSvc = recargosSvc;
  return { svc: svc as DeclaracionesService, recargosSvc };
}

describe('DeclaracionesService.fechaLimiteIT1 — día 20 del mes siguiente', () => {
  it('septiembre 2026 → límite 2026-10-20', () => {
    const svc: any = Object.create(DeclaracionesService.prototype);
    expect(svc['fechaLimiteIT1'](9, 2026)).toBe('2026-10-20');
  });

  it('diciembre 2026 → límite 2027-01-20 (cruce de año)', () => {
    const svc: any = Object.create(DeclaracionesService.prototype);
    expect(svc['fechaLimiteIT1'](12, 2026)).toBe('2027-01-20');
  });
});

describe('DeclaracionesService.calcularSeccionIVyVIT1 — caso dorado (sin penalidad)', () => {
  it('casilla 33 = 0 (a favor o en cero): penalidades no_aplica sin llamar al motor de recargos', async () => {
    const { svc, recargosSvc } = makeService(null);
    const s4: any = await (svc as any)['calcularSeccionIVyVIT1'](9, 2026, 0);
    expect(recargosSvc.calcular).not.toHaveBeenCalled();
    expect(s4.penalidades.casilla35_recargos.estado).toBe('no_aplica');
    expect(s4.penalidades.casilla36_interes.estado).toBe('no_aplica');
    expect(s4.montoAPagar.casilla38_totalAPagar.monto).toBe(0);
  });

  it('37,174.43 a pagar, dentro del plazo (mesesMora=0): casilla 38 = 37,174.43, sin recargo ni interés', async () => {
    const { svc } = makeService({
      recargoNeto: 0, interes: 0, mesesMora: 0, avisos: ['Pagado dentro del plazo — no aplica recargo ni interés.'],
    });
    const s4: any = await (svc as any)['calcularSeccionIVyVIT1'](9, 2026, 37174.43);
    expect(s4.penalidades.casilla35_recargos.monto).toBe(0);
    expect(s4.penalidades.casilla35_recargos.estado).toBe('calculada');
    expect(s4.montoAPagar.casilla38_totalAPagar.monto).toBeCloseTo(37174.43, 2);
  });
});

describe('DeclaracionesService.calcularSeccionIVyVIT1 — con mora', () => {
  it('recargo + interés se suman a la casilla 33 para dar la casilla 38', async () => {
    const { svc, recargosSvc } = makeService({
      recargoNeto: 371.74, interes: 185.87, mesesMora: 1, avisos: [],
    });
    const s4: any = await (svc as any)['calcularSeccionIVyVIT1'](9, 2026, 37174.43);
    expect(recargosSvc.calcular).toHaveBeenCalledWith(expect.objectContaining({
      montoAdeudado: 37174.43, fechaLimite: '2026-10-20', situacion: 'normal', acogeAmnistia: false,
    }));
    expect(s4.penalidades.casilla35_recargos.monto).toBeCloseTo(371.74, 2);
    expect(s4.penalidades.casilla36_interes.monto).toBeCloseTo(185.87, 2);
    // 37,174.43 + 371.74 + 185.87 = 37,732.04
    expect(s4.montoAPagar.casilla38_totalAPagar.monto).toBeCloseTo(37732.04, 2);
  });

  it('parámetro fiscal pendiente de validación: requiere_revision, nunca 0 silencioso ni un error que tumbe el IT-1', async () => {
    const { svc } = makeService(new ParametroFiscalPendienteError('recargo_mora', '2026-10-21'));
    const s4: any = await (svc as any)['calcularSeccionIVyVIT1'](9, 2026, 37174.43);
    expect(s4.penalidades.casilla35_recargos.estado).toBe('requiere_revision');
    expect(s4.penalidades.casilla36_interes.estado).toBe('requiere_revision');
    expect(s4.avisos.some((a: string) => a.includes('requiere revisión'))).toBe(true);
    // Sin penalidad conocida, casilla 38 no inventa un monto — se queda en la casilla 33.
    expect(s4.montoAPagar.casilla38_totalAPagar.monto).toBeCloseTo(37174.43, 2);
  });

  it('casilla 37 (sanciones) siempre no_aplica — no hay fórmula, son administrativas caso por caso', async () => {
    const { svc } = makeService({ recargoNeto: 0, interes: 0, mesesMora: 0, avisos: [] });
    const s4: any = await (svc as any)['calcularSeccionIVyVIT1'](9, 2026, 37174.43);
    expect(s4.penalidades.casilla37_sanciones.estado).toBe('no_aplica');
    expect(s4.penalidades.casilla37_sanciones.monto).toBe(0);
  });
});
