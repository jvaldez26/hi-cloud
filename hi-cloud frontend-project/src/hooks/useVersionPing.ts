import { useQuery } from '@tanstack/react-query';

/**
 * Sondeo único a GET /api/v1/version.
 *
 * Antes había DOS sondeos independientes contra el backend:
 *   - NewVersionBanner: fetch a /version cada 5 min (detectar deploys)
 *   - POSPage:          api.get('/health') cada 30 s (indicador "DGII Online")
 *
 * El de /health costaba una query de BD (SELECT 1) por tick y por cada POS
 * abierto, sin necesitarla: lo único que mide el indicador es si el backend
 * responde. /version responde con cuatro constantes leídas al arrancar el
 * proceso — sin BD, sin Redis, sin auth.
 *
 * Ahora ambos consumidores comparten esta queryKey, así que React Query hace
 * UN solo request para los dos y aplica el refetchInterval más corto de los
 * observers montados: 30 s mientras el POS está abierto, 5 min en el resto de
 * la app. Al cerrar el POS vuelve solo a 5 min.
 */
export const VERSION_QUERY_KEY = ['app-version-ping'] as const;

/** Intervalos de sondeo. El POS necesita detectar caídas rápido; el banner no. */
export const VERSION_POLL_POS = 30_000;       // 30 s — indicador de conectividad
export const VERSION_POLL_APP = 5 * 60_000;   // 5 min — detección de deploy nuevo

export interface VersionPing {
  /** false = el backend no respondió (red caída, 5xx, proxy abajo). */
  online:  boolean;
  /** SHA del commit desplegado, o null si el backend no lo expone. */
  buildId: string | null;
}

/**
 * `credentials: 'omit'` a propósito: /version es público y no debe arrastrar
 * cookies. Se usa fetch en vez del cliente axios para que un fallo del sondeo
 * nunca entre en el interceptor de 401 → refresh → logout: este ping mide
 * disponibilidad, no sesión, y no debe poder sacar a nadie del sistema.
 */
async function fetchVersion(): Promise<VersionPing> {
  try {
    const res = await fetch('/api/v1/version', { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return { online: false, buildId: null };
    const json = await res.json();
    return { online: true, buildId: (json?.data?.build_id as string | undefined) ?? null };
  } catch {
    return { online: false, buildId: null };
  }
}

/**
 * @param intervalMs cada cuánto sondear MIENTRAS este componente esté montado.
 *   Con varios observers, React Query usa el intervalo más corto.
 */
export function useVersionPing(intervalMs: number) {
  return useQuery<VersionPing>({
    queryKey: VERSION_QUERY_KEY,
    queryFn:  fetchVersion,
    refetchInterval: intervalMs,
    // Sin sondeo con la pestaña oculta: un POS de fondo no debe generar tráfico.
    refetchIntervalInBackground: false,
    // ...pero SÍ al volver a ella, y esto hay que pedirlo explícitamente porque
    // el QueryClient global trae refetchOnWindowFocus:false para todas las
    // queries. Sin esta línea, una pestaña de fondo deja de sondear y al
    // recuperarla tampoco refetchea: el banner de versión nueva podía tardar
    // hasta 5 min en aparecer, justo cuando el usuario vuelve y más importa
    // saber que hay que recargar. El coste es nulo — /version no toca BD.
    refetchOnWindowFocus: true,
    staleTime: 0,
    // fetchVersion nunca lanza — devuelve { online: false }. Reintentar solo
    // retrasaría el cambio del indicador a rojo.
    retry: false,
  });
}
