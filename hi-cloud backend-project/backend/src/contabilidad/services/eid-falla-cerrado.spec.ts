/**
 * P3 Bloque 5 — ContabilidadService.eid (getter privado) fallaba abierto:
 * el try/catch absorbía la ForbiddenException de TenantService.getEmpresaId()
 * y devolvía undefined, que en cada `if (this.eid) where.empresaId = this.eid`
 * de este archivo se traduce en "no filtres por empresa" — sin contexto de
 * tenant, una consulta se volvía cross-tenant en vez de fallar. Mismo fix ya
 * aplicado en balance-comprobacion.service.ts (commit 3b7de56a).
 */

import { ForbiddenException } from '@nestjs/common';
import { ContabilidadService } from './contabilidad.service';

function makeService(empresaId: number | null) {
  const cuentaRepository = { find: jest.fn().mockResolvedValue([]) };
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
  svc.tenantService    = tenantService;
  return { svc: svc as ContabilidadService, cuentaRepository };
}

describe('ContabilidadService.eid — falla cerrado (P3 Bloque 5)', () => {
  it('sin contexto de empresa: getCuentas() lanza ForbiddenException y NUNCA consulta la base de datos', async () => {
    const { svc, cuentaRepository } = makeService(null);

    await expect(svc.getCuentas()).rejects.toThrow(ForbiddenException);
    expect(cuentaRepository.find).not.toHaveBeenCalled();
  });

  it('con contexto de empresa: getCuentas() filtra por ese empresaId, como antes', async () => {
    const { svc, cuentaRepository } = makeService(7);

    await svc.getCuentas();

    expect(cuentaRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: 7 }) }),
    );
  });
});
