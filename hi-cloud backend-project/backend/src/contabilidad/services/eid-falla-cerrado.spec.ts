/**
 * P3 Bloque 5 — ContabilidadService.eid (getter privado) fallaba abierto:
 * el try/catch absorbía la ForbiddenException de TenantService.getEmpresaId()
 * y devolvía undefined, que en cada `if (this.eid) where.empresaId = this.eid`
 * de este archivo se traduce en "no filtres por empresa" — sin contexto de
 * tenant, una consulta se volvía cross-tenant en vez de fallar. Mismo fix ya
 * aplicado en balance-comprobacion.service.ts (commit 3b7de56a).
 *
 * UI — filtros por clasificación y estado (2026-09-21): getCuentas() pasó de
 * cuentaRepository.find() a un QueryBuilder (para poder combinar clasificación/
 * estado/búsqueda con conteos "faceted" en la misma llamada) — este mock se
 * actualizó junto con eso. construirQueryCuentas() lee this.eid ANTES de
 * tocar el repositorio a propósito, para que el caso "sin contexto" siga sin
 * tocar la base de datos en absoluto.
 */

import { ForbiddenException } from '@nestjs/common';
import { ContabilidadService } from './contabilidad.service';

/** QueryBuilder encadenable mínimo — cada llamada a createQueryBuilder() da una instancia propia. */
function makeQueryBuilder(wheres: { sql: string; params?: unknown }[]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    andWhere: jest.fn((sql: string, params?: unknown) => { wheres.push({ sql, params }); return qb; }),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return qb;
}

function makeService(empresaId: number | null) {
  const wheres: { sql: string; params?: unknown }[] = [];
  const cuentaRepository = {
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => makeQueryBuilder(wheres)),
  };
  const anexoRepository = { find: jest.fn().mockResolvedValue([]) };
  const tenantService = {
    getEmpresaId: () => {
      if (empresaId == null) {
        throw new ForbiddenException('Se requiere contexto de empresa. Realiza login o cambia de empresa activa.');
      }
      return empresaId;
    },
  };
  const svc: any = Object.create(ContabilidadService.prototype);
  svc.cuentaRepository = cuentaRepository;
  svc.anexoRepository  = anexoRepository;
  svc.tenantService    = tenantService;
  return { svc: svc as ContabilidadService, cuentaRepository, wheres };
}

describe('ContabilidadService.eid — falla cerrado (P3 Bloque 5)', () => {
  it('sin contexto de empresa: getCuentas() lanza ForbiddenException y NUNCA consulta la base de datos', async () => {
    const { svc, cuentaRepository } = makeService(null);

    await expect(svc.getCuentas()).rejects.toThrow(ForbiddenException);
    expect(cuentaRepository.find).not.toHaveBeenCalled();
    expect(cuentaRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('con contexto de empresa: getCuentas() filtra por ese empresaId, como antes', async () => {
    const { svc, wheres } = makeService(7);

    await svc.getCuentas();

    const conEmpresaId = wheres.filter(w => w.sql === 'c.empresaId = :eid');
    expect(conEmpresaId.length).toBeGreaterThan(0);
    for (const w of conEmpresaId) {
      expect(w.params).toEqual({ eid: 7 });
    }
  });
});
