import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

export interface VideoTutorialPublico {
  titulo:           string;
  proveedor:        'youtube' | 'vimeo';
  videoId:          string;
  duracionSegundos: number | null;
}

/** Mapa global: módulo → datos del video activo. Se cachea 5 min por app. */
type MapaVideos = Record<string, VideoTutorialPublico>;

async function fetchVideos(): Promise<MapaVideos> {
  const res = await api.get<MapaVideos>('/videos-tutoriales/publico');
  return res.data;
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
