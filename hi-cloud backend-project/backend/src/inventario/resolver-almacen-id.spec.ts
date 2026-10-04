import { BadRequestException } from '@nestjs/common';
import { InventarioService } from './inventario.service';

/**
 * InventarioService.resolverAlmacenId() — única fuente de verdad para el
 * almacén de un movimiento (y de syncStockAlmacen). Caso real (empresa 44,
 * 2026-10): 1,549 movimientos sin almacenId porque cada camino improvisaba
 * su propio fallback — syncStockAlmacen caía al "almacén de menor id" en
 * silencio. Ahora: explícito → CLS → sucursal (almacenPrincipalId) →
 * único almacén activo de la empresa → error claro (nunca adivinar).
 */

const EMPRESA = 44;

function buildDeps(opts: {
  almacenCls?: number | null;
  sucursalCls?: number | null;
  almacenesActivos?: { id: number }[];
  sucursalRow?: { almacenPrincipalId: number | null }[];
} = {}) {
  const almacenesActivos = opts.almacenesActivos ?? [];
  const sucursalRow = opts.sucursalRow ?? [];

  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM sucursales')) return sucursalRow;
    if (sql.includes('FROM almacenes')) return almacenesActivos;
    return [];
  });

  return {
    movimientoRepo: { create: jest.fn((d: any) => d), save: jest.fn().mockResolvedValue({ id: 1 }) },
    productoRepo: {
      findOne: jest.fn().mockResolvedValue({ id: 42, empresaId: EMPRESA, stock: 10, stockMinimo: 0 }),
      update:  jest.fn().mockResolvedValue(undefined),
    },
    loteRepo: {}, serialRepo: {}, solicitudAjusteRepo: {},
    ds: { query },
    realtimeSvc: { notify: jest.fn() },
    tenantSvc: {
      getEmpresaId:  () => EMPRESA,
      getAlmacenId:  () => opts.almacenCls ?? null,
      getSucursalId: () => opts.sucursalCls ?? null,
    },
    emailSvc: {},
    valoracionSvc: { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): InventarioService {
  return new InventarioService(
    d.movimientoRepo as any, d.productoRepo as any, d.loteRepo as any, d.serialRepo as any,
    d.solicitudAjusteRepo as any, d.ds as any, d.realtimeSvc as any, d.tenantSvc as any,
    d.emailSvc as any, d.valoracionSvc as any,
  );
}

describe('InventarioService.resolverAlmacenId', () => {
  it('almacenId explícito del documento manda sobre todo lo demás', async () => {
    const d = buildDeps({ almacenCls: 5, almacenesActivos: [{ id: 1 }] });
    const service = buildService(d);
    await expect(service.resolverAlmacenId(EMPRESA, { almacenIdExplicito: 77 })).resolves.toBe(77);
  });

  it('sin explícito: usa el almacén de la sesión (CLS)', async () => {
    const d = buildDeps({ almacenCls: 8 });
    const service = buildService(d);
    await expect(service.resolverAlmacenId(EMPRESA, {})).resolves.toBe(8);
  });

  it('sin explícito ni CLS: usa el almacenPrincipalId de la sucursal (de la sesión)', async () => {
    const d = buildDeps({ sucursalCls: 45, sucursalRow: [{ almacenPrincipalId: 20 }] });
    const service = buildService(d);
    await expect(service.resolverAlmacenId(EMPRESA, {})).resolves.toBe(20);
  });

  it('la sucursal del DOCUMENTO (pasada explícita) tiene prioridad sobre la de la sesión', async () => {
    const d = buildDeps({ sucursalCls: 999, sucursalRow: [{ almacenPrincipalId: 30 }] });
    const service = buildService(d);
    await expect(service.resolverAlmacenId(EMPRESA, { sucursalId: 45 })).resolves.toBe(30);
  });

  it('empresa con EXACTAMENTE un almacén activo, sin ningún otro contexto: usa ese', async () => {
    const d = buildDeps({ almacenesActivos: [{ id: 33 }] });
    const service = buildService(d);
    await expect(service.resolverAlmacenId(EMPRESA, {})).resolves.toBe(33);
  });

  it('empresa con 2+ almacenes activos y sin contexto: error claro, NUNCA el de menor id a ciegas', async () => {
    const d = buildDeps({ almacenesActivos: [{ id: 10 }, { id: 20 }] });
    const service = buildService(d);
    await expect(service.resolverAlmacenId(EMPRESA, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('empresa SIN ningún almacén activo y sin contexto: error claro, no revienta con otra cosa', async () => {
    const d = buildDeps({ almacenesActivos: [] });
    const service = buildService(d);
    await expect(service.resolverAlmacenId(EMPRESA, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sucursal sin almacenPrincipalId configurado: sigue cayendo al único almacén de la empresa', async () => {
    const d = buildDeps({ sucursalCls: 45, sucursalRow: [{ almacenPrincipalId: null }], almacenesActivos: [{ id: 33 }] });
    const service = buildService(d);
    await expect(service.resolverAlmacenId(EMPRESA, {})).resolves.toBe(33);
  });
});

describe('InventarioService.registrarAjuste — empresaId y almacenId ya nunca quedan NULL', () => {
  it('pasa empresaId y almacenId (resueltos) al movimiento — antes los omitía los dos', async () => {
    const d = buildDeps({ almacenCls: 20 });
    const service = buildService(d);

    await service.registrarAjuste(42, 85, 3, 'Conteo físico');

    expect(d.movimientoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: EMPRESA, almacenId: 20 }),
    );
  });

  it('sin almacén resoluble (2+ almacenes, sin contexto): lanza en vez de guardar con NULL', async () => {
    const d = buildDeps({ almacenesActivos: [{ id: 10 }, { id: 20 }] });
    const service = buildService(d);

    await expect(service.registrarAjuste(42, 85, 3, 'Conteo físico')).rejects.toBeInstanceOf(BadRequestException);
    expect(d.movimientoRepo.save).not.toHaveBeenCalled();
  });
});

describe('InventarioService.persistirMovimiento (vía registrarAjuste) — empresaId obligatorio', () => {
  it('si el producto no tiene empresaId (caso extremo), lanza en vez de guardar con empresaId NULL', async () => {
    const d = buildDeps({ almacenCls: 20 });
    d.productoRepo.findOne = jest.fn().mockResolvedValue({ id: 42, empresaId: undefined, stock: 10, stockMinimo: 0 });
    const service = buildService(d);

    await expect(service.registrarAjuste(42, 85, 3, 'motivo')).rejects.toThrow(/empresaId/i);
    expect(d.movimientoRepo.save).not.toHaveBeenCalled();
  });
});
