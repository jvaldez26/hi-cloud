import { describe, it, expect } from 'vitest';
import { mensajeDeError } from './mensajeDeError';

/**
 * Caso real (login de yaribelnunez23@gmail.com, 2026-10-04): un error SIN
 * respuesta (red caída al recién encender la PC) caía en "Credenciales
 * inválidas" en varias pantallas. mensajeDeError() es el único punto que
 * decide qué mensaje mostrar según haya o no respuesta HTTP real.
 */

function errorDeRed() {
  return { isNetworkError: true, response: undefined };
}

function error401(mensajeBackend = 'Correo/usuario o contraseña incorrectos.') {
  return {
    isNetworkError: false,
    response: { status: 401, data: { errors: [mensajeBackend] } },
    friendlyMessage: mensajeBackend,
  };
}

function error500() {
  return {
    isNetworkError: false,
    response: { status: 500, data: { errors: ['Error interno del servidor. Contacte soporte si persiste.'] } },
    friendlyMessage: 'Error interno del servidor. Contacte soporte si persiste.',
  };
}

describe('mensajeDeError', () => {
  it('error de red (sin response) → mensaje de conexión, nunca el fallback de negocio', () => {
    const msg = mensajeDeError(errorDeRed(), {
      errorServidor: 'No pudimos iniciar sesión, intenta de nuevo en unos segundos.',
      fallback:      'Credenciales inválidas',
    });
    expect(msg).toBe('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  });

  it('error de red con mensaje de conexión personalizado', () => {
    const msg = mensajeDeError(errorDeRed(), { sinConexion: 'Sin internet — revisa tu wifi.' });
    expect(msg).toBe('Sin internet — revisa tu wifi.');
  });

  it('401 real del login → el mensaje real del backend (credenciales inválidas), no el genérico de red', () => {
    const msg = mensajeDeError(error401(), {
      errorServidor: 'No pudimos iniciar sesión, intenta de nuevo en unos segundos.',
      fallback:      'Credenciales inválidas',
    });
    expect(msg).toBe('Correo/usuario o contraseña incorrectos.');
  });

  it('500 → mensaje de "intenta de nuevo", nunca el texto de negocio del backend', () => {
    const msg = mensajeDeError(error500(), {
      errorServidor: 'No pudimos iniciar sesión, intenta de nuevo en unos segundos.',
      fallback:      'Credenciales inválidas',
    });
    expect(msg).toBe('No pudimos iniciar sesión, intenta de nuevo en unos segundos.');
  });

  it('500 sin errorServidor personalizado → mensaje genérico de reintento', () => {
    const msg = mensajeDeError(error500());
    expect(msg).toBe('Ocurrió un error. Intenta de nuevo en unos segundos.');
  });

  it('error sin isNetworkError pero también sin response (fetch directo, no pasó por el interceptor) → igual se trata como red', () => {
    const msg = mensajeDeError({ response: undefined });
    expect(msg).toBe('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  });

  it('401 sin friendlyMessage ni errors[] → cae al fallback provisto', () => {
    const msg = mensajeDeError(
      { isNetworkError: false, response: { status: 401, data: {} } },
      { fallback: 'Credenciales inválidas' },
    );
    expect(msg).toBe('Credenciales inválidas');
  });

  it('null/undefined → se trata como error de red (nunca revienta)', () => {
    expect(mensajeDeError(null)).toBe('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
    expect(mensajeDeError(undefined)).toBe('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  });
});
