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

  // Caso real (2026-10-03): admins que entraban y veían VIEWER de forma
  // intermitente, hasta cerrar sesión y volver a entrar. Esta era la regla
  // que lo causaba — degradar a 'viewer' en vez de usar una empresa real del
  // usuario. Ya NUNCA debe pasar: se cae a la empresa predeterminada (la
  // principal, o la primera de la lista) con su rol real.
  it('si la empresa activa no está en empresas[] (lista con datos reales), cae a la empresa predeterminada del usuario — NUNCA a viewer', () => {
    useAuthStore.getState().login(USUARIO, 999, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe('admin'); // el rol de EMPRESA_A, la principal
    expect(useAuthStore.getState().empresaActual).toBe(EMPRESA_A.empresaId);
    expect(localStorage.getItem('empresaId')).toBe(String(EMPRESA_A.empresaId));
  });

  it('si no hay empresa principal, cae a la primera de la lista', () => {
    const sinPrincipal = { ...EMPRESA_A, isPrincipal: false };
    useAuthStore.getState().login(USUARIO, 999, [sinPrincipal, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe(sinPrincipal.rol);
    expect(useAuthStore.getState().empresaActual).toBe(sinPrincipal.empresaId);
  });

  it('empresas[] todavía no cargó (lista vacía, pero SÍ hay empresaActivaId): no degrada — mantiene el rol global hasta tener datos reales', () => {
    useAuthStore.getState().login(USUARIO, EMPRESA_A.empresaId, []);

    expect(useAuthStore.getState().user?.role).toBe('contador'); // rol global de USUARIO, sin tocar
    expect(useAuthStore.getState().empresaActual).toBe(EMPRESA_A.empresaId);
  });

  it('el id de la empresa activa puede llegar como string (ej. de un query param o localStorage sin convertir) y aun así resuelve bien', () => {
    useAuthStore.getState().login(USUARIO, ('' + EMPRESA_B.empresaId) as any, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe(EMPRESA_B.rol);
    expect(useAuthStore.getState().empresaActual).toBe(EMPRESA_B.empresaId);
  });

  it('super_admin nunca se degrada por el rol de la empresa activa', () => {
    useAuthStore.getState().login({ ...USUARIO, role: 'super_admin' }, EMPRESA_B.empresaId, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe('super_admin');
  });

  // cambiarEmpresa() con una empresaActivaId que no pertenece al usuario (ej.
  // quedó en localStorage de otra sesión en un equipo compartido): mismo
  // comportamiento que login() — cae a una empresa real, nunca a viewer.
  it('cambiarEmpresa() a una empresa que no está en la lista del usuario: cae a su empresa predeterminada, nunca a viewer', () => {
    useAuthStore.getState().login(USUARIO, EMPRESA_A.empresaId, [EMPRESA_A, EMPRESA_B]);

    useAuthStore.getState().cambiarEmpresa(999);

    expect(useAuthStore.getState().user?.role).toBe('admin'); // EMPRESA_A, la principal
    expect(useAuthStore.getState().user?.role).not.toBe('viewer');
  });

  // Fase de la auditoría 2026-10-03: cambiarEmpresa() solo tenía la copia de
  // `empresas` capturada en el último login() — AppLayout la pasa fresca
  // desde /auth/mis-empresas (ver segundo parámetro) para que no dependa de
  // esa copia vieja, y además la adopta como la nueva `empresas` del store.
  it('cambiarEmpresa() con una lista fresca (empresasFrescas) resuelve con ESA lista, no con la vieja del store, y la adopta', () => {
    useAuthStore.getState().login(USUARIO, EMPRESA_A.empresaId, [EMPRESA_A]); // EMPRESA_B no está aquí todavía

    useAuthStore.getState().cambiarEmpresa(EMPRESA_B.empresaId, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe(EMPRESA_B.rol); // 'vendedor', no degradado
    expect(useAuthStore.getState().empresas).toEqual([EMPRESA_A, EMPRESA_B]); // el store se autocorrigió
  });

  // Seguridad (equipo compartido): si en algún momento empresaActivaId quedó
  // apuntando a una empresa de OTRO usuario (dato inconsistente — no debería
  // pasar nunca si login()/logout() limpian bien), el usuario ACTUAL nunca
  // hereda esa empresa ni ese rol — cae a una empresa real SUYA.
  it('empresaActivaId de otro usuario (no está en la lista de este usuario): toma la empresa predeterminada de ESTE usuario, con su rol', () => {
    const idDeOtroUsuario = 77;
    useAuthStore.getState().login(USUARIO, idDeOtroUsuario, [EMPRESA_A, EMPRESA_B]);

    expect(useAuthStore.getState().user?.role).toBe('admin');
    expect(useAuthStore.getState().empresaActual).toBe(EMPRESA_A.empresaId);
  });
});
