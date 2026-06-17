/**
 * Hook para el modo supervisor del POS.
 *
 * Si supervisorModeEnabled = false → todas las acciones pasan sin modal.
 * Si supervisorModeEnabled = true → solicita credenciales de admin para
 * acciones que superen el umbral configurado (ej: descuento > maxDiscountPercent).
 *
 * La sesión persiste en localStorage hasta que el usuario la cierra
 * explícitamente (ESC o badge ×). Expira automáticamente a las 8 horas.
 */
import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

export interface SupervisorSession {
  nombre: string;
  role:   string;
  until:  number; // timestamp ms
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
  /** Limpiar sesión de supervisor (ESC / badge ×) */
  clearSupervisor: () => void;
  /** Resolver pendiente (llamado desde el modal) */
  resolveModal: (result: boolean, nombre?: string, role?: string) => void;
  /** Estado del modal: null = cerrado */
  pendingAction: { action: string; detail?: string } | null;
}

const STORAGE_KEY   = 'pos_supervisor';
const SESSION_MS    = 8 * 60 * 60_000; // 8 horas

function loadSessionFromStorage(): SupervisorSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: SupervisorSession = JSON.parse(raw);
    if (!session.until || session.until <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
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

  // Inicializar desde localStorage para sobrevivir F5
  const [supervisorSession, setSupervisorSession] = useState<SupervisorSession | null>(loadSessionFromStorage);
  const [pendingAction, setPendingAction] = useState<{ action: string; detail?: string } | null>(null);
  const resolveRef = useRef<((result: boolean) => void) | null>(null);

  const supervisorActive = supervisorSession !== null && supervisorSession.until > Date.now();
  const supervisorName   = supervisorActive ? supervisorSession!.nombre : '';

  // Limpiar sesión — también borra localStorage (llamado por ESC / badge ×)
  const clearSupervisor = useCallback(() => {
    setSupervisorSession(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const openSupervisorModal = useCallback((action: string, detail?: string) => {
    setPendingAction({ action, detail });
  }, []);

  const resolveModal = useCallback((result: boolean, nombre?: string, role?: string) => {
    setPendingAction(null);
    if (result && nombre) {
      // Sesión activa 8 horas; persiste en localStorage para sobrevivir F5
      const session: SupervisorSession = {
        nombre,
        role:  role ?? 'admin',
        until: Date.now() + SESSION_MS,
      };
      setSupervisorSession(session);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
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
