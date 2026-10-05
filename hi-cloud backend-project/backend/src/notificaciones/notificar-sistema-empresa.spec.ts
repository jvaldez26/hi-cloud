import { NotificacionesService } from './notificaciones.service';
import { TipoNotificacion } from './entities/notificacion-enviada.entity';

/**
 * Bug real (auditoría HiCloud Xlink, 2026-10-03, Fase 1f): la notificación
 * de "documento recibido" (campanita) a los admin/contador de una empresa
 * usaba `users.role` (el rol GLOBAL) en vez de `usuario_empresa.rol` (el rol
 * EN ESA empresa) — mismo bug class que RolesGuard ya corrigió para
 * autorización (ver roles.guard.ts, checkMembresia). Además tenía
 * `LIMIT 5`: con más de 5 admin/contador en una empresa, el resto nunca se
 * enteraba de nada.
 */
const EMPRESA = 7;

function buildService(filas: { id: number }[]) {
  const query = jest.fn().mockResolvedValue(filas);
  const logRepository = {
    create: jest.fn((d: any) => d),
    save:   jest.fn().mockResolvedValue(undefined),
  };
  const realtimeService = { notify: jest.fn() };
  const service = new NotificacionesService(
    logRepository as any,
    {} as any, // emailService
    {} as any, // whatsAppService
    { get: jest.fn().mockReturnValue('true') } as any, // configService
    { query } as any, // dataSource
    {} as any, // tenantService
    realtimeService as any,
  );
  return { service, query, logRepository, realtimeService };
}

describe('NotificacionesService.notificarSistemaEmpresa — destinatarios admin/contador EN LA EMPRESA', () => {
  it('filtra por usuario_empresa.rol, no por users.role', async () => {
    const { service, query } = buildService([{ id: 1 }]);

    await service.notificarSistemaEmpresa(EMPRESA, TipoNotificacion.XLINK_DOCUMENTO_RECIBIDO, 'Asunto', 'Mensaje');

    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/ue\.rol IN \('admin','contador'\)/);
    expect(sql).not.toMatch(/u\.role IN/);
  });

  it('sin LIMIT: la query no acota el número de destinatarios', async () => {
    const { service, query } = buildService([{ id: 1 }]);

    await service.notificarSistemaEmpresa(EMPRESA, TipoNotificacion.XLINK_DOCUMENTO_RECIBIDO, 'Asunto', 'Mensaje');

    const [sql] = query.mock.calls[0];
    expect(sql.toUpperCase()).not.toMatch(/LIMIT\s+\d/);
  });

  it('con más de 5 admin/contador, notifica a TODOS (no solo a los primeros 5)', async () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ id: i + 1 }));
    const { service, logRepository } = buildService(seis);

    await service.notificarSistemaEmpresa(EMPRESA, TipoNotificacion.XLINK_DOCUMENTO_RECIBIDO, 'Asunto', 'Mensaje');

    expect(logRepository.save).toHaveBeenCalledTimes(6);
  });
});
