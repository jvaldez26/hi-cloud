import { ForbiddenException } from '@nestjs/common';
import { ContabilidadService } from './contabilidad.service';
import { EstadoAsiento } from '../entities/asiento-contable.entity';

/**
 * createAsiento() (asiento manual, panel de Contabilidad) — toma la empresa
 * SIEMPRE del CLS (this.eid, que falla cerrado — ver P3 Bloque 5) y su
 * número sale de la secuencia de ESA empresa, nunca de un fallback a 0.
 * Motivado por los 13 asientos huérfanos (empresaId NULL) que dejó la
 * versión anterior de generarNumero() con `?? 0`.
 */
const EMPRESA = 7;

function buildService(opts: { empresaId: number | null; cuentaEmpresaId?: number }) {
  const cuenta = { id: 1, nombre: 'Caja', isActive: true, permiteMovimientos: true, empresaId: opts.cuentaEmpresaId ?? opts.empresaId };

  const cuentaRepository = {
    findOne: jest.fn(async ({ where }: any) =>
      where.empresaId === cuenta.empresaId && where.id === cuenta.id ? cuenta : null,
    ),
  };
  const asientoRepository = {
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => ({ ...data, id: 999 })),
    findOne: jest.fn(async ({ where }: any) =>
      where.id === 999 ? { id: 999, empresaId: opts.empresaId, estado: EstadoAsiento.BORRADOR, lineas: [] } : null,
    ),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save: jest.fn(async (data: any) => data),
  };
  const tenantService = {
    getEmpresaId: jest.fn(() => {
      if (opts.empresaId === null) throw new ForbiddenException('Se requiere contexto de empresa');
      return opts.empresaId;
    }),
  };
  const dataSource = {
    query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('siguiente_numero_secuencia')) {
        // La secuencia es por empresa — el stub expone el empresaId usado.
        return [{ numero: `${params[0]}-101` }];
      }
      return [];
    }),
  };

  const service = new ContabilidadService(
    cuentaRepository as any, {} as any, asientoRepository as any, lineaRepository as any,
    tenantService as any, dataSource as any,
  );
  return { service, cuentaRepository, asientoRepository, lineaRepository, tenantService, dataSource };
}

function dto() {
  return {
    fecha: '2026-10-04',
    descripcion: 'Asiento manual de prueba',
    lineas: [
      { cuentaContableId: 1, descripcion: 'Debe', debe: 100, haber: 0 },
      { cuentaContableId: 1, descripcion: 'Haber', debe: 0, haber: 100 },
    ],
  } as any;
}

describe('ContabilidadService.createAsiento — empresa siempre del CLS', () => {
  it('genera el número con la secuencia de la empresa activa (nunca 0)', async () => {
    const { service, dataSource } = buildService({ empresaId: EMPRESA });
    await service.createAsiento(dto(), 42);

    const llamadaSecuencia = dataSource.query.mock.calls.find(
      ([sql]: any) => sql.includes('siguiente_numero_secuencia'),
    );
    expect(llamadaSecuencia).toBeDefined();
    expect(llamadaSecuencia![1]).toEqual([EMPRESA, 'ASI']);
  });

  it('sin contexto de empresa en el CLS: nunca persiste un asiento (nunca cae a empresaId=0)', async () => {
    const { service, asientoRepository, dataSource } = buildService({ empresaId: null });

    await expect(service.createAsiento(dto(), 42)).rejects.toThrow(ForbiddenException);

    expect(asientoRepository.save).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('siguiente_numero_secuencia'),
      expect.anything(),
    );
  });

  it('el asiento creado queda en BORRADOR con el usuario que lo creó', async () => {
    const { service, asientoRepository } = buildService({ empresaId: EMPRESA });
    await service.createAsiento(dto(), 42);

    expect(asientoRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ estado: EstadoAsiento.BORRADOR, userId: 42 }),
    );
  });
});
