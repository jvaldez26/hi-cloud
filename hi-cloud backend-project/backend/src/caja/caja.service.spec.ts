import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
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

// Caso real (caja #714, empresa 44, 2026-10-03): un access token renovado por
// /auth/refresh no traía sucursalId → abrirCaja() la escribía en silencio
// como NULL. Ahora corta con 400 en vez de crear la caja sin sucursal.
describe('CajaService.abrirCaja — sucursalId obligatorio', () => {
  it('sin sucursalId en el CLS: 400, no toca la BD', async () => {
    const d = buildDeps();
    d.tenantSvc.getSucursalId = () => undefined;
    const service = buildService(d);

    await expect(service.abrirCaja(1, 500)).rejects.toThrow(BadRequestException);

    expect(d.repo.findOne).not.toHaveBeenCalled();
    expect(d.repo.save).not.toHaveBeenCalled();
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

  // Caso real (caja #714, empresa 44, 2026-10-03): con sucursalId activa en
  // la sesión, el filtro `c.sucursalId = :sucursalId` excluía en silencio
  // las cajas con sucursalId NULL — la de Maximo nunca apareció en el
  // historial. Deben verse siempre (el frontend las marca "Sin sucursal").
  it('con sucursal activa en la sesión: incluye también las cajas con sucursalId NULL, no solo las de esa sucursal', async () => {
    const d = buildDeps();
    d.tenantSvc.getSucursalId = () => 45;
    const qb: any = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    d.repo.createQueryBuilder.mockReturnValue(qb);
    const service = buildService(d);

    await service.getHistorial(1, 20);

    expect(qb.andWhere).toHaveBeenCalledWith(
      '(c.sucursalId = :sucursalId OR c.sucursalId IS NULL)', { sucursalId: 45 },
    );
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

/**
 * Cierre de Caja — VENDEDOR nunca ve el balance/monto de una caja ABIERTA
 * (decisión 2026-10-09): ni en Historial, ni en Cierre Actual, ni en
 * ningún resumen. ADMIN/CONTADOR: sin cambios, ven e imprimen todo. Las
 * cajas CERRADAS tampoco cambian para nadie.
 *
 * Mismo criterio de fakes que el resto del archivo, con un helper propio
 * (makeCajaService/cajaBase) porque estos casos necesitan findOne() por id
 * y un facturas-detalle con datos reales — buildDeps()/cajaAbierta() de
 * arriba ya bastaban para los suyos y no hacía falta tocarlos.
 */
function cajaBase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, fecha: new Date('2026-10-09'), vendedorId: 10, vendedorNombre: 'Bellamar González',
    sucursalId: null, estado: EstadoCierre.ABIERTA,
    saldoApertura: 500, ventasEfectivo: 1200, ventasTarjeta: 300, ventasTransferencia: 50,
    ventasCredito: 0, cobrosRecibidos: 80, cobrosEfectivo: 80, cobrosOtrosMedios: 0,
    totalAnticipos: 0, anticiposEfectivo: 0, anticiposOtrosMedios: 0,
    gastosEfectivo: 20, retiros: 0, saldoCierre: 0, saldoFisico: 0, diferencia: 0,
    cantidadTransacciones: 5, empresaId: EMPRESA, userId: 1,
    ...overrides,
  };
}

function makeCajaService(opts: { cajas?: any[]; facturas?: any[]; cierreCajaCiego?: boolean } = {}) {
  const cajas = opts.cajas ?? [cajaBase()];
  const facturas = opts.facturas ?? [];

  const repo = {
    findOne: jest.fn(async ({ where }: any) => {
      const id = where?.id;
      const found = cajas.find(c => c.id === id && (where?.empresaId == null || c.empresaId === where.empresaId));
      return found ?? null;
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        addOrderBy: jest.fn(() => qb),
        skip: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getManyAndCount: jest.fn(async () => [cajas, cajas.length]),
        // getCajaHoyByUserId no filtra por los predicados reales en este fake
        // (el repo no reimplementa SQL) — basta con devolver la primera caja,
        // cada test de este bloque solo tiene UNA caja relevante.
        getOne: jest.fn(async () => cajas[0] ?? null),
      };
      return qb;
    }),
  };

  const dataSource = {
    // SELECT configuracion FROM empresa — getEmpresaCfg()
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT configuracion FROM empresa')) {
        return [{ configuracion: { cierreCajaCiego: opts.cierreCajaCiego === true } }];
      }
      // getFacturasDetalle: lookup del perfil de vendedor (usuarioId→vendedorId) y las facturas del turno
      if (sql.includes('FROM vendedores')) return [];
      if (sql.includes('FROM facturas f')) {
        return facturas.map(f => ({
          id: f.id, folio: f.folio, encf: f.encf ?? null, hora: f.hora ?? new Date(),
          clienteNombre: f.clienteNombre ?? 'Consumidor Final', formasPago: f.formasPago ?? [],
          subtotal: String(f.subtotal ?? 0), iva: String(f.iva ?? 0), total: String(f.total ?? 0),
          estado: f.estado ?? 'emitida',
        }));
      }
      return [{}];
    }),
    manager: {
      // recalcularDesdeBD — no importa el cuadre recalculado en estas pruebas.
      query: jest.fn(async () => [{}]),
      update: jest.fn(async () => undefined),
    },
  };

  const tenantService = { getEmpresaId: () => EMPRESA, getSucursalId: () => null };
  const realtimeService = { notify: jest.fn() };

  const svc = new CajaService(
    repo as any, {} as any, dataSource as any, tenantService as any, realtimeService as any,
  );
  return { svc, cajas, dataSource, repo };
}

describe('CajaService.obtenerUnaPorId — VENDEDOR nunca ve el monto de una caja ABIERTA', () => {
  it('VENDEDOR + caja ABIERTA: los montos se recortan y queda marcada ciegoCajaActivo', async () => {
    const { svc } = makeCajaService();
    const r = await svc.obtenerUnaPorId(1, UserRole.VENDEDOR);

    expect(r.ciegoCajaActivo).toBe(true);
    for (const campo of ['ventasEfectivo', 'ventasTarjeta', 'ventasTransferencia', 'ventasCredito',
      'cobrosRecibidos', 'cobrosEfectivo', 'cobrosOtrosMedios', 'totalAnticipos',
      'anticiposEfectivo', 'anticiposOtrosMedios', 'gastosEfectivo', 'retiros',
      'saldoCierre', 'diferencia', 'cantidadTransacciones',
      'efectivoEsperado', 'esperadoInconsistente', 'excesoRetiros']) {
      expect(r).not.toHaveProperty(campo);
    }
    // El estado y el id SIGUEN visibles — el frontend necesita saber que está
    // abierta para decidir qué pedir/ofrecer (p.ej. el botón de imprimir).
    expect(r.estado).toBe('abierta');
    expect(r.id).toBe(1);
  });

  it('VENDEDOR + caja CERRADA: sin cambios — los montos se ven completos', async () => {
    const { svc } = makeCajaService({ cajas: [cajaBase({ estado: EstadoCierre.CERRADA, saldoCierre: 1550 })] });
    const r = await svc.obtenerUnaPorId(1, UserRole.VENDEDOR);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
    expect(r.saldoCierre).toBe(1550);
  });

  it('ADMIN + caja ABIERTA: sin cambios — ve todo', async () => {
    const { svc } = makeCajaService();
    const r = await svc.obtenerUnaPorId(1, UserRole.ADMIN);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
    expect(r.efectivoEsperado).toEqual(expect.any(Number));
  });

  it('CONTADOR + caja ABIERTA: sin cambios — ve todo', async () => {
    const { svc } = makeCajaService();
    const r = await svc.obtenerUnaPorId(1, UserRole.CONTADOR);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
  });

  it('caja inexistente: NotFoundException, para cualquier rol', async () => {
    const { svc } = makeCajaService();
    await expect(svc.obtenerUnaPorId(999, UserRole.VENDEDOR)).rejects.toThrow(NotFoundException);
  });
});

describe('CajaService.getHistorial — recorta SOLO las filas ABIERTA cuando el rol es VENDEDOR', () => {
  it('VENDEDOR: la fila CERRADA sale completa, la ABIERTA sale recortada, en la MISMA respuesta', async () => {
    const { svc } = makeCajaService({
      cajas: [
        cajaBase({ id: 1, estado: EstadoCierre.ABIERTA }),
        cajaBase({ id: 2, estado: EstadoCierre.CERRADA, saldoCierre: 900 }),
      ],
    });
    const { data } = await svc.getHistorial(1, 20, undefined, undefined, undefined, UserRole.VENDEDOR);

    const abierta = data.find((c: any) => c.id === 1);
    const cerrada = data.find((c: any) => c.id === 2);
    expect(abierta.ciegoCajaActivo).toBe(true);
    expect(abierta.ventasEfectivo).toBeUndefined();
    expect(cerrada.ciegoCajaActivo).toBeUndefined();
    expect(cerrada.ventasEfectivo).toBe(1200);
    expect(cerrada.saldoCierre).toBe(900);
  });

  it('ADMIN: ninguna fila se recorta, ni siquiera las ABIERTA', async () => {
    const { svc } = makeCajaService({
      cajas: [cajaBase({ id: 1, estado: EstadoCierre.ABIERTA })],
    });
    const { data } = await svc.getHistorial(1, 20, undefined, undefined, undefined, UserRole.ADMIN);

    expect(data[0].ciegoCajaActivo).toBeUndefined();
    expect(data[0].ventasEfectivo).toBe(1200);
  });

  it('sin rol (defensivo — nunca debería pasar, pero no debe fallar): no recorta nada', async () => {
    const { svc } = makeCajaService();
    const { data } = await svc.getHistorial(1, 20);
    expect(data[0].ciegoCajaActivo).toBeUndefined();
  });
});

describe('CajaService.getCajaHoyByUserId — Cierre Actual del propio VENDEDOR', () => {
  it('su caja ABIERTA: recortada SIEMPRE, aunque la empresa tenga cierreCajaCiego apagado', async () => {
    const { svc } = makeCajaService({ cierreCajaCiego: false });
    const r: any = await svc.getCajaHoyByUserId(1);

    expect(r.ciegoCajaActivo).toBe(true);
    expect(r.ventasEfectivo).toBeUndefined();
  });

  it('su caja ABIERTA, empresa CON cierreCajaCiego activo: sigue recortada (las dos reglas coinciden, no se pisan)', async () => {
    const { svc } = makeCajaService({ cierreCajaCiego: true });
    const r: any = await svc.getCajaHoyByUserId(1);

    expect(r.ciegoCajaActivo).toBe(true);
    expect(r.ventasEfectivo).toBeUndefined();
  });

  it('su caja ya CERRADA: datos completos para que pueda imprimir', async () => {
    const { svc } = makeCajaService({
      cajas: [cajaBase({ estado: EstadoCierre.CERRADA, saldoCierre: 1550 })],
    });
    const r: any = await svc.getCajaHoyByUserId(1);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
  });
});

describe('CajaService.getDatosParaImprimir — datos COMPLETOS, para después de la autorización de supervisor', () => {
  it('devuelve la caja SIN recortar (el guard de la ruta ya autorizó, o el rol no es VENDEDOR) + el detalle de facturas', async () => {
    const { svc } = makeCajaService({
      facturas: [{ id: 1, folio: 'B0100000001', total: 1200, subtotal: 1017, iva: 183 }],
    });
    // usuario.id coincide con cajaBase().userId (1) — es SU propia caja.
    const r: any = await svc.getDatosParaImprimir(1, { id: 1, role: UserRole.VENDEDOR });

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
    expect(r.efectivoEsperado).toEqual(expect.any(Number));
    expect(r.facturasDetalle.facturas).toHaveLength(1);
    expect(r.facturasDetalle.resumen.total).toBe(1200);
  });

  it('VENDEDOR pidiendo el detalle de la caja de OTRO cajero: ForbiddenException (la autorización de supervisor no reemplaza el control de dueño)', async () => {
    const { svc } = makeCajaService({
      cajas: [cajaBase({ userId: 999, vendedorId: 999 })], // ni userId ni vendedorId coinciden con quien pide
    });
    await expect(
      svc.getDatosParaImprimir(1, { id: 10, role: UserRole.VENDEDOR }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('caja inexistente: NotFoundException', async () => {
    const { svc } = makeCajaService();
    await expect(
      svc.getDatosParaImprimir(999, { id: 10, role: UserRole.VENDEDOR }),
    ).rejects.toThrow(NotFoundException);
  });
});
