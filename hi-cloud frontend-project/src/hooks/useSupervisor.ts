/**
 * Hook para el Modo Supervisor del POS — rediseño por políticas (una por
 * pestaña/acción, ver Configuración → Modo Supervisor), en vez de los dos
 * interruptores genéricos de antes (supervisorModeEnabled + toggles
 * sueltos). La política de cada clave sale de GET
 * /configuracion/supervisor-politicas y decide dos cosas:
 *
 *   - requerido: si NO, la acción pasa libre, sin tocar nada más.
 *   - modo: 'sesion' reusa la sesión de 8h de siempre (si ya hay una
 *     activa, no vuelve a pedir nada); 'cada_vez' SIEMPRE pide una
 *     autorización nueva para esa acción puntual, aunque haya sesión — y el
 *     backend devuelve un token de un solo uso que hay que mandar en la
 *     llamada real (header X-Supervisor-Token) para que el guard del
 *     servidor la acepte.
 *
 * La sesión en sí (localStorage, 8h, auditoría de cierre) no cambió — ver
 * el comentario largo más abajo, igual que antes de este rediseño.
 *
 * Genérico por diseño: una pantalla NUNCA tiene que saber de antemano si una
 * clave requiere supervisor ni cablear requireSupervisor() a mano antes de
 * cada llamada. Este hook se registra como el "handler" de
 * sessionEvents.ts (mismo patrón que la reautenticación de sesión) — cuando
 * CUALQUIER petición choca con un 403 { supervisorClaveRequerida }, el
 * interceptor de api/client.ts pide la autorización aquí y reintenta la
 * MISMA petición con el token, sin que el call site original se entere. Los
 * call sites que SÍ llaman requireSupervisor() a mano (para abrir el modal
 * antes de arrancar un flujo largo, como el carrito del POS) siguen
 * funcionando igual — ambos caminos comparten el mismo estado/modal.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { registerSupervisorAuthHandler } from '../utils/sessionEvents';

export interface SupervisorSession {
  nombre:     string;
  role:       string;
  until:      number; // timestamp ms
  sessionId:  number | null; // id de la fila de activación en pos_supervisor_log
}

export interface PoliticaSupervisor {
  clave:       string;
  label:       string;
  descripcion: string;
  grupo:       string;
  requerido:   boolean;
  modo:        'sesion' | 'cada_vez';
}

export interface AutorizacionResultado {
  ok:     boolean;
  /** Presente solo cuando la política de la clave es 'cada_vez' y ok=true. */
  token?: string;
}

interface UseSupervisorReturn {
  /** Catálogo completo con el valor actual de la empresa — para la pantalla de Configuración. */
  politicas:             PoliticaSupervisor[];
  /** Umbral "Descuento máximo sin supervisor" — sin relación con el catálogo, se mantiene como estaba. */
  maxDiscountPercent:    number;
  supervisorSession:     SupervisorSession | null;
  /** true si hay sesión activa de supervisor */
  supervisorActive:      boolean;
  supervisorName:        string;
  /**
   * Consulta la política de `clave` y, si aplica, pide autorización.
   * Devuelve { ok:false } si el cajero canceló el modal, { ok:true } si no
   * hacía falta nada o si la sesión ya cubre la clave, y { ok:true, token }
   * si la política es 'cada_vez' — ese token hay que mandarlo en la llamada
   * real que sigue (header X-Supervisor-Token).
   */
  requireSupervisor: (clave: string, action?: string, detail?: string) => Promise<AutorizacionResultado>;
  /** Abre el modal programáticamente (botón "Activar modo supervisor" / badge) */
  openSupervisorModal: (action: string, detail?: string) => void;
  /** Limpiar sesión de supervisor (ESC / badge ×) — audita el cierre */
  clearSupervisor: () => void;
  /** Resolver pendiente (llamado desde el modal) */
  resolveModal: (result: boolean, nombre?: string, role?: string, sessionId?: number | null, supervisorToken?: string) => void;
  /** Estado del modal: null = cerrado */
  pendingAction: { action: string; detail?: string; clave?: string } | null;
}

const STORAGE_KEY        = 'pos_supervisor';
const SESSION_MS         = 8 * 60 * 60_000; // 8 horas
const CHEQUEO_EXPIRACION_MS = 5 * 60_000;   // revisar expiración cada 5 min, no solo al montar

function auditarCierre(sessionId: number | null, motivo: 'manual' | 'expiracion') {
  if (!sessionId) return; // sesiones viejas (antes de este cambio) no tienen sessionId — nada que auditar
  api.post('/auth/supervisor-log/cerrar', { sessionId, motivo }).catch(() => { /* best-effort, no bloquea la UI */ });
}

function loadSessionFromStorage(): SupervisorSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s: SupervisorSession = JSON.parse(raw);
    if (s.until > Date.now()) return s;
    // Expiró mientras la pestaña estaba cerrada — se audita igual que una
    // expiración detectada en caliente, no se descarta en silencio.
    auditarCierre(s.sessionId ?? null, 'expiracion');
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function useSupervisor(): UseSupervisorReturn {
  const { data: posConfig } = useQuery<any>({
    queryKey: ['pos-config-supervisor'],
    queryFn:  () => api.get('/configuracion/empresa/pos-config').then(r => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });
  const { data: politicasData } = useQuery<PoliticaSupervisor[]>({
    queryKey: ['supervisor-politicas'],
    queryFn:  () => api.get('/configuracion/supervisor-politicas').then(r => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });
  const politicas = politicasData ?? [];
  const politicaPorClave = useRef<Map<string, PoliticaSupervisor>>(new Map());
  politicaPorClave.current = new Map(politicas.map(p => [p.clave, p]));

  const maxDiscountPercent: number = posConfig?.maxDiscountPercent ?? 10;

  // Inicializar desde localStorage para sobrevivir F5 y cierre de pestaña
  const [supervisorSession, setSupervisorSession] = useState<SupervisorSession | null>(loadSessionFromStorage);
  const [pendingAction, setPendingAction] = useState<{ action: string; detail?: string; clave?: string } | null>(null);
  const resolveRef = useRef<((result: AutorizacionResultado) => void) | null>(null);

  const supervisorActive = supervisorSession !== null && supervisorSession.until > Date.now();
  const supervisorName   = supervisorActive ? supervisorSession!.nombre : '';

  // Revisión periódica de expiración: sin esto, una sesión que cumple 8h con
  // la pestaña abierta y sin interacción no se detecta (ni se audita) hasta
  // el próximo requireSupervisor/render — que podría tardar horas de más.
  useEffect(() => {
    const id = setInterval(() => {
      setSupervisorSession(current => {
        if (!current || current.until > Date.now()) return current;
        auditarCierre(current.sessionId, 'expiracion');
        localStorage.removeItem(STORAGE_KEY);
        return null;
      });
    }, CHEQUEO_EXPIRACION_MS);
    return () => clearInterval(id);
  }, []);

  // Limpiar sesión — también borra localStorage (llamado por ESC / badge ×)
  const clearSupervisor = useCallback(() => {
    setSupervisorSession(current => {
      auditarCierre(current?.sessionId ?? null, 'manual');
      return null;
    });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const openSupervisorModal = useCallback((action: string, detail?: string) => {
    setPendingAction({ action, detail });
  }, []);

  const resolveModal = useCallback((result: boolean, nombre?: string, role?: string, sessionId?: number | null, supervisorToken?: string) => {
    setPendingAction(null);
    if (result && nombre) {
      // Sesión activa 8 horas; persiste en localStorage para sobrevivir F5 y cierre de pestaña
      const session: SupervisorSession = {
        nombre,
        role:  role ?? 'admin',
        until: Date.now() + SESSION_MS,
        sessionId: sessionId ?? null,
      };
      setSupervisorSession(session);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* ignore */ }
    }
    resolveRef.current?.(result ? { ok: true, token: supervisorToken } : { ok: false });
    resolveRef.current = null;
  }, []);

  const requireSupervisor = useCallback(async (clave: string, action?: string, detail?: string): Promise<AutorizacionResultado> => {
    const politica = politicaPorClave.current.get(clave);
    // Clave sin política conocida (no debería pasar si el catálogo está al
    // día) → no bloquea, mismo criterio defensivo que el backend.
    if (!politica || !politica.requerido) return { ok: true };

    if (politica.modo === 'sesion' && supervisorActive) return { ok: true };

    // Sin `action` explícito (caso del interceptor, que solo conoce la
    // clave): usa el label del catálogo — así el modal siempre muestra algo
    // legible aunque el call site no haya sabido de antemano qué clave haría falta.
    return new Promise<AutorizacionResultado>(resolve => {
      resolveRef.current = resolve;
      setPendingAction({ action: action ?? politica.label, detail, clave });
    });
  }, [supervisorActive]);

  // Se registra como el puente genérico 403 → autorización → reintento (ver
  // sessionEvents.ts). Solo existe un registrador (este hook vive una sola
  // vez, montado en el POS) — a diferencia de la reautenticación de sesión
  // no hace falta un nivel "por defecto" separado.
  useEffect(() => {
    registerSupervisorAuthHandler(requireSupervisor);
    return () => registerSupervisorAuthHandler(null);
  }, [requireSupervisor]);

  return {
    politicas,
    maxDiscountPercent,
    supervisorSession,
    supervisorActive,
    supervisorName,
    requireSupervisor,
    openSupervisorModal,
    clearSupervisor,
    resolveModal,
    pendingAction,
  };
}
