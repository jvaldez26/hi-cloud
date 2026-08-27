import { useQuery } from '@tanstack/react-query';
import { preferenciasApi, type RespuestaWidgets } from '../api/preferencias.api';
import { SLUGS_IMPLEMENTADOS } from '../pages/dashboard/widgets/registro';

/**
 * Las cuatro de siempre. Duplican los defaults del backend a propósito: si la
 * preferencia no se puede leer, el dashboard tiene que salir igualmente con algo
 * util, no en blanco.
 */
export const WIDGETS_POR_DEFECTO = [
  'ingresos-gastos-anual',
  'antiguedad-cobrar',
  'antiguedad-pagar',
  'resumen-gastos',
];

export function useDashboardWidgets() {
  const q = useQuery<RespuestaWidgets>({
    queryKey: ['dashboard-widgets'],
    queryFn:  preferenciasApi.getDashboardWidgets,
    staleTime: 5 * 60_000,
    // Que falle la preferencia no puede dejar sin panel a nadie: se cae a los
    // defaults y se sigue.
    retry: 1,
  });

  const respuesta = q.data;

  const slugs = (respuesta?.widgets ?? WIDGETS_POR_DEFECTO)
    // Un slug que el backend conoce pero este frontend todavia no sabe pintar se
    // ignora en vez de romper el panel: las dos puntas pueden ir descompasadas
    // un despliegue.
    .filter(s => SLUGS_IMPLEMENTADOS.includes(s));

  return {
    slugs,
    catalogo:   respuesta?.catalogo ?? [],
    porDefecto: respuesta?.porDefecto ?? true,
    cargando:   q.isLoading,
    /** true si la preferencia no se pudo leer y estamos con los defaults. */
    degradado:  q.isError,
  };
}
