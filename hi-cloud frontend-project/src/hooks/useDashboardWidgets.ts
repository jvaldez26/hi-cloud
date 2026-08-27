import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { preferenciasApi, type RespuestaWidgets } from '../api/preferencias.api';
import { SLUGS_IMPLEMENTADOS } from '../pages/dashboard/widgets/registro';

/** Clave de la PREFERENCIA. Nunca lleva dentro la lista de gráficas activas. */
export const CLAVE_PREFERENCIA = ['dashboard-widgets'] as const;

/**
 * Las cuatro de siempre. Duplican los defaults del backend a propósito: si la
 * preferencia no se puede leer, el dashboard tiene que salir igualmente con algo
 * útil, no en blanco.
 */
export const WIDGETS_POR_DEFECTO = [
  'ingresos-gastos-anual',
  'antiguedad-cobrar',
  'antiguedad-pagar',
  'resumen-gastos',
];

export function useDashboardWidgets() {
  const qc = useQueryClient();

  const q = useQuery<RespuestaWidgets>({
    queryKey: [...CLAVE_PREFERENCIA],
    queryFn:  preferenciasApi.getDashboardWidgets,
    staleTime: 5 * 60_000,
    // Que falle la preferencia no puede dejar sin panel a nadie: se cae a los
    // defaults y se sigue.
    retry: 1,
  });

  /**
   * Guardar es OPTIMISTA: la lista cambia en pantalla al instante y el PUT va
   * detrás. Si falla, se revierte a lo que había.
   *
   * Lo que este mutation NO hace, y es deliberado: invalidar nada. Un
   * `invalidateQueries` aquí volvería a pedir los datos de TODAS las gráficas
   * montadas cada vez que alguien agrega o quita una — justo el problema que
   * este rediseño existe para evitar. La única caché que se toca es la de la
   * preferencia, y se toca a mano con setQueryData.
   */
  const guardar = useMutation({
    mutationFn: preferenciasApi.setDashboardWidgets,

    onMutate: async (nuevos: string[]) => {
      await qc.cancelQueries({ queryKey: [...CLAVE_PREFERENCIA] });
      const anterior = qc.getQueryData<RespuestaWidgets>([...CLAVE_PREFERENCIA]);

      qc.setQueryData<RespuestaWidgets>([...CLAVE_PREFERENCIA], (prev) => ({
        widgets:    nuevos,
        // A partir del primer cambio ya es una decisión suya, no lo de fábrica.
        porDefecto: false,
        catalogo:   prev?.catalogo ?? [],
      }));

      return { anterior };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.anterior) qc.setQueryData([...CLAVE_PREFERENCIA], ctx.anterior);
    },

    // Sin onSettled con invalidate: el servidor devuelve la misma lista que ya
    // pintamos, y volver a pedirla solo sirve para gastar una petición.
  });

  const respuesta = q.data;

  const slugs = (respuesta?.widgets ?? WIDGETS_POR_DEFECTO)
    // Un slug que el backend conoce pero este frontend todavía no sabe pintar se
    // ignora en vez de romper el panel: las dos puntas pueden ir descompasadas
    // un despliegue.
    .filter(s => SLUGS_IMPLEMENTADOS.includes(s));

  const aplicar = useCallback((nuevos: string[]) => guardar.mutate(nuevos), [guardar]);

  const agregar = useCallback((slug: string) => {
    if (slugs.includes(slug)) return;
    aplicar([...slugs, slug]);
  }, [slugs, aplicar]);

  const quitar = useCallback((slug: string) => {
    aplicar(slugs.filter(s => s !== slug));
  }, [slugs, aplicar]);

  const reponerPorDefecto = useCallback(() => {
    aplicar(WIDGETS_POR_DEFECTO.filter(s => SLUGS_IMPLEMENTADOS.includes(s)));
  }, [aplicar]);

  /** Las del catálogo que este usuario aún no tiene puestas. */
  const disponibles = (respuesta?.catalogo ?? [])
    .filter(w => !slugs.includes(w.slug))
    .filter(w => SLUGS_IMPLEMENTADOS.includes(w.slug));

  return {
    slugs,
    disponibles,
    catalogo:   respuesta?.catalogo ?? [],
    porDefecto: respuesta?.porDefecto ?? true,
    cargando:   q.isLoading,
    /** true si la preferencia no se pudo leer y estamos con los defaults. */
    degradado:  q.isError,
    agregar,
    quitar,
    aplicar,
    reponerPorDefecto,
  };
}
