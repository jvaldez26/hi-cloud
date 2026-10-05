import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { notification } from 'antd';
import api from '../api/client';

export interface ItemCentro {
  id:          string;
  origen:      'evento' | 'alerta';
  tipo:        string;
  prioridad:   number;
  titulo:      string;
  descripcion: string;
  ruta:        string;
  emoji:       string;
  fecha:       string;
  atendido:    boolean;
  cantidad?:   number;
  monto?:      number;
}

interface ObtenerResult {
  items:    ItemCentro[];
  noLeidos: number;
  noVistas: number;
  total:    number;
}

const QUERY_KEY = ['notificaciones-centro'];

function unwrap<T>(res: any): T {
  return (res as any).data?.data ?? (res as any).data;
}

async function fetchCentro(): Promise<ObtenerResult> {
  try {
    const res = await api.get('/notificaciones-centro');
    return unwrap<ObtenerResult>(res);
  } catch {
    return { items: [], noLeidos: 0, noVistas: 0, total: 0 };
  }
}

/** Hook principal — campanita y /notificaciones consumen el mismo estado. */
export function useNotificacionesCentro() {
  const qc = useQueryClient();
  const prevTotalRef = useRef<number>(0);

  const query = useQuery<ObtenerResult>({
    queryKey:        QUERY_KEY,
    queryFn:         fetchCentro,
    // El WebSocket (useRealtime, entidad 'notificaciones') ya invalida esta
    // key en tiempo real; este intervalo queda solo como respaldo por si el
    // socket se cae, bastante más espaciado que el polling anterior (90s).
    refetchInterval: 5 * 60_000,
    staleTime:       60_000,
  });

  useEffect(() => {
    if (!query.data) return;
    const curr = query.data;
    const prev = prevTotalRef.current;
    const criticaNueva = curr.items.find(i => i.prioridad === 0 && !i.atendido);

    if (prev > 0 && curr.total > prev && criticaNueva) {
      notification.warning({
        message:     '⚠️ Nuevo aviso crítico',
        description: criticaNueva.descripcion,
        placement:   'bottomRight',
        duration:    10,
      });
    }
    prevTotalRef.current = curr.total;
  }, [query.data]);

  const marcarEventoLeido = useMutation({
    mutationFn: (eventoId: number) => api.post(`/notificaciones-centro/eventos/${eventoId}/leido`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const marcarTodoLeido = useMutation({
    mutationFn: () => api.post('/notificaciones-centro/eventos/marcar-todo-leido'),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const marcarAlertaVista = useMutation({
    mutationFn: (tipo: string) => api.post(`/notificaciones-centro/alertas/${tipo}/visto`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const posponerAlerta = useMutation({
    mutationFn: (tipo: string) => api.post(`/notificaciones-centro/alertas/${tipo}/posponer`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return {
    items:      query.data?.items    ?? [],
    noLeidos:   query.data?.noLeidos ?? 0,
    noVistas:   query.data?.noVistas ?? 0,
    total:      query.data?.total    ?? 0,
    isLoading:  query.isLoading,
    marcarEventoLeido:  (id: number) => marcarEventoLeido.mutate(id),
    marcarTodoLeido:    () => marcarTodoLeido.mutate(),
    marcarAlertaVista:  (tipo: string) => marcarAlertaVista.mutate(tipo),
    posponerAlerta:     (tipo: string) => posponerAlerta.mutate(tipo),
  };
}
