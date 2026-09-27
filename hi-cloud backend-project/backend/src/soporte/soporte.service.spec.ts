import { SoporteService } from './soporte.service';
import { AsuntoSoporte, EstadoTicketSoporte } from './entities/soporte-ticket.entity';
import { NotFoundException } from '@nestjs/common';

/**
 * SoporteService — tickets de un usuario autenticado hacia Super Admin.
 *
 * Reglas que estos tests fijan:
 *   - Nombre/correo del ticket SIEMPRE salen de `usuario` (la sesión), nunca
 *     de un input — el DTO ni siquiera tiene esos campos.
 *   - El contexto automático se arma con lo que el SERVIDOR conoce con
 *     certeza (empresaId, sucursalId, rol) — nunca lo que mandara el
 *     cliente para esos campos — más lo que solo el cliente sabe (url,
 *     navegador, buildId).
 *   - misTickets() nunca mezcla usuarios ni empresas — un vendedor de la
 *     empresa 7 no ve tickets de la empresa 9 ni de otro usuario de la 7.
 *   - Un correo caído en crear()/responder() nunca revienta la operación
 *     (fire-and-forget, igual que enviarMensajeSoporte).
 */

function fakeRepo(rows: any[] = []) {
  let seq = 1;
  const created: any[] = [];
  let ultimaQuery: any = null;

  const qb: any = {
    where:  function (sql: string, params: any) { this._where = [[sql, params]]; return this; },
    andWhere: function (sql: string, params?: any) { (this._where ??= []).push([sql, params]); return this; },
    orderBy: function () { return this; },
    skip: function () { return this; },
    take: function () { return this; },
    getManyAndCount: async function () {
      ultimaQuery = this._where;
      return [rows, rows.length];
    },
  };

  const repo = {
    create: (data: any) => ({ id: undefined, isActive: true, estado: EstadoTicketSoporte.ABIERTO, ...data }),
    save: async (entity: any) => {
      const saved = entity.id ? entity : { ...entity, id: seq++ };
      created.push(saved);
      return saved;
    },
    findOne: async ({ where }: any) => rows.find(r => r.id === where.id && (where.isActive === undefined || r.isActive === where.isActive)) ?? null,
    createQueryBuilder: () => ({ ...qb, _where: [] }),
  };

  return { repo, created, getUltimaQuery: () => ultimaQuery };
}

function makeService(rows: any[] = [], empresaIdActual: number | null = 7) {
  const { repo, created, getUltimaQuery } = fakeRepo(rows);
  const enviados: any[] = [];
  const emailService = { enviar: jest.fn(async (payload: any) => { enviados.push(payload); return { exitoso: true }; }) };
  const tenantService = { getEmpresaIdOrNull: () => empresaIdActual };

  const svc = new SoporteService(repo as any, tenantService as any, emailService as any);
  return { svc, repo, created, enviados, getUltimaQuery };
}

const USUARIO = { id: 5, nombre: 'Ana Vendedora', email: 'ana@empresa.com', role: 'vendedor', empresaId: 7, sucursalId: 2 } as any;

describe('SoporteService.crear', () => {
  it('arma el contexto automático completo: server-side + lo que manda el cliente', async () => {
    const { svc, created } = makeService();

    const ticket = await svc.crear({
      asunto: AsuntoSoporte.ERROR_TECNICO,
      mensaje: 'La factura no se imprime',
      contexto: { url: '/pos', modulo: 'POS', navegador: 'Chrome 130', buildId: 'abc123' },
    }, USUARIO);

    expect(ticket.contextoAutomatico).toEqual({
      empresaId: 7, sucursalId: 2, rol: 'vendedor',
      usuarioNombre: 'Ana Vendedora', usuarioEmail: 'ana@empresa.com',
      url: '/pos', modulo: 'POS', navegador: 'Chrome 130', buildId: 'abc123',
    });
    expect(ticket.usuarioId).toBe(5);
    expect(ticket.empresaId).toBe(7);
    expect(created).toHaveLength(1);
  });

  it('nombre/correo NUNCA vienen del cliente — el DTO no tiene esos campos, siempre salen de la sesión', async () => {
    const { svc } = makeService();
    // Un cliente que intente colar nombre/email en el DTO (objeto crudo, sin
    // pasar por el tipado) no logra nada: crear() solo lee `usuario`.
    const dtoConIntentoDeSuplantar: any = {
      asunto: AsuntoSoporte.OTRO, mensaje: 'Mensaje de prueba suficientemente largo',
      nombre: 'Otro Nombre', email: 'otro@correo.com',
    };
    const ticket = await svc.crear(dtoConIntentoDeSuplantar, USUARIO);
    expect(ticket.contextoAutomatico).toMatchObject({
      usuarioNombre: 'Ana Vendedora', usuarioEmail: 'ana@empresa.com',
    });
  });

  it('sin contexto de empresa (null): el ticket se crea igual, empresaId queda null', async () => {
    const { svc } = makeService([], null);
    const usuarioSinEmpresa = { ...USUARIO, empresaId: null };
    const ticket = await svc.crear({ asunto: AsuntoSoporte.DUDA_USO, mensaje: 'Cómo hago una NC?' }, usuarioSinEmpresa);
    expect(ticket.empresaId).toBeUndefined();
    expect((ticket.contextoAutomatico as any).empresaId).toBeNull();
  });

  it('envía el correo de aviso a NOTIF_ADMIN_EMAIL (o soporte@hicloudrd.com por defecto)', async () => {
    delete process.env['NOTIF_ADMIN_EMAIL'];
    const { svc, enviados } = makeService();
    await svc.crear({ asunto: AsuntoSoporte.FACTURACION, mensaje: 'Duda sobre un cobro' }, USUARIO);
    // Fire-and-forget: esperar el microtask antes de comprobar.
    await new Promise(r => setImmediate(r));
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe('soporte@hicloudrd.com');
    expect(enviados[0].replyTo).toBe('ana@empresa.com');
  });

  it('un correo que falla NO revienta la creación del ticket', async () => {
    const { repo } = fakeRepo();
    const tenantService = { getEmpresaIdOrNull: () => 7 };
    const emailService = { enviar: jest.fn().mockRejectedValue(new Error('SMTP caído')) };
    const svc = new SoporteService(repo as any, tenantService as any, emailService as any);

    await expect(svc.crear({ asunto: AsuntoSoporte.OTRO, mensaje: 'Mensaje de prueba largo' }, USUARIO))
      .resolves.toMatchObject({ usuarioId: 5 });
  });
});

describe('SoporteService.misTickets', () => {
  it('un usuario NO ve tickets de otro usuario, aunque sean de la misma empresa', async () => {
    const rows = [
      { id: 1, usuarioId: 5, empresaId: 7, isActive: true },
      { id: 2, usuarioId: 9, empresaId: 7, isActive: true }, // de otro usuario
    ];
    const { svc, getUltimaQuery } = makeService(rows);
    await svc.misTickets(USUARIO, { limit: 10, page: 1 } as any);
    const where = getUltimaQuery();
    expect(where.some((w: any) => w[0].includes('usuarioId') && w[1]?.usuarioId === 5)).toBe(true);
  });

  it('el mismo usuario en OTRA empresa (multi-empresa) no mezcla tickets entre empresas', async () => {
    const { svc, getUltimaQuery } = makeService([]);
    await svc.misTickets(USUARIO, { limit: 10, page: 1 } as any);
    const where = getUltimaQuery();
    expect(where.some((w: any) => w[0].includes('empresaId') && w[1]?.empresaId === 7)).toBe(true);
  });

  it('usuario sin empresaId activo (caso raro, ej. super_admin): filtra por empresaId IS NULL, no por "todas"', async () => {
    const { svc, getUltimaQuery } = makeService([]);
    await svc.misTickets({ ...USUARIO, empresaId: null }, { limit: 10, page: 1 } as any);
    const where = getUltimaQuery();
    expect(where.some((w: any) => w[0].includes('IS NULL'))).toBe(true);
  });
});

describe('SoporteService.responder', () => {
  it('guarda la respuesta, pasa el ticket a RESUELTO y avisa por correo al usuario del ticket', async () => {
    const rows = [{
      id: 1, usuarioId: 5, empresaId: 7, isActive: true, mensaje: 'Ayuda',
      estado: EstadoTicketSoporte.ABIERTO,
      contextoAutomatico: { usuarioEmail: 'ana@empresa.com', usuarioNombre: 'Ana' },
    }];
    const { svc, enviados } = makeService(rows);
    const admin = { id: 1, nombre: 'Super Admin', email: 'admin@hicloudrd.com', role: 'super_admin' } as any;

    const actualizado = await svc.responder(1, { respuestaAdmin: 'Ya está resuelto, revisa de nuevo.' }, admin);

    expect(actualizado.estado).toBe(EstadoTicketSoporte.RESUELTO);
    expect(actualizado.respondidoPor).toBe(1);
    expect(actualizado.respondidoEn).toBeInstanceOf(Date);

    await new Promise(r => setImmediate(r));
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe('ana@empresa.com');
  });

  it('ticket inexistente: rechaza con NotFoundException', async () => {
    const { svc } = makeService([]);
    await expect(svc.responder(999, { respuestaAdmin: 'x' }, {} as any)).rejects.toThrow(NotFoundException);
  });
});
