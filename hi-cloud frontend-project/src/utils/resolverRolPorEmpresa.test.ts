import { describe, it, expect, vi, beforeEach } from 'vitest';

// Los exports de @sentry/react no se pueden espiar con vi.spyOn (bindings ESM
// de solo lectura en este build) — se reemplaza el módulo entero.
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }));
import * as Sentry from '@sentry/react';
import { resolverRolPorEmpresa } from './resolverRolPorEmpresa';
import type { EmpresaItem } from '../types';

const EMPRESA_A: EmpresaItem = { empresaId: 10, nombre: 'Empresa A', rol: 'admin', isPrincipal: true };
const EMPRESA_B: EmpresaItem = { empresaId: 20, nombre: 'Empresa B', rol: 'vendedor', isPrincipal: false };

beforeEach(() => { vi.clearAllMocks(); });

describe('resolverRolPorEmpresa', () => {
  it('empresa activa SÍ está en la lista: usa su rol', () => {
    const r = resolverRolPorEmpresa('contador', 10, [EMPRESA_A, EMPRESA_B]);
    expect(r).toEqual({ rol: 'admin', empresaActivaId: 10 });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('super_admin nunca se toca, con o sin empresa activa resuelta', () => {
    expect(resolverRolPorEmpresa('super_admin', 999, [EMPRESA_A])).toEqual({ rol: 'super_admin', empresaActivaId: 999 });
    expect(resolverRolPorEmpresa('super_admin', null, [])).toEqual({ rol: 'super_admin', empresaActivaId: null });
  });

  it('sin empresa activa (null/undefined): mantiene el rol global, nada que resolver', () => {
    expect(resolverRolPorEmpresa('contador', null, [EMPRESA_A])).toEqual({ rol: 'contador', empresaActivaId: null });
    expect(resolverRolPorEmpresa('contador', undefined, [EMPRESA_A])).toEqual({ rol: 'contador', empresaActivaId: null });
  });

  // Caso real (2026-10-03): el bug de admins viendo VIEWER de forma
  // intermitente. Lista vacía no es evidencia de que la empresa no exista —
  // probablemente los datos reales todavía no llegaron (ej. justo después de
  // un login con Google). Castigar aquí dejaba a cualquiera en viewer hasta
  // el próximo login completo.
  it('lista vacía (empresas[] aún no cargó) con empresaActivaId puesto: NO degrada — mantiene el rol global', () => {
    const r = resolverRolPorEmpresa('contador', 10, []);
    expect(r).toEqual({ rol: 'contador', empresaActivaId: 10 });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('lista con datos reales que NO incluyen la empresa activa: cae a la empresa principal, nunca a viewer', () => {
    const r = resolverRolPorEmpresa('contador', 999, [EMPRESA_A, EMPRESA_B]);
    expect(r).toEqual({ rol: 'admin', empresaActivaId: 10 });
    expect(r.rol).not.toBe('viewer');
  });

  it('sin empresa principal en la lista: cae a la primera', () => {
    const sinPrincipal = { ...EMPRESA_A, isPrincipal: false };
    const r = resolverRolPorEmpresa('contador', 999, [sinPrincipal, EMPRESA_B]);
    expect(r).toEqual({ rol: sinPrincipal.rol, empresaActivaId: sinPrincipal.empresaId });
  });

  it('empresa activa ausente de una lista real: reporta a Sentry como warning, con el detalle', () => {
    resolverRolPorEmpresa('contador', 999, [EMPRESA_A, EMPRESA_B]);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('no está en empresas[]'),
      expect.objectContaining({
        level: 'warning',
        tags: { modulo: 'auth' },
        extra: expect.objectContaining({ empresaActivaIdPedida: 999, empresaPredeterminada: 10 }),
      }),
    );
  });

  it('lista vacía: NO reporta a Sentry (no hay nada inconsistente que avisar todavía)', () => {
    resolverRolPorEmpresa('contador', 10, []);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  // El id puede llegar como string desde distintos orígenes (query param,
  // atributo de localStorage sin convertir, respuesta HTTP con bigint
  // serializado como string) — nunca debe fallar la comparación por tipo.
  it('empresaActivaId como string: compara por valor, no por tipo — encuentra la empresa igual', () => {
    const r = resolverRolPorEmpresa('contador', '20' as any, [EMPRESA_A, EMPRESA_B]);
    expect(r).toEqual({ rol: 'vendedor', empresaActivaId: 20 });
  });

  it('empresaId de una fila de la lista como string: compara por valor igual', () => {
    const empresaIdString = { ...EMPRESA_B, empresaId: '20' as any };
    const r = resolverRolPorEmpresa('contador', 20, [EMPRESA_A, empresaIdString]);
    expect(r).toEqual({ rol: 'vendedor', empresaActivaId: 20 });
  });
});
