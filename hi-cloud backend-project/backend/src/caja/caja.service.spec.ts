import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { CajaService } from './caja.service';
import { CierreCaja, EstadoCierre } from './entities/cierre-caja.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

const EMPRESA = 7;

function buildDeps() {
  return {
    repo: {
      findOne: jest.fn(),
      find:    jest.fn(),
      update:  jest.fn().mockResolvedValue(undefined),
      create:  jest.fn((d: any) => d),
      save:    jest.fn((e: any) => Promise.resolve({ id: 1, ...e })),
      createQueryBuilder: jest.fn(),
    },
    retiroRepo: { find: jest.fn(), findOne: jest.fn() },
    dataSource: {
      // resolverMiVendedorId() y getEmpresaCfg()/recalcularDesdeBD() fuera de
      // transacción usan rutas distintas (query directo vs manager.query) —
      // ambas se mockean con una fila vacía por defecto, suficiente para que
      // Number(row?.campo ?? 0) resuelva a 0 sin reventar.
      query:   jest.fn().mockResolvedValue([]),
      manager: {
        query:  jest.fn().mockResolvedValue([{}]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    },
    tenantSvc:   { getEmpresaId: () => EMPRESA, getSucursalId: () => undefined },
    realtimeSvc: { notify: jest.fn() },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): CajaService {
  return new CajaService(d.repo as any, d.retiroRepo as any, d.dataSource as any, d.tenantSvc as any, d.realtimeSvc as any);
}

function cajaAbierta(overrides: Partial<CierreCaja> = {}): CierreCaja {
  return {
    id: 1, fecha: new Date('2026-10-03'), vendedorId: 5, vendedorNombre: 'Maximo',
    sucursalId: undefined, estado: EstadoCierre.ABIERTA,
    saldoApertura: 0, ventasEfectivo: 0, ventasTarjeta: 0, ventasTransferencia: 0, ventasCredito: 0,
    cobrosRecibidos: 0, cobrosEfectivo: 0, cobrosOtrosMedios: 0,
    totalAnticipos: 0, anticiposEfectivo: 0, anticiposOtrosMedios: 0,
    gastosEfectivo: 0, retiros: 0, saldoCierre: 0, saldoFisico: 0, diferencia: 0,
    formulaVersion: 2, cantidadTransacciones: 0, userId: 100, empresaId: EMPRESA,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as CierreCaja;
}

// Caso real (2026-10-04): cerrarCaja() nunca verificaba que la caja
// perteneciera a quien la cerraba — cualquier VENDEDOR podía cerrar la de
// otro cajero con solo mandar su id en la URL.
describe('CajaService.cerrarCaja — pertenencia', () => {
  it('VENDEDOR no puede cerrar la caja de OTRO cajero (ni userId ni perfil de vendedor coinciden)', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 100, vendedorId: 5 }));
    d.dataSource.query.mockResolvedValue([]); // sin perfil de vendedor para el usuario 999
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 999, role: UserRole.VENDEDOR }),
    ).rejects.toThrow(ForbiddenException);

    expect(d.repo.update).not.toHaveBeenCalled(); // nunca llega a tocar la caja
  });

  it('VENDEDOR SÍ puede cerrar su propia caja (coincide por userId — él mismo la abrió)', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 42, vendedorId: 5 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 42, role: UserRole.VENDEDOR }),
    ).resolves.toBeDefined();

    expect(d.repo.update).toHaveBeenCalled();
  });

  it('VENDEDOR SÍ puede cerrar la caja que le abrió un encargado (coincide por su perfil de vendedor, no por userId)', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5 })); // la abrió el encargado #999
    d.dataSource.query.mockResolvedValue([{ id: 5 }]); // el perfil de vendedor del usuario #42 es el 5
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 42, role: UserRole.VENDEDOR }),
    ).resolves.toBeDefined();

    expect(d.repo.update).toHaveBeenCalled();
  });

  it('ADMIN/CONTADOR pueden cerrar la caja de cualquier cajero — pero sin motivo, 400', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1, role: UserRole.ADMIN }),
    ).rejects.toThrow(BadRequestException);

    expect(d.repo.update).not.toHaveBeenCalled();
  });

  it('ADMIN/CONTADOR con motivo: sí puede cerrar la caja de otro cajero, y el motivo queda en notas', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5, vendedorNombre: 'Maximo Almonte', notas: undefined }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1, role: UserRole.ADMIN, nombre: 'Jean Admin' }, 'Cajero se fue sin cerrar'),
    ).resolves.toBeDefined();

    expect(d.repo.update).toHaveBeenCalled();
    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.notas).toContain('Jean Admin');
    expect(cambios.notas).toContain('Maximo Almonte');
    expect(cambios.notas).toContain('Cajero se fue sin cerrar');
  });

  it('con motivo en blanco (solo espacios): sigue rechazando, no cuenta como motivo real', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1, role: UserRole.ADMIN }, '   '),
    ).rejects.toThrow(BadRequestException);
  });

  it('ADMIN cerrando SU PROPIA caja: no exige motivo', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, vendedorId: 5 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1, role: UserRole.ADMIN }),
    ).resolves.toBeDefined();

    expect(d.repo.update).toHaveBeenCalled();
  });

  it('sin `usuario` (compatibilidad): no aplica el chequeo de pertenencia', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5 }));
    const service = buildService(d);

    await expect(service.cerrarCaja(1, 500)).resolves.toBeDefined();
  });

  it('caja ya cerrada: BadRequestException, sin importar quién la cierre', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ estado: EstadoCierre.CERRADA }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1, role: UserRole.VENDEDOR }),
    ).rejects.toThrow(BadRequestException);
  });
});

// Caso real (2026-10-04): una caja abierta un día y nunca cerrada quedaba
// invisible — "No hay cajas abiertas hoy" solo mira fecha = hoy.
describe('CajaService.getCajasAbiertas', () => {
  it('cada fila trae diasAbierta: 0 para una abierta hoy, >0 para una huérfana de ayer', async () => {
    const d = buildDeps();
    const hoy  = fechaHoyRD();
    const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().substring(0, 10);

    const cajaHoyRow  = cajaAbierta({ id: 1, fecha: new Date(`${hoy}T00:00:00Z`) as any, vendedorNombre: 'Elvia' });
    const cajaAyerRow = cajaAbierta({ id: 2, fecha: new Date(`${ayer}T00:00:00Z`) as any, vendedorNombre: 'Maximo' });
    d.repo.find.mockResolvedValue([cajaAyerRow, cajaHoyRow]); // misma lista en las dos consultas (antes/después de recalcular)

    const service = buildService(d);
    const result: any[] = await service.getCajasAbiertas();

    const porId = new Map(result.map(r => [r.id, r]));
    expect(porId.get(1).diasAbierta).toBe(0);
    expect(porId.get(2).diasAbierta).toBe(1);
  });

  it('solo trae estado ABIERTA de la empresa activa', async () => {
    const d = buildDeps();
    d.repo.find.mockResolvedValue([]);
    const service = buildService(d);

    await service.getCajasAbiertas();

    expect(d.repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { empresaId: EMPRESA, estado: EstadoCierre.ABIERTA } }),
    );
  });
});

// Caso real (2026-10-04): el historial listaba las ABIERTA mezcladas por
// fecha — una huérfana de hace varios días podía quedar varias páginas abajo.
describe('CajaService.getHistorial — ABIERTA siempre primero', () => {
  it('ordena por estado=abierta antes que por fecha', async () => {
    const d = buildDeps();
    const qb: any = {
      where:      jest.fn().mockReturnThis(),
      andWhere:   jest.fn().mockReturnThis(),
      orderBy:    jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip:       jest.fn().mockReturnThis(),
      take:       jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[cajaAbierta({ id: 1 })], 1]),
    };
    d.repo.createQueryBuilder.mockReturnValue(qb);
    const service = buildService(d);

    await service.getHistorial(1, 20);

    expect(qb.orderBy).toHaveBeenCalledWith(`CASE WHEN c.estado = 'abierta' THEN 0 ELSE 1 END`, 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('c.fecha', 'DESC');
  });

  it('una fila ABIERTA en el historial trae efectivoEsperado calculado (no undefined) — para que "Cerrar caja" desde ahí arranque con el número real', async () => {
    const d = buildDeps();
    const qb: any = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[cajaAbierta({ id: 1, saldoApertura: 1000 })], 1]),
    };
    d.repo.createQueryBuilder.mockReturnValue(qb);
    const service = buildService(d);

    const { data } = await service.getHistorial(1, 20);

    expect((data[0] as any).efectivoEsperado).toBeDefined();
  });
});
