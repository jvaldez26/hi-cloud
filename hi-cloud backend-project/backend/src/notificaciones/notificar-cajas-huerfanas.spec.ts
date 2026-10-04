import { NotificacionesService } from './notificaciones.service';
import { TipoNotificacion, CanalNotificacion } from './entities/notificacion-enviada.entity';

/**
 * Caso real (2026-10-04): una caja abierta un día y nunca cerrada quedaba
 * invisible hasta que alguien la notaba a mano — "No hay cajas abiertas hoy"
 * solo mira fecha = hoy. Aviso diario (campanita, canal SISTEMA) a
 * ADMIN/CONTADOR de la empresa si hay alguna caja de un día anterior abierta.
 */
const EMPRESA = 7;

function buildService(cierresCajaRows: { id: number; vendedorNombre: string | null; fecha: string }[], adminIds: { id: number }[] = [{ id: 1 }]) {
  const query = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('FROM cierres_caja')) return Promise.resolve(cierresCajaRows);
    if (sql.includes('usuario_empresa'))    return Promise.resolve(adminIds);
    return Promise.resolve([]);
  });
  const logRepository = {
    create: jest.fn((d: any) => d),
    save:   jest.fn().mockResolvedValue(undefined),
  };
  const service = new NotificacionesService(
    logRepository as any,
    {} as any, // emailService
    {} as any, // whatsAppService
    { get: jest.fn().mockReturnValue('true') } as any, // configService
    { query } as any, // dataSource
    {} as any, // tenantService
  );
  return { service, query, logRepository };
}

describe('NotificacionesService.notificarCajasHuerfanas', () => {
  it('sin cajas huérfanas: no notifica a nadie', async () => {
    const { service, logRepository } = buildService([]);

    const n = await service.notificarCajasHuerfanas(EMPRESA);

    expect(n).toBe(0);
    expect(logRepository.save).not.toHaveBeenCalled();
  });

  it('con una caja huérfana: notifica (campanita, canal SISTEMA) a cada admin/contador de la empresa', async () => {
    const { service, logRepository } = buildService(
      [{ id: 1, vendedorNombre: 'Maximo Almonte', fecha: '2026-10-03' }],
      [{ id: 10 }, { id: 20 }],
    );

    const n = await service.notificarCajasHuerfanas(EMPRESA);

    expect(n).toBe(1);
    expect(logRepository.save).toHaveBeenCalledTimes(2); // uno por admin/contador
    const guardado = logRepository.create.mock.calls[0][0];
    expect(guardado.tipo).toBe(TipoNotificacion.CAJA_HUERFANA);
    expect(guardado.canal).toBe(CanalNotificacion.SISTEMA);
    expect(guardado.mensaje).toContain('Maximo Almonte');
    expect(guardado.mensaje).toContain('03/10/2026');
  });

  it('solo consulta cierres_caja de la empresa pedida, cajas ABIERTA y de un día anterior a hoy', async () => {
    const { service, query } = buildService([]);

    await service.notificarCajasHuerfanas(EMPRESA);

    const [sql, params] = query.mock.calls.find(([s]: [string]) => s.includes('FROM cierres_caja'))!;
    expect(sql).toMatch(/estado = 'abierta'/);
    expect(sql).toMatch(/fecha < \$2/);
    expect(params[0]).toBe(EMPRESA);
  });
});
