import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth.store';
import type { AuthUser, EmpresaItem } from '../types';

const USUARIO: AuthUser = {
  id: 1,
  nombre: 'Ana',
  email: 'ana@test.com',
  role: 'contador', // rol GLOBAL — el bug era quedarse con este en vez del rol por empresa
};

const EMPRESA_A: EmpresaItem = { empresaId: 10, nombre: 'Empresa A', rol: 'admin', isPrincipal: true };
const EMPRESA_B: EmpresaItem = { empresaId: 20, nombre: 'Empresa B', rol: 'vendedor', isPrincipal: false };

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ user: null, empresaActual: null, empresas: [], almacenActual: null, sucursalActual: null, sucursalNombre: null, hydrated: false });
});

describe('auth.store — resolución de rol por empresa activa', () => {
  it('login(): rol global contador + rol admin en la empresa activa → user.role queda admin de inmediato, sin recargar', () => {
    useAuthStore.getState().login(USUARIO, EMPRESA_A.empresaId, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe('admin');
    // Persistido también, para que una futura rehidratación desde localStorage ya lleve el rol correcto
    expect(JSON.parse(localStorage.getItem('auth_user')!).role).toBe('admin');
  });

  it('cambiarEmpresa(): al cambiar a una empresa donde el rol es vendedor, user.role pasa a vendedor y los gates de useCanDo responden en consecuencia', () => {
    useAuthStore.getState().login(USUARIO, EMPRESA_A.empresaId, [EMPRESA_A, EMPRESA_B]);
    expect(useAuthStore.getState().user?.role).toBe('admin');

    useAuthStore.getState().cambiarEmpresa(EMPRESA_B.empresaId);

    expect(useAuthStore.getState().user?.role).toBe('vendedor');
    expect(useAuthStore.getState().empresaActual).toBe(EMPRESA_B.empresaId);
  });

  it('login con Google (sin empresas todavía): no hay empresa activa que resolver, se mantiene el rol tal cual venga del backend', () => {
    useAuthStore.getState().login(USUARIO, null, []);

    expect(useAuthStore.getState().user?.role).toBe('contador');
  });

  it('login con Google seguido de elegir empresa (mismo flujo, en dos pasos): el rol se corrige igual que en el login directo', () => {
    useAuthStore.getState().login(USUARIO, null, []);
    expect(useAuthStore.getState().user?.role).toBe('contador');

    useAuthStore.getState().login(USUARIO, EMPRESA_A.empresaId, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe('admin');
  });

  it('si la empresa activa no está en empresas[], cae al menor privilegio (viewer) en vez del rol global', () => {
    useAuthStore.getState().login(USUARIO, 999, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe('viewer');
  });

  it('super_admin nunca se degrada por el rol de la empresa activa', () => {
    useAuthStore.getState().login({ ...USUARIO, role: 'super_admin' }, EMPRESA_B.empresaId, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe('super_admin');
  });
});
