/**
 * S-63 — Test de regresión: la auditoría falla CERRADA sin contexto de empresa.
 *
 * VULNERABILIDAD ORIGINAL:
 * AuditoriaController (accesible a SUPER_ADMIN, ADMIN y CONTADOR) leía el
 * empresaId con getEmpresaIdOrNull() y lo pasaba tal cual al servicio, donde
 * `if (empresaId)` omite el filtro. Un request sin contexto de empresa devolvía
 * los logs de TODAS las empresas de la plataforma.
 *
 * Ahora solo el super_admin obtiene la vista global; cualquier otro rol sin
 * contexto recibe 403 en lugar de datos ajenos.
 */

import { ForbiddenException } from '@nestjs/common';
import { AuditoriaController } from './auditoria.controller';
import { UserRole } from '../users/enums/user-role.enum';

function buildController(empresaIdEnContexto: number | null) {
  const auditoriaService = {
    getResumen:          jest.fn(async (eid?: number) => ({ eid })),
    getModulosDistintos: jest.fn(async (eid?: number) => ({ eid })),
    getUltimosErrores:   jest.fn(async (_l: number, eid?: number) => ({ eid })),
    getLogs:             jest.fn(async (_f: any, eid?: number) => ({ eid })),
    getLogsByUser:       jest.fn(async (_u: number, _f: any, eid?: number) => ({ eid })),
    getLogsByModulo:     jest.fn(async (_m: string, _f: any, eid?: number) => ({ eid })),
  };
  const tenantService = { getEmpresaIdOrNull: () => empresaIdEnContexto };
  const ctrl = new AuditoriaController(auditoriaService as any, tenantService as any);
  return { ctrl, auditoriaService };
}

const ADMIN    = { id: 1, role: UserRole.ADMIN }    as any;
const CONTADOR = { id: 2, role: UserRole.CONTADOR } as any;
const SUPER    = { id: 9, role: UserRole.SUPER_ADMIN } as any;

describe('S-63 — auditoría sin contexto de empresa', () => {
  describe('roles de cliente → 403 (antes: logs de todas las empresas)', () => {
    it.each([
      ['resumen',        (c: any, u: any) => c.getResumen(u)],
      ['modulos',        (c: any, u: any) => c.getModulos(u)],
      ['errores',        (c: any, u: any) => c.getUltimosErrores(u, 10)],
      ['logs',           (c: any, u: any) => c.getLogs({} as any, u)],
      ['logs/usuario',   (c: any, u: any) => c.getLogsByUser(5, {} as any, u)],
      ['logs/modulo',    (c: any, u: any) => c.getLogsByModulo('admin', {} as any, u)],
    ])('%s rechaza a un ADMIN sin contexto', (_n, call) => {
      const { ctrl } = buildController(null);
      expect(() => call(ctrl, ADMIN)).toThrow(ForbiddenException);
    });

    it('rechaza también a CONTADOR', () => {
      const { ctrl } = buildController(null);
      expect(() => ctrl.getLogs({} as any, CONTADOR)).toThrow(ForbiddenException);
    });

    it('el vector original (modulo=admin sin tenant) queda cerrado', () => {
      const { ctrl, auditoriaService } = buildController(null);
      expect(() => ctrl.getLogsByModulo('admin', {} as any, ADMIN)).toThrow(ForbiddenException);
      expect(auditoriaService.getLogsByModulo).not.toHaveBeenCalled();
    });
  });

  describe('super_admin conserva la vista global', () => {
    it('sin contexto consulta sin filtro de empresa', async () => {
      const { ctrl, auditoriaService } = buildController(null);
      await ctrl.getLogs({} as any, SUPER);
      expect(auditoriaService.getLogs).toHaveBeenCalledWith({}, undefined);
    });
  });

  describe('con contexto de empresa, todo sigue igual', () => {
    it('filtra por la empresa del contexto', async () => {
      const { ctrl, auditoriaService } = buildController(7);
      await ctrl.getLogs({} as any, ADMIN);
      expect(auditoriaService.getLogs).toHaveBeenCalledWith({}, 7);
    });

    it('el contador ve la auditoría de su empresa', async () => {
      const { ctrl, auditoriaService } = buildController(7);
      await ctrl.getResumen(CONTADOR);
      expect(auditoriaService.getResumen).toHaveBeenCalledWith(7);
    });
  });
});
