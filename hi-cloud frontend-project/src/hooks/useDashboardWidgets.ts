import { useCallback } from 'react';
import { message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { preferenciasApi, type RespuestaWidgets } from '../api/preferencias.api';
import { SLUGS_IMPLEMENTADOS } from '../pages/dashboard/widgets/registro';

/** Clave de la PREFERENCIA. Nunca lleva dentro la lista de gráficas activas. */
export const CLAVE_PREFERENCIA = ['dashboard-widgets'] as const;

/**
 * Tope de graficas por usuario. Tiene que coincidir con MAX_WIDGETS del backend
 * (src/preferencias/dashboard-widgets.catalogo.ts): el catalogo tiene 14 y el
 * tope es 12, asi que el choque es alcanzable de verdad, no teorico.
 */
export const MAX_WIDGETS = 12;

/**
 * Las cuatro de siempre. Duplican los defaults del backend a propósito: si la
 * preferencia no se puede leer, el dashboard tiene que salir igualmente con algo
 * útil, no en blanco.
 */
export const WIDGETS_POR_DEFECTO = [
  // MISMO ORDEN que el backend, y por la misma razon: con una media en cuarto
  // lugar el panel no deja hueco a dos columnas. Ver el catalogo del servidor.
  'antiguedad-cobrar',
  'ingresos-gastos-anual',
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

    onError: (err: any, _vars, ctx) => {
      if (ctx?.anterior) qc.setQueryData([...CLAVE_PREFERENCIA], ctx.anterior);
      // Un optimista que revierte sin decir nada es peor que no ser optimista:
      // la grafica aparece, desaparece sola y nadie sabe por que.
      const detalle = err?.response?.data?.message
        ?? err?.response?.data?.errors?.[0]
        ?? 'No se pudo guardar tu selección de gráficas.';
      message.error(String(detalle));
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
    // Se corta aqui, antes del optimista: si se dejara pasar, la grafica
    // apareceria, el servidor devolveria 400 por el tope y desapareceria sola.
    // Mejor decirlo antes de pintarla.
    if (slugs.length >= MAX_WIDGETS) {
      message.warning(
        `El panel admite ${MAX_WIDGETS} gráficas. Quita alguna antes de agregar otra.`,
      );
      return;
    }
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
