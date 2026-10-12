import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leerJSON, leerTexto, guardarJSON, guardarTexto } from './safeStorage';

// Sentry 7683266205 (producción, 2026-10-12): JSON.parse(localStorage.getItem('auth_user'))
// reventaba sin capturar porque localStorage tenía la cadena LITERAL "undefined"
// — SyntaxError: "undefined" is not valid JSON. Como esa lectura corría a nivel
// de módulo (import de auth.store.ts), rompía la carga ENTERA de la app.
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
});

describe('leerJSON', () => {
  it('clave ausente: devuelve null, no lanza', () => {
    expect(leerJSON(localStorage, 'nada')).toBeNull();
  });

  it('cadena literal "undefined" guardada (el caso real del incidente): devuelve null, borra la clave, no lanza', () => {
    localStorage.setItem('auth_user', 'undefined');
    expect(leerJSON(localStorage, 'auth_user')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('cadena literal "null": devuelve null, borra la clave', () => {
    localStorage.setItem('mis_empresas', 'null');
    expect(leerJSON(localStorage, 'mis_empresas')).toBeNull();
    expect(localStorage.getItem('mis_empresas')).toBeNull();
  });

  it('cadena vacía: devuelve null, borra la clave', () => {
    localStorage.setItem('auth_user', '');
    expect(leerJSON(localStorage, 'auth_user')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('JSON roto (truncado, comillas sin cerrar, etc.): devuelve null, borra la clave, avisa a Sentry con el nombre de la clave', async () => {
    localStorage.setItem('auth_user', '{"id":1,"nombre":"Ana"');
    const Sentry = await import('@sentry/react');
    expect(leerJSON(localStorage, 'auth_user')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('auth_user'), expect.any(Object));
  });

  it('JSON válido: lo parsea y lo devuelve tal cual', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, nombre: 'Ana' }));
    expect(leerJSON(localStorage, 'auth_user')).toEqual({ id: 1, nombre: 'Ana' });
  });
});

describe('leerTexto', () => {
  it('cadena literal "undefined": devuelve null, borra la clave', () => {
    localStorage.setItem('empresaId', 'undefined');
    expect(leerTexto(localStorage, 'empresaId')).toBeNull();
    expect(localStorage.getItem('empresaId')).toBeNull();
  });

  it('valor real: lo devuelve tal cual, sin tocar la clave', () => {
    localStorage.setItem('empresaId', '42');
    expect(leerTexto(localStorage, 'empresaId')).toBe('42');
    expect(localStorage.getItem('empresaId')).toBe('42');
  });
});

describe('guardarJSON', () => {
  it('undefined: borra la clave en vez de guardar la cadena "undefined" — la causa raíz del incidente', () => {
    localStorage.setItem('auth_user', 'algo-previo');
    guardarJSON(localStorage, 'auth_user', undefined);
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('null: borra la clave', () => {
    localStorage.setItem('auth_user', 'algo-previo');
    guardarJSON(localStorage, 'auth_user', null);
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('un objeto real: lo guarda como JSON, recuperable con leerJSON', () => {
    guardarJSON(localStorage, 'auth_user', { id: 1 });
    expect(leerJSON(localStorage, 'auth_user')).toEqual({ id: 1 });
  });
});

describe('guardarTexto', () => {
  it('undefined/null: borra la clave', () => {
    localStorage.setItem('sucursalNombre', 'Principal');
    guardarTexto(localStorage, 'sucursalNombre', null);
    expect(localStorage.getItem('sucursalNombre')).toBeNull();
  });

  it('un string real: lo guarda tal cual', () => {
    guardarTexto(localStorage, 'sucursalNombre', 'Principal');
    expect(localStorage.getItem('sucursalNombre')).toBe('Principal');
  });
});
