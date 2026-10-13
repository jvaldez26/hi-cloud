import { ConflictException, ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { SesionCoherenteInterceptor } from './sesion-coherente.interceptor';

// Incidente real (empresa 73, caja #788): una pestaña vieja se queda
// mostrando un usuario en memoria mientras el navegador ya tiene la cookie
// de otro. El evento 'storage' del frontend avisa a las demás pestañas, pero
// si esa señal falla (localStorage deshabilitado, un error de JS que la
// rompe), este interceptor es el respaldo: compara el id que la pantalla
// dice tener (header) contra el id real del JWT que autenticó la petición.
describe('SesionCoherenteInterceptor', () => {
  const interceptor = new SesionCoherenteInterceptor();

  function contextoCon(headers: Record<string, string | string[]>, user?: { id?: number }): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ headers, user }) }),
    } as unknown as ExecutionContext;
  }

  const next: CallHandler = { handle: () => of('ok') };

  it('header coincide con el usuario del JWT: deja pasar', (done) => {
    interceptor
      .intercept(contextoCon({ 'x-usuario-esperado': '114' }, { id: 114 }), next)
      .subscribe({ next: v => { expect(v).toBe('ok'); done(); } });
  });

  it('header NO coincide con el usuario del JWT (el caso real: pestaña vieja de Franchesca, sesión ahora es de Beatriz): 409', () => {
    expect(() =>
      interceptor.intercept(contextoCon({ 'x-usuario-esperado': '114' }, { id: 113 }), next),
    ).toThrow(ConflictException);
    try {
      interceptor.intercept(contextoCon({ 'x-usuario-esperado': '114' }, { id: 113 }), next);
    } catch (e) {
      expect((e as ConflictException).message).toBe('SESION_CAMBIO');
    }
  });

  it('sin header (petición sin el dato, o de antes de este cambio): fail-open, deja pasar', (done) => {
    interceptor
      .intercept(contextoCon({}, { id: 114 }), next)
      .subscribe({ next: v => { expect(v).toBe('ok'); done(); } });
  });

  it('sin req.user (ruta sin guard de auth, o guard que falló antes): fail-open, deja pasar', (done) => {
    interceptor
      .intercept(contextoCon({ 'x-usuario-esperado': '114' }, undefined), next)
      .subscribe({ next: v => { expect(v).toBe('ok'); done(); } });
  });

  it('header no numérico (dato corrupto): no revienta, deja pasar', (done) => {
    interceptor
      .intercept(contextoCon({ 'x-usuario-esperado': 'undefined' }, { id: 114 }), next)
      .subscribe({ next: v => { expect(v).toBe('ok'); done(); } });
  });

  it('contexto no-HTTP (ws/rpc): deja pasar sin tocar nada', (done) => {
    const ctx = { getType: () => 'rpc' } as unknown as ExecutionContext;
    interceptor.intercept(ctx, next).subscribe({ next: v => { expect(v).toBe('ok'); done(); } });
  });
});
