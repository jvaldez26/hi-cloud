import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useColumnVisibility, calcularVisibles, calcularCambios, type ColDef } from './useColumnVisibility';
import { preferenciasApi } from '../api/preferencias.api';

/**
 * useColumnVisibility + sincronización entre dispositivos vía
 * /preferencias/columnas/:modulo — mismo patrón que useSidebarColapsado en
 * AppLayout.tsx: localStorage sigue siendo el primer pintado (sin esperar
 * red); se reconcilia una sola vez al llegar la respuesta del servidor
 * (`porDefecto:true` = nunca lo tocó en NINGÚN dispositivo — ahí se respeta
 * lo que ya hubiera en localStorage en vez de forzar el default encima);
 * cada cambio se guarda local E inmediatamente en el servidor.
 *
 * `modulo` tiene que estar en la allowlist del backend (MODULOS_COLUMNAS en
 * preferencias.service.ts) — uno desconocido hace que el PUT falle con 400
 * y la preferencia se quede solo local para esa sesión (mismo criterio que
 * el resto del ERP: fallar el sync nunca puede romper la tabla).
 */
export function useColumnVisibilitySync(modulo: string, allColumns: ColDef[]) {
  const local = useColumnVisibility(modulo, allColumns);

  const { data: pref } = useQuery({
    queryKey: ['preferencias-columnas', modulo],
    queryFn:  () => preferenciasApi.getColumnas(modulo),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!pref || pref.porDefecto) return;
    const visiblesServidor = calcularVisibles({ ocultas: pref.ocultas, mostradas: pref.mostradas }, allColumns);
    const mismo = visiblesServidor.length === local.visibleColumns.length
      && visiblesServidor.every(k => local.visibleColumns.includes(k));
    if (!mismo) local.updateVisibility(visiblesServidor);
    // Solo al llegar/cambiar la respuesta del servidor — no en cada cambio local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref]);

  const updateVisibility = useCallback((cols: string[]) => {
    local.updateVisibility(cols);
    const cambios = calcularCambios(cols, allColumns);
    preferenciasApi.setColumnas(modulo, cambios.ocultas, cambios.mostradas).catch(() => {});
  }, [local.updateVisibility, modulo, allColumns]);

  return { ...local, updateVisibility };
}
