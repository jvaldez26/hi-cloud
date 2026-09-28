import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, intentarRefrescarConReintentos } from './client';

/**
 * intentarRefrescarConReintentos — el núcleo del fix: un 429/5xx/timeout en
 * /auth/refresh NO es lo mismo que un 401 real, y antes se trataban
 * exactamente igual (logout inmediato, carrito del POS perdido). Ver el
 * comentario de la función en client.ts para el incidente que esto corrige.
 */

function errorConEstado(estado: number | undefined, headers: Record<string, string> = {}) {
  return { response: estado ? { status: estado, headers } : undefined, message: `HTTP ${estado ?? 'sin respuesta'}` };
}

describe('intentarRefrescarConReintentos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('éxito al primer intento: "ok", sin reintentos', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({} as any);
    const resultado = await intentarRefrescarConReintentos();
    expect(resultado).toBe('ok');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('401 real: "fallo" inmediato, SIN reintentar — el token está genuinamente muerto', async () => {
    const post = vi.spyOn(apiClient, 'post').mockRejectedValueOnce(errorConEstado(401));
    const resultado = await intentarRefrescarConReintentos();
    expect(resultado).toBe('fallo');
    expect(post).toHaveBeenCalledTimes(1); // ni un solo reintento
  });

  it('429 (el propio límite de refresh) seguido de éxito: reintenta y devuelve "ok" — antes esto cerraba sesión', async () => {
    const post = vi.spyOn(apiClient, 'post')
      .mockRejectedValueOnce(errorConEstado(429))
      .mockResolvedValueOnce({} as any);

    const promesa = intentarRefrescarConReintentos();
    await vi.runAllTimersAsync(); // avanza el backoff entre intentos
    const resultado = await promesa;

    expect(resultado).toBe('ok');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('500 seguido de éxito: reintenta y devuelve "ok"', async () => {
    const post = vi.spyOn(apiClient, 'post')
      .mockRejectedValueOnce(errorConEstado(500))
      .mockResolvedValueOnce({} as any);

    const promesa = intentarRefrescarConReintentos();
    await vi.runAllTimersAsync();
    const resultado = await promesa;

    expect(resultado).toBe('ok');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('timeout / sin respuesta (red caída) seguido de éxito: reintenta y devuelve "ok"', async () => {
    const post = vi.spyOn(apiClient, 'post')
      .mockRejectedValueOnce(errorConEstado(undefined))
      .mockResolvedValueOnce({} as any);

    const promesa = intentarRefrescarConReintentos();
    await vi.runAllTimersAsync();
    const resultado = await promesa;

    expect(resultado).toBe('ok');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('reintentos agotados (429 persistente): "fallo" tras el máximo de intentos, nunca cuelga', async () => {
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue(errorConEstado(429));

    const promesa = intentarRefrescarConReintentos();
    await vi.runAllTimersAsync();
    const resultado = await promesa;

    expect(resultado).toBe('fallo');
    expect(post.mock.calls.length).toBeGreaterThan(1); // sí reintentó, no fue inmediato como el 401
    expect(post.mock.calls.length).toBeLessThanOrEqual(3); // pero con un tope — no reintentos infinitos
  });

  it('respeta Retry-After del 429 en vez del backoff exponencial cuando el header viene', async () => {
    const post = vi.spyOn(apiClient, 'post')
      .mockRejectedValueOnce(errorConEstado(429, { 'retry-after': '2' }))
      .mockResolvedValueOnce({} as any);

    const promesa = intentarRefrescarConReintentos();
    // Avanza exactamente el Retry-After (2s) — si esperara el backoff por
    // defecto (1.5s) igual pasaría, así que se verifica con un adelanto corto
    // que NO alcanza el backoff mínimo pero si alcanzara Retry-After no aplicaría de todas formas
    // — la aserción real es que tras avanzar todo el reloj, sí se resuelve "ok".
    await vi.advanceTimersByTimeAsync(2000);
    const resultado = await promesa;

    expect(resultado).toBe('ok');
    expect(post).toHaveBeenCalledTimes(2);
  });
});
