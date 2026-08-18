/**
 * Hooks para catálogos estáticos compartidos entre componentes.
 *
 * POR QUÉ existe este archivo
 * ───────────────────────────
 * En React Query, cuando dos componentes suscriben la misma queryKey con
 * distintos staleTime, el efectivo es el MÁS CORTO — el observer que expira
 * antes marca la query como stale para todos. Si un formulario define
 * queryKey: ['mis-sucursales', id] con staleTime: 0 y el POS usa Infinity,
 * al abrir ambas páginas en pestañas distintas el efectivo cae a 0 y la query
 * se recarga en cada foco de ventana.
 *
 * Centralizar aquí el staleTime garantiza que todos los observers de la misma
 * queryKey usen el mismo valor, aunque la importación venga de distintos archivos.
 *
 * REGLA: si necesitas un catálogo estático en un nuevo componente, importa el
 * hook de aquí en vez de escribir un useQuery directo con la misma queryKey.
 */

import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { productosApi } from '../api/productos.api';
import { modulosAddonApi } from '../api/modulos-addon.api';

// ─── Sucursales ────────────────────────────────────────────────────────────────
// Las sucursales de una empresa cambian solo en Configuración → Sucursales.
// No tiene sentido recargar en cada foco de ventana.
export function useSucursalesQuery(empresaId?: string | number | null) {
  return useQuery<any[]>({
    queryKey:             ['mis-sucursales', empresaId],
    queryFn:              () => api.get('/auth/mis-sucursales').then(r => r.data?.data ?? r.data ?? []),
    enabled:              empresaId != null,
    staleTime:            Infinity, // catálogo estático — cambia solo en config
    refetchOnWindowFocus: false,
  });
}

// ─── Unidades de Medida ────────────────────────────────────────────────────────
// Las UOM son de empresa y cambian raramente. Cargarlas con staleTime corto
// en UomSelect y ProductosPage a la vez que el POS usa Infinity provocaba
// refetches silenciosos.
export function useUomUnidadesQuery() {
  return useQuery({
    queryKey:             ['uom-unidades'],
    queryFn:              () => api.get('/uom').then((r: any) => r.data?.data ?? r.data),
    staleTime:            Infinity,
    refetchOnWindowFocus: false,
  });
}

// ─── Vendedores (selector) ─────────────────────────────────────────────────────
// Los vendedores cambian con baja frecuencia. 5 min es suficiente para que un
// vendedor recién creado aparezca sin esperar un día completo.
export function useVendedoresQuery() {
  return useQuery<any[]>({
    queryKey:             ['vendedores-sel'],
    queryFn:              () => api.get('/vendedores').then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    staleTime:            5 * 60_000,  // 5 min
    refetchOnWindowFocus: false,
  });
}

// ─── Catálogo de productos (selector / formularios) ───────────────────────────
// limit=5000 pesa ~100 KB por respuesta. Con refetchOnWindowFocus: true por
// defecto y múltiples pestañas abiertas (Facturas + POS + Cotizaciones), cada
// foco de ventana recargaba el catálogo en todas a la vez — el mismo problema
// que provocó las 127 req/min observadas en el log de nginx el 18/08/2026.
export function useProductosCatalogoQuery() {
  return useQuery({
    queryKey:             ['productos-sel'],
    queryFn:              () => productosApi.list(1, 5000, '', true),
    staleTime:            5 * 60_000,  // 5 min
    refetchOnWindowFocus: false,
  });
}

// ─── Módulos add-on ────────────────────────────────────────────────────────────
// Los módulos contratados cambian solo al contratar/cancelar — nunca en medio
// de una sesión de trabajo. Infinity evita que CommandPalette (con staleTime
// anterior de 5 min) anule el Infinity del AppLayout.
export function useMisModulosAddon(enabled = true) {
  return useQuery<{ modulos: string[] }>({
    queryKey:             ['mis-modulos-addon'],
    queryFn:              () => modulosAddonApi.misModulos(),
    enabled,
    staleTime:            Infinity,
    gcTime:               Infinity,
  });
}
