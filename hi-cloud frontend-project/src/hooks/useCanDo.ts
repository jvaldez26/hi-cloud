import { useAuthStore } from '../store/auth.store';
import type { UserRole } from '../types';

// Jerarquía numérica — útil para tieneRolMinimo()
const JERARQUIA: Record<string, number> = {
  viewer:      1,
  vendedor:    2,
  contador:    3,
  admin:       4,
  super_admin: 5,
};

// Mapa acción → roles permitidos
const PERMISOS: Record<string, UserRole[]> = {
  // ── Facturas ────────────────────────────────────────────────────────────────
  'facturas:ver':      ['viewer', 'vendedor', 'contador', 'admin'],
  'facturas:crear':    ['vendedor', 'contador', 'admin'],
  'facturas:editar':   ['vendedor', 'contador', 'admin'],
  'facturas:eliminar': ['admin'],
  'facturas:pdf':      ['vendedor', 'contador', 'admin'],
  'facturas:anular':   ['contador', 'admin'],
  'facturas:emitir_ecf': ['vendedor', 'contador', 'admin'],
  'facturas:duplicar': ['vendedor', 'contador', 'admin'],

  // ── Clientes ─────────────────────────────────────────────────────────────────
  'clientes:ver':           ['viewer', 'vendedor', 'contador', 'admin'],
  'clientes:crear':         ['vendedor', 'contador', 'admin'],
  'clientes:editar':        ['vendedor', 'contador', 'admin'],
  'clientes:eliminar':      ['admin'],
  'clientes:estado_cuenta': ['vendedor', 'contador', 'admin'],

  // ── Productos ────────────────────────────────────────────────────────────────
  'productos:ver':      ['viewer', 'vendedor', 'contador', 'admin'],
  'productos:crear':    ['vendedor', 'contador', 'admin'],
  'productos:editar':   ['vendedor', 'contador', 'admin'],
  'productos:eliminar': ['admin'],
  'productos:stock':    ['vendedor', 'contador', 'admin'],
  'productos:stock_bajo': ['vendedor', 'contador', 'admin'],

  // ── Compras ──────────────────────────────────────────────────────────────────
  'compras:ver':      ['contador', 'admin'],
  'compras:crear':    ['contador', 'admin'],
  'compras:editar':   ['contador', 'admin'],
  'compras:eliminar': ['admin'],
  'compras:duplicar': ['contador', 'admin'],

  // ── CxC / CxP ────────────────────────────────────────────────────────────────
  'cxc:ver':          ['vendedor', 'contador', 'admin'],
  'cxc:cobrar':       ['vendedor', 'contador', 'admin'],
  'cxp:ver':          ['contador', 'admin'],
  'cxp:pagar':        ['contador', 'admin'],

  // ── Reportes ─────────────────────────────────────────────────────────────────
  'reportes:ventas':     ['vendedor', 'contador', 'admin'],
  'reportes:financiero': ['vendedor', 'contador', 'admin'],
  'reportes:dgii':       ['vendedor', 'contador', 'admin'],
  'reportes:inventario': ['vendedor', 'contador', 'admin'],

  // ── Declaraciones ────────────────────────────────────────────────────────────
  'declaraciones:ver':      ['contador', 'admin'],
  'declaraciones:exportar': ['contador', 'admin'],

  // ── Configuración ────────────────────────────────────────────────────────────
  'configuracion:ver':    ['admin'],
  'configuracion:editar': ['admin'],
  'usuarios:ver':         ['admin'],
  'usuarios:editar':      ['admin'],

  // ── Caja y POS ───────────────────────────────────────────────────────────────
  'pos:usar':    ['vendedor', 'contador', 'admin'],
  'caja:abrir':  ['vendedor', 'contador', 'admin'],
  'caja:cerrar': ['vendedor', 'contador', 'admin'],
  'caja:anular': ['contador', 'admin'],
  'caja:ver':    ['vendedor', 'contador', 'admin'],

  // ── e-CF ─────────────────────────────────────────────────────────────────────
  'ecf:ver':    ['vendedor', 'contador', 'admin'],
  'ecf:emitir': ['vendedor', 'contador', 'admin'],
};

/** Devuelve true si el usuario autenticado puede realizar la acción. */
export function useCanDo(accion: string): boolean {
  const user = useAuthStore(s => s.user);
  if (!user?.role) return false;
  if (user.role === 'super_admin') return true;

  const permitidos = PERMISOS[accion];
  if (!permitidos) return false;
  return permitidos.includes(user.role as UserRole);
}

/** Devuelve true si el usuario puede realizar AL MENOS UNA de las acciones. */
export function useCanDoAny(acciones: string[]): boolean {
  const user = useAuthStore(s => s.user);
  if (!user?.role) return false;
  if (user.role === 'super_admin') return true;
  return acciones.some(a => PERMISOS[a]?.includes(user.role as UserRole) ?? false);
}

/** Utilidades de rol para el componente que lo necesite. */
export function useRol() {
  const user = useAuthStore(s => s.user);
  const role = user?.role ?? 'viewer';
  return {
    role,
    esAdmin:      ['admin', 'super_admin'].includes(role),
    esContador:   role === 'contador',
    esVendedor:   role === 'vendedor',
    esViewer:     role === 'viewer',
    esSuperAdmin: role === 'super_admin',
    tieneRolMinimo: (rolMinimo: string) =>
      (JERARQUIA[role] ?? 0) >= (JERARQUIA[rolMinimo] ?? 0),
  };
}
