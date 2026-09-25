/**
 * Hook para el modo supervisor del POS.
 *
 * Si supervisorModeEnabled = false → todas las acciones pasan sin modal.
 * Si supervisorModeEnabled = true → solicita credenciales de admin para
 * acciones que superen el umbral configurado (ej: descuento > maxDiscountPercent).
 *
 * La sesión persiste en localStorage (sobrevive F5 Y cierre de pestaña/navegador
 * — antes usaba sessionStorage por error, lo que la mataba al cerrar la pestaña
 * aunque no hubieran pasado las 8h). Se cierra: manualmente (ESC o badge ×),
 * automáticamente al expirar (8h), o al hacer LOGOUT — esto último ya lo hacía
 * auth.store.ts (`localStorage.removeItem('pos_supervisor')` en logout()), pero
 * nunca surtía efecto porque la sesión vivía en sessionStorage, no en la clave
 * que logout() limpiaba.
 *
 * Los dos cierres audit-relevantes (manual y por expiración) se reportan al
 * backend vía POST /auth/supervisor-log/cerrar — ver AuthService.cerrarSesionSupervisor.
 * El cierre por logout NO se audita aparte: es el mismo evento que ya audita
 * el propio logout del usuario, y no hay ninguna llamada de red segura que
 * hacer en ese instante (la sesión/JWT ya se está invalidando).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

export interface SupervisorSession {
  nombre:     string;
  role:       string;
  until:      number; // timestamp ms
  sessionId:  number | null; // id de la fila de activación en pos_supervisor_log
}

interface UseSupervisorReturn {
  supervisorModeEnabled: boolean;
  maxDiscountPercent:    number;
  supervisorSession:     SupervisorSession | null;
  /** true si hay sesión activa de supervisor */
  supervisorActive:      boolean;
  supervisorName:        string;
  /**
   * Verifica si una acción requiere supervisor y la aprueba.
   * @returns true si se puede proceder, false si se cancela.
   */
  requireSupervisor: (action: string, detail?: string) => Promise<boolean>;
  /**
   * Como requireSupervisor pero sin verificar supervisorModeEnabled.
   * Usar para acciones críticas que SIEMPRE requieren autorización.
   */
  requireSupervisorForced: (action: string, detail?: string) => Promise<boolean>;
  /** Abre el modal programáticamente */
  openSupervisorModal: (action: string, detail?: string) => void;
  /** Limpiar sesión de supervisor (ESC / badge ×) — audita el cierre */
  clearSupervisor: () => void;
  /** Resolver pendiente (llamado desde el modal) */
  resolveModal: (result: boolean, nombre?: string, role?: string, sessionId?: number | null) => void;
  /** Estado del modal: null = cerrado */
  pendingAction: { action: string; detail?: string } | null;
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

  const supervisorModeEnabled: boolean = posConfig?.supervisorModeEnabled ?? false;
  const maxDiscountPercent:    number  = posConfig?.maxDiscountPercent    ?? 10;

  // Inicializar desde localStorage para sobrevivir F5 y cierre de pestaña
  const [supervisorSession, setSupervisorSession] = useState<SupervisorSession | null>(loadSessionFromStorage);
  const [pendingAction, setPendingAction] = useState<{ action: string; detail?: string } | null>(null);
  const resolveRef = useRef<((result: boolean) => void) | null>(null);

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

  const resolveModal = useCallback((result: boolean, nombre?: string, role?: string, sessionId?: number | null) => {
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
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  const requireSupervisor = useCallback(async (action: string, detail?: string): Promise<boolean> => {
    // Si el modo está desactivado → libre
    if (!supervisorModeEnabled) return true;
    // Si hay sesión activa de supervisor → usar sin pedir de nuevo
    if (supervisorActive) return true;

    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setPendingAction({ action, detail });
    });
  }, [supervisorModeEnabled, supervisorActive]);

  // Siempre solicita autorización independientemente de supervisorModeEnabled.
  // Para acciones críticas como Cierre de Caja.
  const requireSupervisorForced = useCallback(async (action: string, detail?: string): Promise<boolean> => {
    if (supervisorActive) return true;

    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setPendingAction({ action, detail });
    });
  }, [supervisorActive]);

  return {
    supervisorModeEnabled,
    maxDiscountPercent,
    supervisorSession,
    supervisorActive,
    supervisorName,
    requireSupervisor,
    requireSupervisorForced,
    openSupervisorModal,
    clearSupervisor,
    resolveModal,
    pendingAction,
  };
}
