import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SupervisorPoliticaService } from './supervisor-politica.service';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';

const EMPRESA = 7;
const CAJERO = 10;

function buildService(opts: { filas?: any[]; dsQueryImpl?: (sql: string, params: any[]) => any; tokenAffected?: number } = {}) {
  const filas = opts.filas ?? [];

  const politicaRepo = {
    find:    jest.fn().mockImplementation(async ({ where }: any) =>
      filas.filter(f => f.empresaId === where.empresaId && (!where.clave || f.clave === where.clave))),
    findOne: jest.fn().mockImplementation(async ({ where }: any) =>
      filas.find(f => f.empresaId === where.empresaId && f.clave === where.clave) ?? null),
    upsert:  jest.fn().mockImplementation(async (row: any) => {
      const i = filas.findIndex(f => f.empresaId === row.empresaId && f.clave === row.clave);
      if (i >= 0) filas[i] = { ...filas[i], ...row }; else filas.push(row);
    }),
  };

  // consumirToken() usa autorizacionRepo.createQueryBuilder().update()...execute()
  // (TypeORM QueryBuilder, no dataSource.query) — se encadena un mock fluido
  // que siempre resuelve { affected: opts.tokenAffected }.
  const qb: any = {};
  ['update', 'set', 'where', 'andWhere'].forEach(m => { qb[m] = jest.fn(() => qb); });
  qb.execute = jest.fn().mockResolvedValue({ affected: opts.tokenAffected ?? 0 });

  const autorizacionRepo = {
    create: jest.fn((x: any) => x),
    save:   jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => qb),
  };

  const query = jest.fn(opts.dsQueryImpl ?? (() => Promise.resolve([])));
  const dataSource = { query };

  const auditoria = { registrar: jest.fn().mockResolvedValue(undefined) };

  const svc = new SupervisorPoliticaService(politicaRepo as any, autorizacionRepo as any, dataSource as any, auditoria as any);
  return { svc, politicaRepo, autorizacionRepo, dataSource, auditoria, filas };
}

describe('SupervisorPoliticaService.listarPoliticas', () => {
  it('sin filas guardadas, devuelve el catálogo completo con los defaults', async () => {
    const { svc } = buildService();
    const lista = await svc.listarPoliticas(EMPRESA);
    expect(lista.length).toBeGreaterThan(20);
    const creditoDefault = lista.find(p => p.clave === 'venta_credito');
    expect(creditoDefault).toMatchObject({ requerido: false, modo: 'cada_vez' });
    const crearProductoDefault = lista.find(p => p.clave === 'crear_producto');
    expect(crearProductoDefault).toMatchObject({ requerido: true, modo: 'sesion' });
  });

  it('con una fila guardada, esa clave refleja el valor guardado, el resto sigue en default', async () => {
    const { svc } = buildService({ filas: [{ empresaId: EMPRESA, clave: 'venta_credito', requerido: true, modo: 'sesion' }] });
    const lista = await svc.listarPoliticas(EMPRESA);
    expect(lista.find(p => p.clave === 'venta_credito')).toMatchObject({ requerido: true, modo: 'sesion' });
    expect(lista.find(p => p.clave === 'crear_producto')).toMatchObject({ requerido: true, modo: 'sesion' }); // default, no tocado
  });
});

describe('SupervisorPoliticaService.guardarPoliticas', () => {
  it('rechaza una clave desconocida sin guardar nada', async () => {
    const { svc, politicaRepo } = buildService();
    await expect(svc.guardarPoliticas(EMPRESA, [{ clave: 'no-existe', requerido: true, modo: 'sesion' }], { id: 1, nombre: 'Admin' }))
      .rejects.toThrow(BadRequestException);
    expect(politicaRepo.upsert).not.toHaveBeenCalled();
  });

  it('rechaza un modo inválido', async () => {
    const { svc } = buildService();
    await expect(svc.guardarPoliticas(EMPRESA, [{ clave: 'venta_credito', requerido: true, modo: 'otro' as any }], { id: 1, nombre: 'Admin' }))
      .rejects.toThrow(BadRequestException);
  });

  it('guarda y audita cada clave que cambió', async () => {
    const { svc, politicaRepo, auditoria } = buildService();
    await svc.guardarPoliticas(EMPRESA, [{ clave: 'venta_credito', requerido: true, modo: 'sesion' }], { id: 1, nombre: 'Admin' });
    expect(politicaRepo.upsert).toHaveBeenCalledTimes(1);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: AccionAuditoria.UPDATE, modulo: 'supervisor-politicas', entidadId: 'venta_credito', empresaId: EMPRESA }),
    );
  });

  it('no guarda ni audita una clave cuyo valor no cambió', async () => {
    const { svc, politicaRepo, auditoria } = buildService({
      filas: [{ empresaId: EMPRESA, clave: 'venta_credito', requerido: true, modo: 'sesion' }],
    });
    await svc.guardarPoliticas(EMPRESA, [{ clave: 'venta_credito', requerido: true, modo: 'sesion' }], { id: 1, nombre: 'Admin' });
    expect(politicaRepo.upsert).not.toHaveBeenCalled();
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});

describe('SupervisorPoliticaService.validarAutorizacion', () => {
  // obtenerPolitica() lee de politicaRepo (vía `filas`), NUNCA de
  // dataSource.query — dataSource solo lo usan sesionActiva()/consumirToken().
  const politicaSesion   = { empresaId: EMPRESA, clave: 'cerrar_caja', requerido: true, modo: 'sesion' as const };
  const politicaCadaVez  = { empresaId: EMPRESA, clave: 'cerrar_caja', requerido: true, modo: 'cada_vez' as const };
  const politicaApagada  = { empresaId: EMPRESA, clave: 'cerrar_caja', requerido: false, modo: 'sesion' as const };

  it('política desmarcada → no lanza, sin consultar la BD', async () => {
    const { svc, dataSource } = buildService({ filas: [politicaApagada] });
    const query = jest.fn();
    (dataSource as any).query = query;
    await expect(svc.validarAutorizacion(EMPRESA, CAJERO, 'cerrar_caja', {})).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it('modo sesión, sin sessionId ni sesión activa → 403', async () => {
    const { svc, dataSource } = buildService({ filas: [politicaSesion] });
    (dataSource as any).query = jest.fn().mockResolvedValue([]); // sesionActiva() no encuentra nada
    await expect(svc.validarAutorizacion(EMPRESA, CAJERO, 'cerrar_caja', {})).rejects.toThrow(ForbiddenException);
  });

  it('modo sesión, con sesión activa (sin sessionId explícito) → OK', async () => {
    const { svc, dataSource } = buildService({ filas: [politicaSesion] });
    (dataSource as any).query = jest.fn().mockResolvedValue([{ id: 99 }]);
    await expect(svc.validarAutorizacion(EMPRESA, CAJERO, 'cerrar_caja', {})).resolves.toBeUndefined();
  });

  it('modo cada_vez, sin token → 403, nunca intenta consumir nada', async () => {
    const { svc, autorizacionRepo } = buildService({ filas: [politicaCadaVez] });
    await expect(svc.validarAutorizacion(EMPRESA, CAJERO, 'cerrar_caja', {})).rejects.toThrow(ForbiddenException);
    expect(autorizacionRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('modo cada_vez, con token que no consume fila (vencido/usado/ajeno) → 403', async () => {
    const { svc } = buildService({ filas: [politicaCadaVez], tokenAffected: 0 });
    await expect(svc.validarAutorizacion(EMPRESA, CAJERO, 'cerrar_caja', { token: 'tok1' })).rejects.toThrow(ForbiddenException);
  });

  it('modo cada_vez, con token válido (consumido) → OK', async () => {
    const { svc } = buildService({ filas: [politicaCadaVez], tokenAffected: 1 });
    await expect(svc.validarAutorizacion(EMPRESA, CAJERO, 'cerrar_caja', { token: 'tok1' })).resolves.toBeUndefined();
  });
});

describe('SupervisorPoliticaService.emitirAutorizacionCadaVez', () => {
  it('genera y guarda un token de un solo uso con expiración futura', async () => {
    const { svc, autorizacionRepo } = buildService();
    const token = await svc.emitirAutorizacionCadaVez(EMPRESA, CAJERO, 5, 'cerrar_caja');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(autorizacionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: EMPRESA, cajeroId: CAJERO, supervisorId: 5, clave: 'cerrar_caja', usado: false, token }),
    );
  });
});
