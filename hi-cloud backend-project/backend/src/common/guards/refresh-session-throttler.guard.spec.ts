import { ThrottlerException } from '@nestjs/throttler';
import { RefreshSessionThrottlerGuard } from './refresh-session-throttler.guard';

/**
 * RefreshSessionThrottlerGuard — límite de /auth/refresh POR SESIÓN, para
 * que varias cajas de un mismo local (misma IP por NAT) no compartan un
 * único balde. Ver el guard para el incidente que esto corrige: 429 por IP
 * en tráfico legítimo → el interceptor del frontend cerraba sesión →
 * carrito del POS perdido.
 */
function ctxCon(refreshToken: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ cookies: refreshToken !== undefined ? { refresh_token: refreshToken } : {} }),
    }),
  } as any;
}

describe('RefreshSessionThrottlerGuard', () => {
  it('permite hasta el límite para UNA sesión (un refresh_token)', () => {
    const guard = new RefreshSessionThrottlerGuard();
    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(ctxCon('token-A'))).toBe(true);
    }
  });

  it('la sesión número 11 en la misma ventana se rechaza', () => {
    const guard = new RefreshSessionThrottlerGuard();
    for (let i = 0; i < 10; i++) guard.canActivate(ctxCon('token-A'));
    expect(() => guard.canActivate(ctxCon('token-A'))).toThrow(ThrottlerException);
  });

  it('dos sesiones DISTINTAS (dos cajas, misma IP) tienen baldes independientes', () => {
    const guard = new RefreshSessionThrottlerGuard();
    for (let i = 0; i < 10; i++) guard.canActivate(ctxCon('token-caja-1'));
    // La caja 1 ya agotó su cupo — la caja 2 (mismo local, otra sesión) no se ve afectada.
    expect(guard.canActivate(ctxCon('token-caja-2'))).toBe(true);
  });

  it('sin cookie de refresh: no es responsabilidad del guard — deja pasar (el endpoint la rechaza con 401)', () => {
    const guard = new RefreshSessionThrottlerGuard();
    expect(guard.canActivate(ctxCon(undefined))).toBe(true);
  });
});
