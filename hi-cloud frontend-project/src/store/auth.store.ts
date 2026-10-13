import { create } from 'zustand';
import { message } from 'antd';
import type { AuthUser } from '../types';
import { syncSentryScope } from '../observability/sentryScope';
import { borrarCarritoYEspera, idDePestana } from '../pages/pos/carritoStorage';
import { resolverRolPorEmpresa } from '../utils/resolverRolPorEmpresa';
import { leerJSON, leerTexto, guardarJSON, guardarTexto } from '../utils/safeStorage';
import { leerCajaAbiertaEquipo, limpiarCajaAbiertaEquipoSiEs } from '../utils/cajaEquipoStorage';

/**
 * "Hay una caja abierta de [cajero] en este equipo" — incidente real,
 * empresa 73: un cajero deja su caja abierta en un equipo compartido y otro
 * usuario entra ahí sin saber que ya hay un turno abierto. La clave de
 * localStorage es solo la PISTA de qué mirar (puede estar obsoleta si esa
 * caja se cerró desde otro equipo) — por eso siempre se reverifica contra
 * el backend antes de avisar. Import dinámico de api/client para no crear
 * una dependencia de módulo en la carga del store (mismo patrón que la
 * rehidratación de App.tsx).
 */
async function avisarSiHayCajaAbiertaDeOtroEquipo(usuarioQueEntra: AuthUser): Promise<void> {
  const registro = leerCajaAbiertaEquipo();
  if (!registro || registro.vendedorId === usuarioQueEntra.id) return;
  try {
    const { default: api } = await import('../api/client');
    const { data } = await api.get(`/caja/${registro.cajaId}`);
    const caja = data?.data ?? data;
    if (caja?.estado !== 'abierta') {
      limpiarCajaAbiertaEquipoSiEs(registro.cajaId);
      return;
    }
    message.warning({
      content: `Hay una caja abierta de ${registro.vendedorNombre || 'otro cajero'} en este equipo`,
      duration: 6,
    });
  } catch { /* verificación best-effort — un fallo de red no debe bloquear el login */ }
}

// Callback registrado por App.tsx para limpiar React Query al cerrar sesión.
let _onLogout: (() => void) | null = null;
export function registerLogoutCallback(fn: () => void) { _onLogout = fn; }

interface EmpresaItem {
  empresaId:   number;
  nombre:      string;
  rnc?:        string;
  rol:         string;
  isPrincipal: boolean;
  plan?:       string;
}

interface AuthState {
  user:            AuthUser | null;
  empresaActual:   number | null;
  empresas:        EmpresaItem[];
  almacenActual:   number | null;
  sucursalActual:  number | null;
  sucursalNombre:  string | null;
  hydrated:        boolean;   // true = ya llamamos GET /auth/me

  login:             (user: AuthUser, empresaActual?: number | null, empresas?: EmpresaItem[], almacenActual?: number | null, sucursalActual?: number | null, sucursalNombre?: string | null) => void;
  /**
   * @param opts.preservarCarritoPOS  No borrar el carrito ni las ventas en pausa.
   *   Solo para el cierre por SESIÓN DESPLAZADA: el cajero no pidió salir, lo
   *   sacó un login en otro dispositivo, y perder una venta a medio teclear es
   *   un daño real que él no provocó. Sigue siendo seguro entre empresas porque
   *   el carrito guarda su `empresaId` y POSPage lo descarta al restaurar si no
   *   coincide con la empresa activa.
   */
  logout:            (opts?: { preservarCarritoPOS?: boolean }) => void;
  isAuth:            () => boolean;
  /**
   * @param empresasFrescas  Lista de empresas más reciente que la que tiene el
   *   store (ej. AppLayout ya la pidió a /auth/mis-empresas para el selector
   *   de empresa) — se usa para resolver el rol y, si trae datos, también
   *   reemplaza `empresas` en el store (se auto-corrige la copia vieja en vez
   *   de arrastrarla). Sin este parámetro, cambiarEmpresa() solo tenía la
   *   copia de `empresas` capturada en el último login() — que en sesiones
   *   largas, tras un login con Google (empresas: []), o tras cambios de
   *   acceso del usuario, puede no incluir la empresa que se está activando y
   *   degradaba el rol sin necesidad.
   */
  cambiarEmpresa:    (empresaId: number, empresasFrescas?: EmpresaItem[]) => void;
  setSucursalActual: (sucursalId: number) => void;
  setSucursalNombre: (nombre: string | null) => void;
  setAlmacenActual:  (almacenId: number | null) => void;
  getEmpresaActual:  () => EmpresaItem | undefined;
  setHydrated:       (v: boolean) => void;
  updateUser:        (partial: Partial<AuthUser>) => void;
}

// Solo guardamos info de UI (NO el token — ahora vive en cookie httpOnly).
// Toda lectura/escritura pasa por safeStorage: un dato corrupto (incluida la
// cadena literal "undefined") nunca puede tumbar la carga de la app — esta
// inicialización corre a nivel de MÓDULO, antes de que React monte nada, así
// que ningún try/catch de componente llega a protegerla (ver safeStorage.ts).
const savedEmpresa  = leerTexto(localStorage, 'empresaId');
const savedAlmacen  = leerTexto(localStorage, 'almacenId');
const savedSucursal = leerTexto(localStorage, 'sucursalId');

export const useAuthStore = create<AuthState>((set, get) => ({
  user:           leerJSON<AuthUser>(localStorage, 'auth_user'),
  empresaActual:  savedEmpresa  ? Number(savedEmpresa) : null,
  empresas:       leerJSON<EmpresaItem[]>(localStorage, 'mis_empresas') ?? [],
  almacenActual:  savedAlmacen  ? Number(savedAlmacen) : null,
  sucursalActual: savedSucursal ? Number(savedSucursal) : null,
  sucursalNombre: leerTexto(localStorage, 'sucursalNombre'),
  hydrated:       false,

  login: (user, empresaActual, empresas = [], almacenActual?, sucursalActual?, sucursalNombre?) => {
    // Única fuente de corrección rol-por-empresa (ver resolverRolPorEmpresa):
    // CUALQUIER caller de login() queda bien sin tener que acordarse de
    // aplicarla — antes cada pantalla de login tenía que hacerlo por su cuenta
    // (y la mayoría no lo hacía, ver commit del fix de HiCloud Xlink). Puede
    // corregir empresaActual también (ver resolverRolPorEmpresa) — nunca solo
    // el rol — para que ambos queden consistentes con la misma empresa real.
    const { rol: rolResuelto, empresaActivaId: empresaResuelta } = resolverRolPorEmpresa(user.role, empresaActual ?? null, empresas);
    const userResuelto = rolResuelto === user.role ? user : { ...user, role: rolResuelto };

    // Token NO se guarda — está en cookie httpOnly, JS no puede verlo
    guardarJSON(localStorage, 'auth_user', userResuelto);

    if (empresaResuelta) {
      guardarTexto(localStorage, 'empresaId',    String(empresaResuelta));
      guardarJSON(localStorage,  'mis_empresas', empresas);
    } else {
      guardarTexto(localStorage, 'empresaId', null);
      guardarJSON(localStorage,  'mis_empresas', null);
    }

    guardarTexto(localStorage, 'almacenId',      almacenActual   ? String(almacenActual)  : null);
    guardarTexto(localStorage, 'sucursalId',     sucursalActual  ? String(sucursalActual) : null);
    guardarTexto(localStorage, 'sucursalNombre', sucursalNombre  || null);

    set({ user: userResuelto, empresaActual: empresaResuelta, empresas, almacenActual: almacenActual ?? null, sucursalActual: sucursalActual ?? null, sucursalNombre: sucursalNombre ?? null, hydrated: true });

    void avisarSiHayCajaAbiertaDeOtroEquipo(userResuelto);
  },

  logout: (opts) => {
    // Solo limpieza local. La llamada al servidor (authApi.logout() con keepalive:true)
    // es responsabilidad del llamador (handleLogout en AppLayout / PortalEmpleadoLayout).
    // SessionExpiredHandler y el interceptor de SESION_DESPLAZADA llaman logout()
    // directamente porque el servidor ya invalidó la sesión — no necesitan notificarle.
    localStorage.removeItem('auth_user');
    localStorage.removeItem('empresaId');
    localStorage.removeItem('mis_empresas');
    localStorage.removeItem('almacenId');
    localStorage.removeItem('sucursalId');
    localStorage.removeItem('sucursalNombre');
    localStorage.removeItem('hicloud-sidebar-group');  // estado accordion (legacy)
    // Limpiar estado del POS para que el próximo usuario no vea datos del anterior
    localStorage.removeItem('pos_supervisor');   // sesión de supervisor
    localStorage.removeItem('pos_cajero_nombre');
    localStorage.removeItem('pos_vendedor_id');
    localStorage.removeItem('hc_empresa_nombre');
    // Borra el carrito y las ventas en espera (de ESTA pestaña) SOLO en
    // logout voluntario — los tres cierres involuntarios (expired/displaced/
    // caducada) pasan preservarCarritoPOS:true y no tocan nada aquí. La
    // clave ya va por usuario+empresa+sucursal+pestaña (ver
    // carritoStorage.ts), así que esto ya no es lo único que evita que el
    // próximo cajero (u otra pestaña) vea el carrito de este.
    if (!opts?.preservarCarritoPOS) {
      const s = get();
      borrarCarritoYEspera(s.empresaActual, s.user?.id, s.sucursalActual, idDePestana());
    }
    sessionStorage.removeItem('pos_turno');
    sessionStorage.removeItem('pos_bloqueado');
    set({ user: null, empresaActual: null, empresas: [], almacenActual: null, sucursalActual: null, hydrated: true });
    _onLogout?.();
  },

  isAuth: () => !!get().user,

  cambiarEmpresa: (empresaId, empresasFrescas) => {
    guardarTexto(localStorage, 'empresaId', String(empresaId));
    set(state => {
      if (!state.user) return { empresaActual: empresaId };
      // Si el caller trae una lista más fresca que la del store (ej. AppLayout
      // ya la pidió a /auth/mis-empresas), se usa para resolver el rol — y
      // también se adopta como la nueva `empresas` del store, autocorrigiendo
      // la copia vieja en vez de arrastrarla a la próxima vez.
      const listaParaResolver = empresasFrescas && empresasFrescas.length > 0 ? empresasFrescas : state.empresas;
      const { rol: rolResuelto } = resolverRolPorEmpresa(state.user.role, empresaId, listaParaResolver);
      const newUser = rolResuelto === state.user.role ? state.user : { ...state.user, role: rolResuelto };
      if (newUser !== state.user) guardarJSON(localStorage, 'auth_user', newUser);
      if (empresasFrescas && empresasFrescas.length > 0) guardarJSON(localStorage, 'mis_empresas', empresasFrescas);
      return { empresaActual: empresaId, user: newUser, empresas: listaParaResolver };
    });
  },

  setSucursalActual: (sucursalId) => {
    guardarTexto(localStorage, 'sucursalId', String(sucursalId));
    set(() => ({ sucursalActual: sucursalId }));
  },

  setSucursalNombre: (nombre) => {
    guardarTexto(localStorage, 'sucursalNombre', nombre);
    set(() => ({ sucursalNombre: nombre }));
  },

  setAlmacenActual: (almacenId) => {
    guardarTexto(localStorage, 'almacenId', almacenId != null ? String(almacenId) : null);
    set(() => ({ almacenActual: almacenId }));
  },

  getEmpresaActual: () => {
    const state = get();
    return state.empresas.find(e => e.empresaId === state.empresaActual);
  },

  setHydrated: (v) => set({ hydrated: v }),

  /** Actualiza campos del usuario en memoria + localStorage sin re-login completo. */
  updateUser: (partial) => {
    set(state => {
      if (!state.user) return {};
      const updated = { ...state.user, ...partial };
      guardarJSON(localStorage, 'auth_user', updated);
      return { user: updated };
    });
  },
}));

// ── Observabilidad: mantener el scope de Sentry (usuario/empresa/sucursal) en
// sincronía con el store, para que TODO evento del frontend lleve contexto.
// Una vez al cargar (estado hidratado desde localStorage) + en cada cambio.
syncSentryScope(useAuthStore.getState());
useAuthStore.subscribe((s) => syncSentryScope(s));

// ── Sincronización entre pestañas (incidente real, empresa 73, 2026-10-12 y
// 2026-10-09): en un equipo compartido del local, una pestaña vieja se queda
// mostrando el usuario con el que se cargó, en memoria, aunque OTRA pestaña
// haya cerrado esa sesión o haya iniciado una nueva — la cookie httpOnly se
// comparte por NAVEGADOR, no por pestaña, así que las peticiones de la
// pestaña vieja empiezan a salir con el usuario nuevo sin que nadie lo note
// hasta que el backend rechaza una acción ("no es tu caja").
//
// El evento 'storage' SOLO se dispara en pestañas DISTINTAS a la que hizo el
// cambio (estándar del navegador) — la pestaña que hizo login/logout ya se
// actualiza sola por el flujo normal de React.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'auth_user') return;

    const idAnterior = useAuthStore.getState().user?.id ?? null;
    const nuevoUsuario = leerJSON<AuthUser>(localStorage, 'auth_user');
    const idNuevo = nuevoUsuario?.id ?? null;

    if (idNuevo === idAnterior) return; // mismo usuario (ej. solo cambió el rol) — nada que avisar aquí

    if (idNuevo == null) {
      // Logout en otra pestaña — a login de inmediato, sin esperar la
      // próxima petición (que de todas formas fallaría, pero tarde).
      useAuthStore.setState({
        user: null, empresaActual: null, empresas: [],
        almacenActual: null, sucursalActual: null, hydrated: true,
      });
      window.location.href = '/login';
      return;
    }

    // Otro usuario inició sesión en este navegador — esta pestaña NUNCA debe
    // seguir actuando como si fuera la anterior. Aviso + recarga completa
    // (no solo actualizar el store: React Query, el store del POS, etc.
    // también tienen que repartir desde cero con el usuario correcto).
    try {
      message.warning({
        content: `La sesión cambió a ${nuevoUsuario?.nombre ?? 'otro usuario'} — recargando…`,
        duration: 2,
      });
    } catch { /* antd aún no montado — no es crítico, igual se recarga */ }
    setTimeout(() => window.location.reload(), 1200);
  });
}
