import { describe, it, expect, beforeEach, vi } from 'vitest';

// Incidente real (empresa 73, caja #788 y #762/#767, 2026-10-09 y 2026-10-12):
// un equipo compartido del local — un cajero cierra sesión o se desplaza, otro
// usuario inicia sesión en el MISMO navegador, y una pestaña vieja se queda
// mostrando al cajero anterior mientras sus peticiones ya salen con el token
// del usuario nuevo. Estos tests cubren los dos arreglos:
//   B) evento 'storage' en auth_user → todas las OTRAS pestañas se enteran
//      de inmediato (logout → a /login; otro usuario → aviso + recarga).
//   C) al hacer login, si hay una caja abierta de OTRO cajero en localStorage
//      para este equipo (y el backend confirma que sigue abierta), avisa.

const { warningMock } = vi.hoisted(() => ({ warningMock: vi.fn() }));
vi.mock('antd', () => ({ message: { warning: warningMock, success: vi.fn(), error: vi.fn(), loading: vi.fn(), destroy: vi.fn() } }));

import type { AuthUser, EmpresaItem } from '../types';
import { leerCajaAbiertaEquipo, registrarCajaAbiertaEquipo } from '../utils/cajaEquipoStorage';
// Import estático único para la sección B: el listener de 'storage' se
// registra UNA sola vez al cargar el módulo — usar vi.resetModules() por
// test lo volvería a registrar sin desregistrar el anterior (window
// persiste entre tests del mismo archivo), acumulando listeners.
import { useAuthStore } from './auth.store';

const FRANCHESCA: AuthUser = { id: 114, nombre: 'Franchesca Sosa', email: 'f@test.com', role: 'vendedor' };
const BEATRIZ:    AuthUser = { id: 113, nombre: 'Beatriz Riva',    email: 'b@test.com', role: 'admin' };
const EMPRESA: EmpresaItem = { empresaId: 73, nombre: 'ELIDO', rol: 'admin', isPrincipal: true };

function mockLocation() {
  const loc = { href: '', reload: vi.fn() };
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true });
  return loc;
}

beforeEach(() => {
  localStorage.clear();
  warningMock.mockClear();
  vi.useRealTimers();
});

describe('B) evento storage entre pestañas', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, empresaActual: null, empresas: [], almacenActual: null, sucursalActual: null, sucursalNombre: null, hydrated: false });
  });

  it('logout en otra pestaña (auth_user se borra): esta pestaña limpia su store y va a /login', () => {
    const loc = mockLocation();
    useAuthStore.getState().login(FRANCHESCA, EMPRESA.empresaId, [EMPRESA]);
    expect(useAuthStore.getState().user?.id).toBe(114);

    // Simula lo que OTRA pestaña hizo: logout() real borra la clave.
    localStorage.removeItem('auth_user');
    window.dispatchEvent(new StorageEvent('storage', { key: 'auth_user', newValue: null, oldValue: 'algo' }));

    expect(useAuthStore.getState().user).toBeNull();
    expect(loc.href).toBe('/login');
  });

  it('otro usuario inicia sesión en el mismo navegador: avisa y programa una recarga — nunca se queda mostrando al usuario anterior', () => {
    const loc = mockLocation();
    vi.useFakeTimers();
    useAuthStore.getState().login(FRANCHESCA, EMPRESA.empresaId, [EMPRESA]);

    // Simula lo que la OTRA pestaña hizo: Beatriz inició sesión ahí.
    localStorage.setItem('auth_user', JSON.stringify(BEATRIZ));
    window.dispatchEvent(new StorageEvent('storage', { key: 'auth_user', newValue: JSON.stringify(BEATRIZ), oldValue: JSON.stringify(FRANCHESCA) }));

    expect(warningMock).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Beatriz Riva') }));
    expect(loc.reload).not.toHaveBeenCalled(); // todavía no — espera el timeout
    vi.advanceTimersByTime(1500);
    expect(loc.reload).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('el mismo usuario (ej. solo cambió algo que no es el id): no avisa, no navega', () => {
    const loc = mockLocation();
    useAuthStore.getState().login(FRANCHESCA, EMPRESA.empresaId, [EMPRESA]);
    warningMock.mockClear();

    localStorage.setItem('auth_user', JSON.stringify(FRANCHESCA));
    window.dispatchEvent(new StorageEvent('storage', { key: 'auth_user', newValue: JSON.stringify(FRANCHESCA), oldValue: JSON.stringify(FRANCHESCA) }));

    expect(warningMock).not.toHaveBeenCalled();
    expect(loc.href).toBe('');
  });

  it('un evento storage de OTRA clave (no auth_user): se ignora por completo', () => {
    const loc = mockLocation();
    useAuthStore.getState().login(FRANCHESCA, EMPRESA.empresaId, [EMPRESA]);
    warningMock.mockClear();

    window.dispatchEvent(new StorageEvent('storage', { key: 'empresaId', newValue: '999', oldValue: '73' }));

    expect(warningMock).not.toHaveBeenCalled();
    expect(loc.href).toBe('');
    expect(useAuthStore.getState().user?.id).toBe(114);
  });
});

describe('C) "Hay una caja abierta de [cajero] en este equipo" al iniciar sesión', () => {
  it('hay una caja abierta de OTRO cajero en este equipo, y el backend confirma que sigue abierta: avisa', async () => {
    vi.resetModules();
    vi.doMock('../api/client', () => ({
      default: { get: vi.fn().mockResolvedValue({ data: { data: { id: 788, estado: 'abierta' } } }) },
    }));
    registrarCajaAbiertaEquipo({ cajaId: 788, vendedorId: 114, vendedorNombre: 'Franchesca Sosa' });
    const { useAuthStore } = await import('./auth.store');

    useAuthStore.getState().login(BEATRIZ, EMPRESA.empresaId, [EMPRESA]); // Beatriz entra en el equipo de Franchesca
    await vi.waitFor(() => expect(warningMock).toHaveBeenCalled());

    expect(warningMock).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Franchesca Sosa') }));
  });

  it('la caja registrada es del MISMO usuario que entra: no avisa (es su propia caja)', async () => {
    vi.resetModules();
    const getMock = vi.fn().mockResolvedValue({ data: { data: { id: 788, estado: 'abierta' } } });
    vi.doMock('../api/client', () => ({ default: { get: getMock } }));
    registrarCajaAbiertaEquipo({ cajaId: 788, vendedorId: 114, vendedorNombre: 'Franchesca Sosa' });
    const { useAuthStore } = await import('./auth.store');

    useAuthStore.getState().login(FRANCHESCA, EMPRESA.empresaId, [EMPRESA]); // Franchesca vuelve a entrar — es su propia caja
    await new Promise(r => setTimeout(r, 10));

    expect(getMock).not.toHaveBeenCalled();
    expect(warningMock).not.toHaveBeenCalled();
  });

  it('la caja registrada ya NO está abierta según el backend (se cerró desde otro equipo): no avisa, limpia la clave obsoleta', async () => {
    vi.resetModules();
    vi.doMock('../api/client', () => ({
      default: { get: vi.fn().mockResolvedValue({ data: { data: { id: 788, estado: 'cerrada' } } }) },
    }));
    registrarCajaAbiertaEquipo({ cajaId: 788, vendedorId: 114, vendedorNombre: 'Franchesca Sosa' });
    const { useAuthStore } = await import('./auth.store');

    useAuthStore.getState().login(BEATRIZ, EMPRESA.empresaId, [EMPRESA]);
    await vi.waitFor(() => expect(leerCajaAbiertaEquipo()).toBeNull());

    expect(warningMock).not.toHaveBeenCalled();
  });

  it('sin ningún registro de caja abierta en este equipo: no avisa, no llama al backend', async () => {
    vi.resetModules();
    const getMock = vi.fn();
    vi.doMock('../api/client', () => ({ default: { get: getMock } }));
    const { useAuthStore } = await import('./auth.store');

    useAuthStore.getState().login(BEATRIZ, EMPRESA.empresaId, [EMPRESA]);
    await new Promise(r => setTimeout(r, 10));

    expect(getMock).not.toHaveBeenCalled();
    expect(warningMock).not.toHaveBeenCalled();
  });

  it('la verificación contra el backend falla (red caída): no revienta el login', async () => {
    vi.resetModules();
    vi.doMock('../api/client', () => ({ default: { get: vi.fn().mockRejectedValue(new Error('network')) } }));
    registrarCajaAbiertaEquipo({ cajaId: 788, vendedorId: 114, vendedorNombre: 'Franchesca Sosa' });
    const { useAuthStore } = await import('./auth.store');

    expect(() => useAuthStore.getState().login(BEATRIZ, EMPRESA.empresaId, [EMPRESA])).not.toThrow();
    await new Promise(r => setTimeout(r, 10));
    expect(warningMock).not.toHaveBeenCalled();
  });
});
