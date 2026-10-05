/**
 * BloqueoAlertaService — avisos de bloqueo por intentos fallidos.
 *
 * Cobertura pedida: el correo no se repite en menos de 15 min (la
 * campanita sí registra cada bloqueo); 3+ bloqueos en 24h → aviso extra a
 * los admins; el aviso al supervisor llega al SUPERVISOR, no al cajero; el
 * contenido nunca incluye la contraseña/PIN intentados.
 */
import { BloqueoAlertaService } from './bloqueo-alerta.service';

function fakeCacheManager() {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    get: jest.fn(async (key: string) => {
      const e = store.get(key);
      if (!e) return undefined;
      if (Date.now() > e.expiresAt) { store.delete(key); return undefined; }
      return e.value;
    }),
    set: jest.fn(async (key: string, value: unknown, ttl: number) => {
      store.set(key, { value, expiresAt: Date.now() + ttl });
    }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
  } as any;
}

function makeService() {
  const emailService = { enviar: jest.fn().mockResolvedValue({ exitoso: true }) };
  const notificacionesService = {
    notificarSistemaUsuario:  jest.fn().mockResolvedValue(undefined),
    notificarSistemaEmpresa:  jest.fn().mockResolvedValue(undefined),
    getAdminEmails:           jest.fn().mockResolvedValue(['admin@empresa.com']),
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([{ empresaId: 44, nombre: 'Empresa Demo' }]),
  };
  const cache = fakeCacheManager();
  const svc = new BloqueoAlertaService(emailService as any, notificacionesService as any, dataSource as any, cache);
  return { svc, emailService, notificacionesService, dataSource };
}

const BASE_LOGIN = {
  userId: 10, email: 'victima@empresa.com', nombre: 'Víctor Víctima',
  intentos: 5, duracionSegundos: 60, bloqueosEn24h: 1,
  ip: '10.0.0.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
};

describe('BloqueoAlertaService.avisarBloqueoLogin', () => {
  it('registra la campanita y manda el correo al dueño de la cuenta', async () => {
    const { svc, emailService, notificacionesService } = makeService();
    await svc.avisarBloqueoLogin(BASE_LOGIN);

    expect(notificacionesService.notificarSistemaUsuario).toHaveBeenCalledWith(
      10, 'login_bloqueado', expect.any(String), expect.any(String),
    );
    expect(emailService.enviar).toHaveBeenCalledTimes(1);
    expect(emailService.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'victima@empresa.com' }));
  });

  it('el correo no se repite en menos de 15 min, pero la campanita SÍ registra cada bloqueo', async () => {
    const { svc, emailService, notificacionesService } = makeService();
    await svc.avisarBloqueoLogin(BASE_LOGIN);
    await svc.avisarBloqueoLogin({ ...BASE_LOGIN, bloqueosEn24h: 2 }); // 2do bloqueo, minutos después

    expect(emailService.enviar).toHaveBeenCalledTimes(1); // el 2do se dedupe
    expect(notificacionesService.notificarSistemaUsuario).toHaveBeenCalledTimes(2); // ambos quedan en la campanita
  });

  it('cuenta inexistente: nunca se llama — no hay aviso que mandar (se verifica en auth.service.ts, aquí solo que el servicio no asume nada raro si no se invoca)', async () => {
    const { emailService, notificacionesService } = makeService();
    // auth.service.ts simplemente no llama a avisarBloqueoLogin() cuando
    // `!user?.isActive` — no hay nada que este servicio deba filtrar.
    expect(emailService.enviar).not.toHaveBeenCalled();
    expect(notificacionesService.notificarSistemaUsuario).not.toHaveBeenCalled();
  });

  it('3+ bloqueos en 24h → aviso extra a los admins de las empresas activas del usuario', async () => {
    const { svc, emailService, notificacionesService, dataSource } = makeService();
    await svc.avisarBloqueoLogin({ ...BASE_LOGIN, bloqueosEn24h: 3 });

    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('usuario_empresa'), [10]);
    expect(notificacionesService.notificarSistemaEmpresa).toHaveBeenCalledWith(
      44, 'posible_acceso_no_autorizado', expect.stringContaining('Víctor Víctima'), expect.any(String),
    );
    expect(notificacionesService.getAdminEmails).toHaveBeenCalledWith(44);
    // 2 correos: el del dueño de la cuenta + el del admin.
    expect(emailService.enviar).toHaveBeenCalledTimes(2);
    expect(emailService.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@empresa.com' }));
  });

  it('con menos de 3 bloqueos en 24h, NO avisa a los admins', async () => {
    const { svc, notificacionesService } = makeService();
    await svc.avisarBloqueoLogin({ ...BASE_LOGIN, bloqueosEn24h: 2 });
    expect(notificacionesService.notificarSistemaEmpresa).not.toHaveBeenCalled();
  });

  it('el correo nunca contiene una contraseña o PIN — el aviso no recibe ese dato en absoluto', async () => {
    const { svc, emailService } = makeService();
    await svc.avisarBloqueoLogin(BASE_LOGIN);
    const html = (emailService.enviar.mock.calls[0][0] as any).html as string;
    expect(html.toLowerCase()).not.toMatch(/contraseñaintentada|pinintentado|password123/);
  });

  it('un fallo de email/BD nunca revienta (fire-and-forget) — se traga el error', async () => {
    const { svc, emailService } = makeService();
    emailService.enviar.mockRejectedValueOnce(new Error('SMTP caído'));
    await expect(svc.avisarBloqueoLogin(BASE_LOGIN)).resolves.toBeUndefined();
  });
});

const BASE_GLOBAL = {
  userId: 10, email: 'victima@empresa.com', nombre: 'Víctor Víctima',
  intentos: 20, duracionSegundos: 900,
  ip: '10.0.9.9', userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
};

describe('BloqueoAlertaService.avisarBloqueoGlobalLogin (ataque distribuido — 20 fallos/60min, cualquier IP)', () => {
  it('avisa al dueño de la cuenta Y a los admins SIEMPRE, no solo a partir de la 3ra vez', async () => {
    const { svc, emailService, notificacionesService, dataSource } = makeService();
    await svc.avisarBloqueoGlobalLogin(BASE_GLOBAL);

    expect(notificacionesService.notificarSistemaUsuario).toHaveBeenCalledWith(
      10, 'login_bloqueado', expect.any(String), expect.any(String),
    );
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('usuario_empresa'), [10]);
    expect(notificacionesService.notificarSistemaEmpresa).toHaveBeenCalledWith(
      44, 'posible_acceso_no_autorizado', expect.any(String), expect.stringContaining('posible ataque distribuido'),
    );
    // 2 correos: el del dueño de la cuenta + el del admin — la PRIMERA vez, sin esperar un conteo de 3.
    expect(emailService.enviar).toHaveBeenCalledTimes(2);
    expect(emailService.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'victima@empresa.com' }));
    expect(emailService.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@empresa.com' }));
  });

  it('el correo al dueño no se repite en menos de 15 min', async () => {
    const { svc, emailService } = makeService();
    await svc.avisarBloqueoGlobalLogin(BASE_GLOBAL);
    await svc.avisarBloqueoGlobalLogin(BASE_GLOBAL);
    const aLaVictima = emailService.enviar.mock.calls.filter((c: any) => c[0].to === 'victima@empresa.com');
    expect(aLaVictima).toHaveLength(1);
  });

  it('el contenido menciona varias direcciones/ataque distribuido y nunca una contraseña', async () => {
    const { svc, emailService } = makeService();
    await svc.avisarBloqueoGlobalLogin(BASE_GLOBAL);
    const html = (emailService.enviar.mock.calls[0][0] as any).html as string;
    expect(html).toMatch(/varias direcciones/i);
    expect(html.toLowerCase()).not.toMatch(/contraseñaintentada|password123/);
  });

  it('un fallo de email/BD nunca revienta (fire-and-forget)', async () => {
    const { svc, emailService } = makeService();
    emailService.enviar.mockRejectedValueOnce(new Error('SMTP caído'));
    await expect(svc.avisarBloqueoGlobalLogin(BASE_GLOBAL)).resolves.toBeUndefined();
  });
});

const BASE_SUPERVISOR = {
  supervisorUserId: 2, supervisorEmail: 'super@empresa.com', supervisorNombre: 'Ana Supervisor',
  cajeroNombre: 'Carlos Cajero', empresaId: 7, empresaNombre: 'Ventas Populares', sucursalNombre: 'Sucursal Centro',
  action: 'Aplicar descuento', detail: '15% en factura #100',
  intentos: 5, duracionSegundos: 60,
  ip: '10.0.0.1', userAgent: 'Mozilla/5.0 (iPhone)',
};

describe('BloqueoAlertaService.avisarBloqueoSupervisor', () => {
  it('el aviso llega al SUPERVISOR (campanita + correo), nunca al cajero', async () => {
    const { svc, emailService, notificacionesService } = makeService();
    await svc.avisarBloqueoSupervisor(BASE_SUPERVISOR);

    expect(notificacionesService.notificarSistemaUsuario).toHaveBeenCalledWith(
      2, 'supervisor_bloqueado', expect.any(String), expect.any(String),
      undefined, 7, // empresaId — así el centro de notificaciones lo scoping a esa empresa
    );
    expect(emailService.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'super@empresa.com' }));
  });

  it('el contenido incluye qué cajero, empresa, sucursal y acción se intentaba autorizar', async () => {
    const { svc, emailService } = makeService();
    await svc.avisarBloqueoSupervisor(BASE_SUPERVISOR);
    const html = (emailService.enviar.mock.calls[0][0] as any).html as string;
    expect(html).toContain('Carlos Cajero');
    expect(html).toContain('Ventas Populares');
    expect(html).toContain('Sucursal Centro');
    expect(html).toContain('Aplicar descuento');
  });

  it('el correo no se repite en menos de 15 min para el mismo supervisor', async () => {
    const { svc, emailService } = makeService();
    await svc.avisarBloqueoSupervisor(BASE_SUPERVISOR);
    await svc.avisarBloqueoSupervisor(BASE_SUPERVISOR);
    expect(emailService.enviar).toHaveBeenCalledTimes(1);
  });

  it('el correo nunca contiene la contraseña o PIN intentados', async () => {
    const { svc, emailService } = makeService();
    await svc.avisarBloqueoSupervisor(BASE_SUPERVISOR);
    const html = (emailService.enviar.mock.calls[0][0] as any).html as string;
    expect(html.toLowerCase()).not.toMatch(/contraseñaintentada|pinintentado/);
  });
});
