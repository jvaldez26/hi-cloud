import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notification, Button, Typography } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import api from '../api/client';

const { Text } = Typography;

// Mismo TTL que TTL_SOLICITUD_MS en autorizacion-remota.service.ts (backend)
// — ahí es la fuente real de verdad (el backend expira el token), esto solo
// calcula la cuenta regresiva del toast a partir de `fecha` (createdAt del
// evento, el mismo instante en que se creó la solicitud).
const TTL_SOLICITUD_REMOTA_MS = 3 * 60_000;

function useCountdownMs(expiraEn: number): number {
  const [restante, setRestante] = useState(() => Math.max(0, expiraEn - Date.now()));
  useEffect(() => {
    setRestante(Math.max(0, expiraEn - Date.now()));
    const id = setInterval(() => setRestante(Math.max(0, expiraEn - Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiraEn]);
  return restante;
}

/**
 * Cuerpo del toast de "autorización solicitada" — countdown en vivo y un
 * único botón ("Ver y responder") que lleva al detalle; aprobar/rechazar
 * SOLO se hace ahí (SolicitudesAutorizacionPage), nunca desde el toast, para
 * que el supervisor vea el contexto completo antes de decidir.
 */
export function AvisoAutorizacionRemota({ item, onVer }: { item: ItemCentro; onVer: () => void }) {
  const expiraEn = new Date(item.fecha).getTime() + TTL_SOLICITUD_REMOTA_MS;
  const restanteMs = useCountdownMs(expiraEn);
  const segs = Math.floor(restanteMs / 1000);
  return (
    <div>
      <Text>{item.descripcion}</Text>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text type={segs <= 30 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
          <ClockCircleOutlined /> {restanteMs > 0
            ? `Vence en ${Math.floor(segs / 60)}:${String(segs % 60).padStart(2, '0')}`
            : 'Vencida'}
        </Text>
        <Button size="small" type="primary" onClick={onVer}>Ver y responder</Button>
      </div>
    </div>
  );
}

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
  const navigate = useNavigate();
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
      // El título/descripción YA son específicos del aviso (asunto/mensaje
      // que arma el backend para cada tipo — ver notificaciones-centro.service.ts
      // y, para autorización remota, autorizacion-remota.service.ts). Antes
      // este toast los pisaba con "⚠️ Nuevo aviso crítico" para CUALQUIER
      // tipo, perdiendo toda la información específica que sí se veía en la
      // lista completa de /notificaciones.
      if (criticaNueva.tipo === 'autorizacion_remota_solicitada') {
        const key = `aviso-${criticaNueva.id}`;
        notification.warning({
          key,
          message:     criticaNueva.titulo,
          description: <AvisoAutorizacionRemota item={criticaNueva} onVer={() => { navigate(criticaNueva.ruta); notification.destroy(key); }} />,
          placement:   'bottomRight',
          duration:    0, // accionable — el supervisor lo cierra al decidir o expira sola
        });
      } else {
        notification.warning({
          message:     criticaNueva.titulo,
          description: criticaNueva.descripcion,
          placement:   'bottomRight',
          duration:    10,
        });
      }
    }
    prevTotalRef.current = curr.total;
  }, [query.data, navigate]);

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
