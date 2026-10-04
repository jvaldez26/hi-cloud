/**
 * LoginAttemptsService — dos niveles independientes:
 *
 *   1. Por (cuenta, IP): 5 fallos en 10 min → 1 min; si la MISMA (cuenta,IP)
 *      vuelve a bloquearse dentro de 24h → 5 min; desde la 3ra vez → 15 min
 *      (tope). Se reinicia por completo al primer acierto.
 *   2. Por cuenta SOLA (cualquier IP): 20 fallos en 60 min → 15 min fijos.
 *      Protege contra un ataque repartido entre muchas IPs que nunca
 *      haría saltar el nivel 1 en ninguna de ellas por separado.
 */
import { LoginAttemptsService } from './login-attempts.service';
import { LOCKOUT_VENTANA_ESCALADA_MS } from './utils/progressive-lockout.util';

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

const ID  = 'alguien@empresa.com';
const IP  = '10.0.0.5';
const IP2 = '10.0.0.6';

/** Falla una vez contra (id, ip) y devuelve el resultado de block(). */
async function fallar(svc: LoginAttemptsService, id: string, ip: string, maxIntentos = 5) {
  const { attemptsLocal, attemptsGlobal } = await svc.increment(id, ip);
  return svc.block(id, ip, attemptsLocal, attemptsGlobal, maxIntentos);
}

describe('LoginAttemptsService — nivel 1 (cuenta + IP)', () => {
  it('5 fallos bloquean 1 minuto (60s)', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    let ultimo;
    for (let i = 0; i < 5; i++) ultimo = await fallar(svc, ID, IP);
    expect(ultimo!.tipo).toBe('cuenta_ip');
    expect(ultimo!.blockSeconds).toBe(60);
    expect(ultimo!.bloqueosEn24h).toBe(1);
  });

  it('segundo bloqueo de la MISMA (cuenta, IP) dentro de 24h → 5 minutos (300s)', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    for (let i = 0; i < 5; i++) await fallar(svc, ID, IP); // 1er bloqueo: 1 min

    let ultimo;
    for (let i = 0; i < 5; i++) ultimo = await fallar(svc, ID, IP); // próximo exige 5 fallos NUEVOS
    expect(ultimo!.blockSeconds).toBe(300);
    expect(ultimo!.bloqueosEn24h).toBe(2);
  });

  it('tercer bloqueo y siguientes → 15 minutos (900s), tope', async () => {
    const cache = fakeCacheManager();
    const svc = new LoginAttemptsService(cache);
    // Simula que esta (cuenta, IP) ya se bloqueó 3 veces en 24h, sin gastar
    // fallos del contador GLOBAL (nivel 2) — repetir 4 ciclos reales de 5
    // fallos cada uno suma 20 fallos totales y dispararía el nivel 2 antes
    // de llegar al 4to bloqueo del nivel 1, que es justo lo que esta prueba
    // quiere aislar.
    await cache.set(`login_block_count:${ID.toLowerCase()}:${IP}`, 3, LOCKOUT_VENTANA_ESCALADA_MS);

    let ultimo;
    for (let i = 0; i < 5; i++) ultimo = await fallar(svc, ID, IP);
    expect(ultimo!.tipo).toBe('cuenta_ip');
    expect(ultimo!.blockSeconds).toBe(900);
    expect(ultimo!.bloqueosEn24h).toBe(4);
  });

  it('se reinicia por completo al primer acierto: el próximo bloqueo vuelve a ser de 1 minuto', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    for (let i = 0; i < 5; i++) await fallar(svc, ID, IP); // 1er bloqueo: 1 min

    await svc.reset(ID, IP); // acierto desde esta misma IP

    let ultimo;
    for (let i = 0; i < 5; i++) ultimo = await fallar(svc, ID, IP);
    expect(ultimo!.blockSeconds).toBe(60);
    expect(ultimo!.bloqueosEn24h).toBe(1);
  });

  it('fallos desde la IP A NO bloquean el login desde la IP B (cada (cuenta,IP) es su propia cubeta)', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    for (let i = 0; i < 5; i++) await fallar(svc, ID, IP); // IP bloqueada

    const estadoIpBloqueada = await svc.isBlocked(ID, IP);
    expect(estadoIpBloqueada.blocked).toBe(true);

    const estadoIp2 = await svc.isBlocked(ID, IP2);
    expect(estadoIp2.blocked).toBe(false); // otra IP, sin tocar — sigue libre
  });

  it('cuentas DISTINTAS nunca se afectan entre sí', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    for (let i = 0; i < 5; i++) await fallar(svc, ID, IP);

    const otraCuenta = await svc.isBlocked('otra@empresa.com', IP);
    expect(otraCuenta.blocked).toBe(false);
  });
});

describe('LoginAttemptsService — nivel 2 (cuenta global, cualquier IP — ataque distribuido)', () => {
  it('20 fallos en total desde IPs DISTINTAS bloquean la cuenta 15 minutos (900s), aunque ninguna IP individual llegue a 5', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    const ips = Array.from({ length: 20 }, (_, i) => `10.0.1.${i}`); // 20 IPs, 1 fallo cada una

    let ultimo;
    for (const ip of ips) ultimo = await fallar(svc, ID, ip);

    expect(ultimo!.tipo).toBe('cuenta_global');
    expect(ultimo!.blockSeconds).toBe(900);

    // Ninguna IP individual llegó a los 5 fallos del nivel 1.
    const estadoUnaIp = await svc.isBlocked(ID, ips[0]);
    expect(estadoUnaIp.tipo).toBe('cuenta_global'); // bloqueada igual, por el nivel 2
  });

  it('el nivel 2 manda sobre el nivel 1 cuando ambos están activos', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    const ips = Array.from({ length: 20 }, (_, i) => `10.0.2.${i}`);
    for (const ip of ips) await fallar(svc, ID, ip);

    const estado = await svc.isBlocked(ID, ips[0]);
    expect(estado.blocked).toBe(true);
    expect(estado.tipo).toBe('cuenta_global');
    expect(estado.remainingSeconds).toBeGreaterThan(0);
  });

  it('bloqueos del nivel 1 bien repartidos entre pocas IPs, sin llegar a 20 fallos totales, NO activan el nivel 2', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    // 3 IPs x 5 fallos = 15 fallos totales — por debajo del umbral global (20).
    let ultimo;
    for (let ipN = 0; ipN < 3; ipN++) {
      for (let i = 0; i < 5; i++) ultimo = await fallar(svc, ID, `10.0.3.${ipN}`);
    }
    expect(ultimo!.tipo).toBe('cuenta_ip'); // el último bloqueo sigue siendo de nivel 1
  });

  it('se reinicia al primer acierto, igual que el nivel 1', async () => {
    const svc = new LoginAttemptsService(fakeCacheManager());
    const ips = Array.from({ length: 20 }, (_, i) => `10.0.4.${i}`);
    for (const ip of ips) await fallar(svc, ID, ip);

    await svc.reset(ID, ips[0]); // cualquier IP sirve: el reset limpia el nivel 2 completo

    const estado = await svc.isBlocked(ID, ips[0]);
    expect(estado.blocked).toBe(false);
  });
});
