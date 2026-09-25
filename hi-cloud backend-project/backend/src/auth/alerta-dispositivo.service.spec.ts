/**
 * AlertaDispositivoService — alerta de nuevo dispositivo/ubicación al
 * iniciar sesión. Cobertura del pedido original:
 *
 * 1. Primer login de una cuenta nueva (ventana de gracia): no notifica.
 * 2. Dispositivo nuevo de una cuenta YA existente: notifica.
 * 3. Mismo dispositivo (fingerprint) visto recientemente, aunque cambie la
 *    IP exacta: no vuelve a notificar — el criterio de "ya visto" es
 *    fingerprint (User-Agent), nunca la IP exacta (pedido explícito).
 * 4. País distinto al habitual del usuario: notifica con el asunto urgente.
 * 5. "No fui yo": cierra todas las sesiones y entrega un token de
 *    configuración de contraseña de un solo uso.
 *
 * Se instancia el servicio a mano con fakes mínimos — mismo criterio que el
 * resto de specs de auth/ (forzar-logout.spec.ts, equipo-sesiones.service.spec.ts):
 * nada de Test.createTestingModule para probar lógica de dominio.
 */
import { BadRequestException } from '@nestjs/common';
import { AlertaDispositivoService } from './alerta-dispositivo.service';

function makeSvc() {
  const dispositivos: any[] = [];
  const dispositivoRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      dispositivos.find(d => d.userId === where.userId && d.fingerprint === where.fingerprint) ?? null,
    ),
    find: jest.fn(async ({ where }: any) =>
      dispositivos
        .filter(d => d.userId === where.userId)
        .sort((a, b) => b.ultimaVez.getTime() - a.ultimaVez.getTime()),
    ),
    create: jest.fn((obj: any) => ({ ...obj })),
    save: jest.fn(async (obj: any) => {
      if (!obj.id) obj.id = `disp-${dispositivos.length + 1}`;
      const idx = dispositivos.findIndex(d => d.id === obj.id);
      if (idx >= 0) dispositivos[idx] = obj; else dispositivos.push(obj);
      return obj;
    }),
  };

  const tokens: any[] = [];
  const tokenRepo = {
    findOne: jest.fn(async ({ where }: any) => tokens.find(t => t.tokenHash === where.tokenHash) ?? null),
    create: jest.fn((obj: any) => ({ ...obj })),
    save: jest.fn(async (obj: any) => {
      if (!obj.id) obj.id = `tok-${tokens.length + 1}`;
      const idx = tokens.findIndex(t => t.id === obj.id);
      if (idx >= 0) tokens[idx] = obj; else tokens.push(obj);
      return obj;
    }),
  };

  const refreshTokenSvc = { revocarTodos: jest.fn().mockResolvedValue(undefined) };
  const emailService    = { enviar: jest.fn().mockResolvedValue({ exitoso: true }) };

  // userId:empresaId -> activo. Ausente = nunca la tocó = activa por defecto.
  const preferencias = new Map<string, boolean>();
  const queries: { sql: string; params: any[] }[] = [];
  const dataSource = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM preferencias_usuario')) {
        const key = `${params[0]}:${params[1]}`;
        return preferencias.has(key) ? [{ valor: preferencias.get(key) }] : [];
      }
      return [];
    }),
  };

  const svc = new AlertaDispositivoService(
    dispositivoRepo as any, tokenRepo as any, refreshTokenSvc as any, emailService as any, dataSource as any,
  );

  return {
    svc, dispositivos, tokens, refreshTokenSvc, emailService, dataSource, queries, preferencias,
    dispositivoRepo, tokenRepo,
  };
}

function seedDispositivo(dispositivos: any[], overrides: any = {}) {
  const ahora = new Date();
  dispositivos.push({
    id: `seed-${dispositivos.length + 1}`,
    userId: 10, fingerprint: 'otro-fingerprint', ip: '190.80.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)', pais: 'DO',
    primeraVez: ahora, ultimaVez: ahora,
    ...overrides,
  });
}

function mockGeo(paisPorIp: Record<string, { city: string; country: string; country_code: string }>) {
  global.fetch = jest.fn(async (url: string) => {
    const ip = String(url).split('/').pop()!;
    const d = paisPorIp[ip];
    return { json: async () => (d ? { success: true, ...d } : { success: false }) } as any;
  }) as any;
}

const fetchOriginal = global.fetch;
afterEach(() => { global.fetch = fetchOriginal; });

const BASE = {
  userId: 10, nombre: 'Ana Cliente', email: 'ana@empresa.com',
  ip: '190.80.1.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0)', empresaId: 7,
};

describe('AlertaDispositivoService.evaluarLogin', () => {
  it('primer login de una cuenta recién creada: no notifica (ventana de gracia), pero registra el dispositivo', async () => {
    mockGeo({ '190.80.1.1': { city: 'Santo Domingo', country: 'República Dominicana', country_code: 'DO' } });
    const { svc, dispositivos, emailService } = makeSvc();

    await svc.evaluarLogin({ ...BASE, userCreatedAt: new Date() }); // cuenta creada ahora mismo

    expect(emailService.enviar).not.toHaveBeenCalled();
    expect(dispositivos).toHaveLength(1);
    expect(dispositivos[0].fingerprint).toBeTruthy();
  });

  it('dispositivo nuevo en una cuenta YA existente (con otro dispositivo conocido): notifica', async () => {
    mockGeo({ '190.80.1.1': { city: 'Santo Domingo', country: 'República Dominicana', country_code: 'DO' } });
    const { svc, dispositivos, emailService } = makeSvc();
    seedDispositivo(dispositivos, { pais: 'DO' }); // ya tenía un dispositivo, mismo país

    await svc.evaluarLogin({ ...BASE, userCreatedAt: new Date('2020-01-01') }); // cuenta vieja, fuera de gracia

    expect(emailService.enviar).toHaveBeenCalledTimes(1);
    const [payload] = emailService.enviar.mock.calls[0];
    expect(payload.subject).toContain('Nuevo inicio de sesión');
    expect(dispositivos).toHaveLength(2); // el nuevo se agregó, sin tocar el sembrado
  });

  it('mismo dispositivo visto recientemente: NO vuelve a notificar aunque cambie la IP exacta', async () => {
    const { svc, dispositivos, emailService } = makeSvc();
    // Primer login: crea el fingerprint.
    mockGeo({ '190.80.1.1': { city: 'Santo Domingo', country: 'República Dominicana', country_code: 'DO' } });
    await svc.evaluarLogin({ ...BASE, userCreatedAt: new Date('2020-01-01') });
    expect(emailService.enviar).toHaveBeenCalledTimes(1); // dispositivo nuevo de cuenta vieja → sí notificó

    emailService.enviar.mockClear();

    // Mismo navegador (mismo User-Agent → mismo fingerprint), IP distinta (celular cambiando de torre).
    mockGeo({ '190.80.2.2': { city: 'Santiago', country: 'República Dominicana', country_code: 'DO' } });
    await svc.evaluarLogin({ ...BASE, ip: '190.80.2.2', userCreatedAt: new Date('2020-01-01') });

    expect(emailService.enviar).not.toHaveBeenCalled();
    expect(dispositivos).toHaveLength(1); // sigue siendo el mismo registro, actualizado
    expect(dispositivos[0].ip).toBe('190.80.2.2'); // el último visto sí se actualiza
  });

  it('país distinto al habitual del usuario: notifica con asunto urgente', async () => {
    const { svc, dispositivos, emailService } = makeSvc();
    seedDispositivo(dispositivos, { pais: 'DO' }); // país habitual: DO
    mockGeo({ '190.80.1.1': { city: 'Miami', country: 'United States', country_code: 'US' } });

    await svc.evaluarLogin({ ...BASE, userCreatedAt: new Date('2020-01-01') });

    expect(emailService.enviar).toHaveBeenCalledTimes(1);
    const [payload] = emailService.enviar.mock.calls[0];
    expect(payload.subject).toContain('país distinto');
  });

  it('preferencia desactivada: no envía correo, pero sigue registrando el dispositivo', async () => {
    const { svc, dispositivos, emailService, preferencias } = makeSvc();
    seedDispositivo(dispositivos, { pais: 'DO' });
    preferencias.set('10:7', false);
    mockGeo({ '190.80.1.1': { city: 'Santo Domingo', country: 'República Dominicana', country_code: 'DO' } });

    await svc.evaluarLogin({ ...BASE, userCreatedAt: new Date('2020-01-01') });

    expect(emailService.enviar).not.toHaveBeenCalled();
    expect(dispositivos).toHaveLength(2);
  });
});

describe('AlertaDispositivoService.confirmarNoFuiYo', () => {
  async function generarToken(svc: AlertaDispositivoService, dispositivos: any[], emailService: any) {
    seedDispositivo(dispositivos, { pais: 'DO' });
    mockGeo({ '190.80.1.1': { city: 'Miami', country: 'United States', country_code: 'US' } });
    await svc.evaluarLogin({ ...BASE, userCreatedAt: new Date('2020-01-01') });
    const [payload] = emailService.enviar.mock.calls[0];
    const match = /token=([a-f0-9]+)/.exec(payload.html);
    return match![1];
  }

  it('invalida todas las sesiones y entrega un token de configuración de contraseña', async () => {
    const { svc, dispositivos, emailService, refreshTokenSvc, dataSource } = makeSvc();
    const rawToken = await generarToken(svc, dispositivos, emailService);

    const { setupToken } = await svc.confirmarNoFuiYo(rawToken);

    expect(setupToken).toBeTruthy();
    expect(refreshTokenSvc.revocarTodos).toHaveBeenCalledWith(10, 'seguridad');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET "sessionToken" = NULL, "passwordConfigured" = false'),
      [10],
    );
  });

  it('el token es de un solo uso: la segunda confirmación falla', async () => {
    const { svc, dispositivos, emailService } = makeSvc();
    const rawToken = await generarToken(svc, dispositivos, emailService);

    await svc.confirmarNoFuiYo(rawToken);
    await expect(svc.confirmarNoFuiYo(rawToken)).rejects.toThrow(BadRequestException);
  });

  it('token inexistente/inválido: rechazado', async () => {
    const { svc } = makeSvc();
    await expect(svc.confirmarNoFuiYo('token-que-no-existe')).rejects.toThrow(BadRequestException);
  });

  it('token expirado: rechazado', async () => {
    const { svc, tokenRepo } = makeSvc();
    const { createHash } = require('crypto');
    const rawToken = 'a'.repeat(64);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await tokenRepo.save(tokenRepo.create({
      userId: 10, tokenHash, used: false,
      expiresAt: new Date(Date.now() - 1000), // ya expiró
    }));

    await expect(svc.confirmarNoFuiYo(rawToken)).rejects.toThrow(BadRequestException);
  });
});
