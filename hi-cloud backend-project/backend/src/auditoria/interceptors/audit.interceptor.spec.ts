/**
 * Descripciones de auditoría — antes de este fix, cualquier ruta sin rama
 * propia en generarDescripcion() caía al fallback genérico "X creó en
 * {módulo}", que es justo lo que se veía en pantalla para CASI TODO auth y
 * TODO ecf ("Jean Carlos Valdez creó en auth", "... creó en ecf") — sin decir
 * qué pasó. Estas pruebas fijan la descripción real de cada rama nueva, y
 * confirman que dos rutas de puro ruido técnico (/auth/actividad heartbeat,
 * /auth/refresh) ya ni se auditan.
 *
 * generarDescripcion() se exportó solo para poder probarla directo, sin
 * levantar el interceptor completo (mismo criterio que las pruebas de
 * validarPrecioVsCosto en facturas: lógica pura, sin Nest de por medio).
 */
import { of, throwError } from 'rxjs';
import { generarDescripcion, determinarNivel, determinarNivelError, AuditInterceptor } from './audit.interceptor';
import { NivelAuditoria } from '../entities/audit-log.entity';

describe('generarDescripcion — auth (rutas que antes caían al fallback)', () => {
  it.each([
    ['/api/v1/auth/2fa/complete-login',        'Ana inició sesión (verificación en 2 pasos)'],
    ['/api/v1/auth/cambiar-empresa',            'Ana cambió de empresa activa'],
    ['/api/v1/auth/cambiar-sucursal',           'Ana cambió de sucursal activa'],
    ['/api/v1/auth/change-password',            'Ana cambió su contraseña'],
    ['/api/v1/auth/setup-password',             'Ana configuró su contraseña inicial'],
    ['/api/v1/auth/reset-password/abc123',      'Ana restableció su contraseña'],
    ['/api/v1/auth/forgot-password',            'Ana solicitó restablecer su contraseña'],
    ['/api/v1/auth/verify-email',               'Ana verificó su correo'],
    ['/api/v1/auth/resend-verification',        'Ana solicitó reenvío de verificación de correo'],
    ['/api/v1/auth/no-fui-yo',                  'Se reportó un inicio de sesión no reconocido — sesiones cerradas'],
    ['/api/v1/auth/verificar-supervisor',       'Ana autorizó modo supervisor'],
    ['/api/v1/auth/supervisor-log/cerrar',      'Ana cerró su sesión de modo supervisor'],
    ['/api/v1/auth/contacto-soporte',           'Ana envió un mensaje de soporte'],
  ])('%s → "%s"', (ruta, esperado) => {
    expect(generarDescripcion('POST', ruta, 'Ana')).toBe(esperado);
  });

  it('cerrar-sesion de otro usuario: usa el id de la RUTA, no el último segmento literal ("cerrar-sesion")', () => {
    const desc = generarDescripcion('POST', '/api/v1/auth/usuarios/42/cerrar-sesion', 'Ana');
    expect(desc).toBe('Ana forzó el cierre de sesión de otro usuario #42');
  });

  it('register: sin usuario autenticado (userName undefined) y con email del body', () => {
    const desc = generarDescripcion('POST', '/api/v1/auth/register', undefined, { email: 'nuevo@empresa.com' });
    expect(desc).toBe('Nueva cuenta registrada (nuevo@empresa.com)');
  });

  it('register sin email en el body: no revienta, solo omite el paréntesis', () => {
    expect(generarDescripcion('POST', '/api/v1/auth/register', undefined, {})).toBe('Nueva cuenta registrada');
  });
});

describe('generarDescripcion — ecf (antes: TODO caía a "creó en ecf")', () => {
  it.each([
    ['/api/v1/ecf/nota-debito/5/emitir',              'Ana emitió e-CF de Nota de Débito'],
    ['/api/v1/ecf/nota-credito/5/emitir',             'Ana emitió e-CF de Nota de Crédito'],
    ['/api/v1/ecf/compra/5/emitir',                   'Ana emitió e-CF de Compras (E41)'],
    ['/api/v1/ecf/gasto/5/emitir',                    'Ana emitió e-CF de Gasto Menor'],
    ['/api/v1/ecf/secuencias',                        'Ana configuró una secuencia de e-CF'],
    ['/api/v1/ecf/archivar-masivo',                   'Ana archivó e-CF en lote'],
    ['/api/v1/ecf/E320000012345/reenviar',            'Ana reenvió un e-CF a DGII'],
    ['/api/v1/ecf/ejecutar-reintentos',               'Ana ejecutó reintentos de envío de e-CF'],
    ['/api/v1/ecf/config/proveedor',                  'Ana configuró el proveedor de e-CF'],
  ])('%s → "%s"', (ruta, esperado) => {
    expect(generarDescripcion('POST', ruta, 'Ana')).toBe(esperado);
  });

  // Casos donde una ruta es substring de otra — el orden de los if() en la
  // implementación decide cuál gana. Si alguien reordena las ramas sin darse
  // cuenta de esto, estas dos pruebas rompen y avisan.
  it('/emitir-pago-exterior NO cae en la rama genérica de /compra/.../emitir', () => {
    const desc = generarDescripcion('POST', '/api/v1/ecf/compra/5/emitir-pago-exterior', 'Ana');
    expect(desc).toBe('Ana emitió e-CF de Pago al Exterior');
  });

  it('/emitir-exportacion NO cae en la rama de factura genérica', () => {
    const desc = generarDescripcion('POST', '/api/v1/ecf/factura/5/emitir-exportacion', 'Ana');
    expect(desc).toBe('Ana emitió e-CF de Exportación');
  });

  it('/consultar-estados (lote) NO cae en la rama singular /consultar-estado', () => {
    const desc = generarDescripcion('POST', '/api/v1/ecf/consultar-estados', 'Ana');
    expect(desc).toBe('Ana consultó estados de e-CF en lote');
  });

  it('/consultar-estado (singular, con número) sí usa la rama singular', () => {
    const desc = generarDescripcion('POST', '/api/v1/ecf/E320000012345/consultar-estado', 'Ana');
    expect(desc).toBe('Ana consultó el estado de un e-CF ante DGII');
  });

  it('usa el e-NCF de la respuesta cuando está disponible', () => {
    const desc = generarDescripcion('POST', '/api/v1/ecf/nota-credito/5/emitir', 'Ana', { encf: 'E340000000123' });
    expect(desc).toBe('Ana emitió e-CF de Nota de Crédito E340000000123');
  });
});

describe('generarDescripcion — no regresiona el fallback para rutas genuinamente desconocidas', () => {
  it('un módulo sin rama propia sigue usando el fallback legible', () => {
    expect(generarDescripcion('POST', '/api/v1/flota/vehiculos', 'Ana')).toBe('Ana creó en flota');
  });
});

describe('AuditInterceptor — exclusión de ruido técnico de sesión', () => {
  function makeInterceptor() {
    const auditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AuditInterceptor(auditoriaService as any);
    return { interceptor, auditoriaService };
  }

  function makeContext(method: string, url: string) {
    const req: any = { method, url, headers: {}, user: { id: 1, nombre: 'Ana', role: 'admin' } };
    const res: any = { statusCode: 200 };
    return {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as any;
  }

  const nextHandle = (body: unknown = { data: {} }) => ({ handle: () => of(body) }) as any;

  it('/auth/actividad (heartbeat) nunca genera una fila de auditoría', done => {
    const { interceptor, auditoriaService } = makeInterceptor();
    interceptor.intercept(makeContext('POST', '/api/v1/auth/actividad'), nextHandle()).subscribe(() => {
      expect(auditoriaService.registrar).not.toHaveBeenCalled();
      done();
    });
  });

  it('/auth/refresh (rotación automática de token) nunca genera una fila de auditoría', done => {
    const { interceptor, auditoriaService } = makeInterceptor();
    interceptor.intercept(makeContext('POST', '/api/v1/auth/refresh'), nextHandle()).subscribe(() => {
      expect(auditoriaService.registrar).not.toHaveBeenCalled();
      done();
    });
  });

  it('una ruta normal SÍ se sigue auditando (la exclusión no se comió todo)', done => {
    const { interceptor, auditoriaService } = makeInterceptor();
    interceptor.intercept(makeContext('POST', '/api/v1/auth/cambiar-empresa'), nextHandle()).subscribe(() => {
      expect(auditoriaService.registrar).toHaveBeenCalledTimes(1);
      expect(auditoriaService.registrar.mock.calls[0][0].descripcion).toBe('Ana cambió de empresa activa');
      done();
    });
  });

  // Bug real (2026-10-03): ráfaga de 400 de /compras/previsualizar-asiento
  // inundando la auditoría como "ERROR Importante" — el formulario la llama
  // con debounce en cada cambio de línea, no crea nada.
  it('/compras/previsualizar-asiento: un ÉXITO nunca genera fila de auditoría', done => {
    const { interceptor, auditoriaService } = makeInterceptor();
    interceptor.intercept(makeContext('POST', '/api/v1/compras/previsualizar-asiento'), nextHandle()).subscribe(() => {
      expect(auditoriaService.registrar).not.toHaveBeenCalled();
      done();
    });
  });

  it('/compras/previsualizar-asiento: un 400 tampoco genera fila de auditoría', done => {
    const { interceptor, auditoriaService } = makeInterceptor();
    const erroredHandle = { handle: () => throwError(() => Object.assign(new Error('Bad Request'), { status: 400 })) } as any;
    interceptor.intercept(makeContext('POST', '/api/v1/compras/previsualizar-asiento'), erroredHandle).subscribe({
      error: () => {
        expect(auditoriaService.registrar).not.toHaveBeenCalled();
        done();
      },
    });
  });
});

describe('determinarNivel — eventos EXITOSOS de auth (bug real: 2026-10-03)', () => {
  it('LOGIN exitoso: NORMAL (acceso normal a una cuenta propia, no un incidente)', () => {
    expect(determinarNivel('POST', '/api/v1/auth/login')).toBe(NivelAuditoria.NORMAL);
  });

  it('LOGOUT: NORMAL (cierre de sesión voluntario)', () => {
    expect(determinarNivel('POST', '/api/v1/auth/logout')).toBe(NivelAuditoria.NORMAL);
  });

  it('lo que sí sigue siendo CRÍTICO en éxito: anular, cancelar, DELETE, notas de crédito/débito, condonar', () => {
    expect(determinarNivel('POST',   '/api/v1/facturas/5/anular')).toBe(NivelAuditoria.CRITICO);
    expect(determinarNivel('POST',   '/api/v1/facturas/5/cancelar')).toBe(NivelAuditoria.CRITICO);
    expect(determinarNivel('DELETE', '/api/v1/productos/5')).toBe(NivelAuditoria.CRITICO);
    expect(determinarNivel('POST',   '/api/v1/notas-credito')).toBe(NivelAuditoria.CRITICO);
    expect(determinarNivel('POST',   '/api/v1/educativo/cargos/5/condonar')).toBe(NivelAuditoria.CRITICO);
  });
});

describe('determinarNivelError — login fallido: escala con el status y los intentos', () => {
  it('401 normal (credenciales incorrectas, pocos intentos): IMPORTANTE', () => {
    expect(determinarNivelError('POST', '/api/v1/auth/login', 401, 1)).toBe(NivelAuditoria.IMPORTANTE);
    expect(determinarNivelError('POST', '/api/v1/auth/login', 401, 4)).toBe(NivelAuditoria.IMPORTANTE);
  });

  it('401 sin attempts (otro tipo de 401, p.ej. CORREO_NO_VERIFICADO): IMPORTANTE, nunca lanza por attempts ausente', () => {
    expect(determinarNivelError('POST', '/api/v1/auth/login', 401, undefined)).toBe(NivelAuditoria.IMPORTANTE);
  });

  it('5 o más intentos seguidos del mismo identificador+IP: CRÍTICO', () => {
    expect(determinarNivelError('POST', '/api/v1/auth/login', 401, 5)).toBe(NivelAuditoria.CRITICO);
    expect(determinarNivelError('POST', '/api/v1/auth/login', 401, 9)).toBe(NivelAuditoria.CRITICO);
  });

  it('429 (cuenta ya bloqueada): CRÍTICO sin importar el número de attempts reportado', () => {
    expect(determinarNivelError('POST', '/api/v1/auth/login', 429, undefined)).toBe(NivelAuditoria.CRITICO);
    expect(determinarNivelError('POST', '/api/v1/auth/login', 429, 1)).toBe(NivelAuditoria.CRITICO);
  });

  it('otras rutas no cambian: siguen IMPORTANTE pase lo que pase con attempts/status', () => {
    expect(determinarNivelError('POST', '/api/v1/facturas', 400, 99)).toBe(NivelAuditoria.IMPORTANTE);
  });
});

describe('AuditInterceptor — catchError usa determinarNivelError() y lee `attempts` del body', () => {
  function makeInterceptor() {
    const auditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AuditInterceptor(auditoriaService as any);
    return { interceptor, auditoriaService };
  }

  function makeContext(method: string, url: string) {
    const req: any = { method, url, headers: {}, user: undefined };
    const res: any = { statusCode: 200 };
    return { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any;
  }

  function makeUnauthorized(body: Record<string, unknown>) {
    const err: any = new Error('Unauthorized');
    err.status = 401;
    err.getResponse = () => body;
    return err;
  }

  it('login fallido con attempts=5 en el body del error: la fila queda CRÍTICO', done => {
    const { interceptor, auditoriaService } = makeInterceptor();
    const err = makeUnauthorized({ message: 'Correo/usuario o contraseña incorrectos.', attempts: 5 });
    const erroredHandle = { handle: () => throwError(() => err) } as any;
    interceptor.intercept(makeContext('POST', '/api/v1/auth/login'), erroredHandle).subscribe({
      error: () => {
        expect(auditoriaService.registrar.mock.calls[0][0].nivel).toBe(NivelAuditoria.CRITICO);
        done();
      },
    });
  });

  it('login fallido con attempts=2: la fila queda IMPORTANTE, no CRÍTICO', done => {
    const { interceptor, auditoriaService } = makeInterceptor();
    const err = makeUnauthorized({ message: 'Correo/usuario o contraseña incorrectos. 3 intento(s) antes del bloqueo temporal.', attempts: 2 });
    const erroredHandle = { handle: () => throwError(() => err) } as any;
    interceptor.intercept(makeContext('POST', '/api/v1/auth/login'), erroredHandle).subscribe({
      error: () => {
        expect(auditoriaService.registrar.mock.calls[0][0].nivel).toBe(NivelAuditoria.IMPORTANTE);
        done();
      },
    });
  });
});
