/**
 * IT-1 — Sección III (Liquidación), Commit 2 del rebuild 2026-09-22.
 *
 * Mismo caso dorado que it1-seccion2.spec.ts (IT-1-2020.xls adjunto por el
 * usuario): ITBIS cobrado 46,854.72 (18%, casilla 16), ITBIS pagado en
 * compras 9,680.29 (casilla 22), a pagar 37,174.43 (casilla 33) — sin saldo
 * a favor anterior, sin retenciones, sin compensaciones (todas 0 en el
 * Excel de origen).
 */

import { DeclaracionesService } from './declaraciones.service';

function makeService(declaracionAnterior: any | null) {
  const declItbisRepo = {
    findOne: jest.fn().mockResolvedValue(declaracionAnterior),
    save: jest.fn(),
    create: jest.fn((d: any) => d),
    update: jest.fn(),
  };
  const tenantSvc = { getEmpresaId: () => 44 };
  const svc: any = Object.create(DeclaracionesService.prototype);
  svc.declItbisRepo = declItbisRepo;
  svc.tenantSvc     = tenantSvc;
  return { svc: svc as DeclaracionesService, declItbisRepo };
}

// seccionII mínimo — calcularSeccionIIIIT1 solo lee _itbisCobradoPorTasa.
const SECCION_II_DORADA = { _itbisCobradoPorTasa: { itbis18: 46854.72, itbis16: 0 } };

describe('DeclaracionesService.calcularSeccionIIIIT1 — caso dorado, sin período anterior', () => {
  it('casilla 21 (total ITBIS cobrado) = 46,854.72 y casilla 25 (total deducible) = 9,680.29', async () => {
    const { svc } = makeService(null);
    const s3: any = await (svc as any)['calcularSeccionIIIIT1'](SECCION_II_DORADA, 9680.29, 0, 9, 2026);
    expect(s3.itbisCobrado.casilla21_totalItbisCobrado.monto).toBeCloseTo(46854.72, 2);
    expect(s3.itbisPagado.casilla25_totalDeducible.monto).toBeCloseTo(9680.29, 2);
  });

  it('casilla 33 (diferencia a pagar) = 37,174.43, casilla 34 (nuevo saldo a favor) = 0', async () => {
    const { svc } = makeService(null);
    const s3: any = await (svc as any)['calcularSeccionIIIIT1'](SECCION_II_DORADA, 9680.29, 0, 9, 2026);
    expect(s3.liquidacion.casilla33_diferenciaAPagar.monto).toBeCloseTo(37174.43, 2);
    expect(s3.liquidacion.casilla34_nuevoSaldoAFavor.monto).toBe(0);
  });

  it('casilla 29 (saldo a favor anterior) sin período registrado: 0 con estado requiere_revision, nunca calculada en silencio', async () => {
    const { svc, declItbisRepo } = makeService(null);
    const s3: any = await (svc as any)['calcularSeccionIIIIT1'](SECCION_II_DORADA, 9680.29, 0, 9, 2026);
    expect(declItbisRepo.findOne).toHaveBeenCalledWith({ where: { empresaId: 44, mes: 8, anio: 2026, isActive: true } });
    expect(s3.liquidacion.casilla29_saldoAFavorAnterior.monto).toBe(0);
    expect(s3.liquidacion.casilla29_saldoAFavorAnterior.estado).toBe('requiere_revision');
    expect(s3.avisos.some((a: string) => a.includes('sin período anterior registrado'))).toBe(true);
  });

  it('casilla 30 (retenciones, depende del Anexo A no construido) siempre requiere_revision', async () => {
    const { svc } = makeService(null);
    const s3: any = await (svc as any)['calcularSeccionIIIIT1'](SECCION_II_DORADA, 9680.29, 0, 9, 2026);
    expect(s3.liquidacion.casilla30_retencionesComputables.estado).toBe('requiere_revision');
  });
});

describe('DeclaracionesService.calcularSeccionIIIIT1 — con período anterior registrado', () => {
  it('casilla 29 lee el nuevoSaldoAFavor del mes calendario anterior y se aplica como crédito', async () => {
    const { svc, declItbisRepo } = makeService({ nuevoSaldoAFavor: 5000, diferenciaAPagar: 0 });
    const s3: any = await (svc as any)['calcularSeccionIIIIT1'](SECCION_II_DORADA, 9680.29, 0, 9, 2026);
    expect(declItbisRepo.findOne).toHaveBeenCalledWith({ where: { empresaId: 44, mes: 8, anio: 2026, isActive: true } });
    expect(s3.liquidacion.casilla29_saldoAFavorAnterior.monto).toBe(5000);
    expect(s3.liquidacion.casilla29_saldoAFavorAnterior.estado).toBe('calculada');
    // 46,854.72 - 9,680.29 - 5,000 (saldo anterior) = 32,174.43
    expect(s3.liquidacion.casilla33_diferenciaAPagar.monto).toBeCloseTo(32174.43, 2);
  });

  it('enero lee diciembre del año anterior (cruce de año)', async () => {
    const { svc, declItbisRepo } = makeService({ nuevoSaldoAFavor: 0, diferenciaAPagar: 0 });
    await (svc as any)['calcularSeccionIIIIT1'](SECCION_II_DORADA, 9680.29, 0, 1, 2026);
    expect(declItbisRepo.findOne).toHaveBeenCalledWith({ where: { empresaId: 44, mes: 12, anio: 2025, isActive: true } });
  });

  it('un saldo a favor anterior mayor al ITBIS neto del período convierte la diferencia en nuevo saldo a favor', async () => {
    const { svc } = makeService({ nuevoSaldoAFavor: 100000, diferenciaAPagar: 0 });
    const s3: any = await (svc as any)['calcularSeccionIIIIT1'](SECCION_II_DORADA, 9680.29, 0, 9, 2026);
    // 46,854.72 - 9,680.29 - 100,000 = -62,825.57 → casilla 34
    expect(s3.liquidacion.casilla33_diferenciaAPagar.monto).toBe(0);
    expect(s3.liquidacion.casilla34_nuevoSaldoAFavor.monto).toBeCloseTo(62825.57, 2);
  });
});
