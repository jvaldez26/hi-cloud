/**
 * Hooks para la Bandeja de Entrada.
 *
 * POLÍTICA DE CACHÉ:
 * - no-leidos-count: staleTime Infinity + gcTime Infinity.
 *   Una sola petición al entrar; se invalida manualmente al abrir la bandeja
 *   o al marcar leído/archivar. Cero polling.
 * - bandeja: staleTime 30s — el usuario espera datos frescos al abrirla,
 *   pero no hace falta refetch por foco de ventana.
 * - novedades-no-vistas: staleTime Infinity — solo se consulta una vez por sesión.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mensajesApi, MensajeBandeja } from '../api/mensajes.api';

// ─── Keys ──────────────────────────────────────────────────────────────────────

export const MENSAJES_KEYS = {
  noLeidosCount:     ['mensajes-no-leidos-count']     as const,
  bandeja:           (tab: string) => ['mensajes-bandeja', tab] as const,
  novedadesNoVistas: ['mensajes-novedades-no-vistas'] as const,
  adminLista:        ['mensajes-admin-lista']          as const,
  adminStats:        (id: string) => ['mensajes-admin-stats', id] as const,
};

// ─── Cliente ───────────────────────────────────────────────────────────────────

/** Badge del menú — staleTime Infinity, invalidar manualmente */
export function useNoLeidosCount(enabled = true) {
  return useQuery({
    queryKey:             MENSAJES_KEYS.noLeidosCount,
    queryFn:              mensajesApi.getNoLeidosCount,
    enabled,
    staleTime:            Infinity,
    gcTime:               Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Mensajes de una pestaña de la bandeja */
export function useBandeja(tab: 'principal' | 'novedades' | 'archivo', enabled = true) {
  return useQuery({
    queryKey:             MENSAJES_KEYS.bandeja(tab),
    queryFn:              () => mensajesApi.getBandeja(tab),
    enabled,
    staleTime:            30_000,
    refetchOnWindowFocus: false,
  });
}

/** IDs de novedades cuyo toast aún no se mostró — consulta única por sesión */
export function useNovedadesNoVistas(enabled = true) {
  return useQuery({
    queryKey:             MENSAJES_KEYS.novedadesNoVistas,
    queryFn:              mensajesApi.getNovedadesNoVistas,
    enabled,
    staleTime:            Infinity,
    gcTime:               Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Marcar un mensaje como leído e invalidar el badge */
export function useMarcarLeido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mensajesApi.marcarLeido(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: MENSAJES_KEYS.noLeidosCount }),
    // Actualización optimista en la lista
    onMutate: async (id: string) => {
      const tabs = ['principal', 'novedades', 'archivo'] as const;
      tabs.forEach(tab => {
        qc.setQueryData<MensajeBandeja[]>(MENSAJES_KEYS.bandeja(tab), prev =>
          prev?.map(m => m.id === id ? { ...m, leidoEn: new Date().toISOString() } : m),
        );
      });
    },
  });
}

/** Marcar toast de novedad como visto (vistoEn) sin marcar como leído */
export function useMarcarVisto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mensajesApi.marcarVisto(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: MENSAJES_KEYS.novedadesNoVistas });
    },
  });
}

/** Archivar mensaje */
export function useArchivar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mensajesApi.archivar(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: MENSAJES_KEYS.noLeidosCount });
      // Refrescar todas las pestañas
      qc.invalidateQueries({ queryKey: ['mensajes-bandeja'] });
    },
  });
}

/** Marcar todos como leídos */
export function useMarcarTodosLeidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tab: 'principal' | 'novedades') => mensajesApi.marcarTodosLeidos(tab),
    onSuccess:  (_data, tab) => {
      qc.invalidateQueries({ queryKey: MENSAJES_KEYS.noLeidosCount });
      qc.invalidateQueries({ queryKey: MENSAJES_KEYS.bandeja(tab) });
    },
  });
}

// ─── Admin ─────────────────────────────────────────────────────────────────────

export function useMensajesAdmin() {
  return useQuery({
    queryKey:             MENSAJES_KEYS.adminLista,
    queryFn:              mensajesApi.adminListar,
    staleTime:            30_000,
    refetchOnWindowFocus: false,
  });
}

export function useMensajeAdminStats(id: string, enabled = true) {
  return useQuery({
    queryKey: MENSAJES_KEYS.adminStats(id),
    queryFn:  () => mensajesApi.adminStats(id),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCrearMensaje() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mensajesApi.adminCrear,
    onSuccess:  () => qc.invalidateQueries({ queryKey: MENSAJES_KEYS.adminLista }),
  });
}

export function useEditarMensaje() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      mensajesApi.adminEditar(id, payload),
    onSuccess:  () => qc.invalidateQueries({ queryKey: MENSAJES_KEYS.adminLista }),
  });
}

export function useDesactivarMensaje() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mensajesApi.adminDesactivar,
    onSuccess:  () => qc.invalidateQueries({ queryKey: MENSAJES_KEYS.adminLista }),
  });
}
