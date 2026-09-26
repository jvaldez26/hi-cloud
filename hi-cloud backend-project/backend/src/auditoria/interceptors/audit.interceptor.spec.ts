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
import { of } from 'rxjs';
import { generarDescripcion, AuditInterceptor } from './audit.interceptor';

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
});
