import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { desenvolver } from '../api/desenvolver';

export interface VideoTutorialPublico {
  titulo:           string;
  proveedor:        'youtube' | 'vimeo';
  videoId:          string;
  duracionSegundos: number | null;
}

/** Mapa global: módulo → datos del video activo. Se cachea 5 min por app. */
type MapaVideos = Record<string, VideoTutorialPublico>;

async function fetchVideos(): Promise<MapaVideos> {
  // Mismo bug que en VideosTutorialesAdminPage: `res.data` es el envoltorio
  // { success, data } completo, no el mapa. Aquí no reventaba porque nadie le
  // hace .map() — solo se leían claves que salían undefined, así que el botón
  // de tutoriales llevaba sin encontrar ningún video y nadie lo notó.
  //
  // Este devuelve un MAPA, no una lista: desenvolver(), no desenvolverArray().
  const res = await api.get('/videos-tutoriales/publico');
  return desenvolver<MapaVideos>(res) ?? {};
}

/**
 * Hook que carga el catálogo público de videos una sola vez por sesión.
 * VideoTutorialButton lo consume para saber si mostrar u ocultar el botón.
 */
export function useVideosTutoriales() {
  return useQuery<MapaVideos>({
    queryKey:  ['videos-tutoriales-publico'],
    queryFn:   fetchVideos,
    staleTime: 5 * 60 * 1_000,   // 5 minutos
    gcTime:    10 * 60 * 1_000,  // 10 minutos en caché
    retry:     1,
  });
}
