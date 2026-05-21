/**
 * Hook para el modo supervisor del POS.
 *
 * Si supervisorModeEnabled = false → todas las acciones pasan sin modal.
 * Si supervisorModeEnabled = true → solicita credenciales de admin para
 * acciones que superen el umbral configurado (ej: descuento > maxDiscountPercent).
 *
 * Sesión de supervisor activa por 5 minutos para no pedir en cada acción.
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
  /** Abre el modal programáticamente */
  openSupervisorModal: (action: string, detail?: string) => void;
  /** Limpiar sesión de supervisor */
  clearSupervisor: () => void;
  /** Resolver pendiente (llamado desde el modal) */
  resolveModal: (result: boolean, nombre?: string, role?: string) => void;
  /** Estado del modal: null = cerrado */
  pendingAction: { action: string; detail?: string } | null;
}

export function useSupervisor(): UseSupervisorReturn {
  const { data: posConfig } = useQuery<any>({
    queryKey: ['pos-config-supervisor'],
    queryFn:  () => api.get('/configuracion/empresa/pos-config').then(r => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });

  const supervisorModeEnabled: boolean = posConfig?.supervisorModeEnabled ?? false;
  const maxDiscountPercent:    number  = posConfig?.maxDiscountPercent    ?? 10;

  const [supervisorSession, setSupervisorSession] = useState<SupervisorSession | null>(null);
  const [pendingAction, setPendingAction] = useState<{ action: string; detail?: string } | null>(null);
  const resolveRef = useRef<((result: boolean) => void) | null>(null);

  const supervisorActive = supervisorSession !== null && supervisorSession.until > Date.now();
  const supervisorName   = supervisorActive ? supervisorSession!.nombre : '';

  const clearSupervisor = useCallback(() => setSupervisorSession(null), []);

  const openSupervisorModal = useCallback((action: string, detail?: string) => {
    setPendingAction({ action, detail });
  }, []);

  const resolveModal = useCallback((result: boolean, nombre?: string, role?: string) => {
    setPendingAction(null);
    if (result && nombre) {
      // Activar sesión de supervisor por 5 minutos
      setSupervisorSession({ nombre, role: role ?? 'admin', until: Date.now() + 5 * 60_000 });
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

  return {
    supervisorModeEnabled,
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
