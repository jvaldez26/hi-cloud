import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

/**
 * true = esta empresa es nueva (< 30 días, ver ReportesService.getModoEjemplo
 * en el backend) y todavía no tiene NINGÚN movimiento real — sus widgets del
 * dashboard muestran datos de ejemplo en vez del estado vacío accionable.
 *
 * UNA sola consulta compartida por TODOS los widgets (misma queryKey,
 * cacheada 5 min): así el panel entero decide junto, de una vez, en vez de
 * que cada gráfica pregunte por su cuenta y puedan discrepar entre sí sobre
 * si esta empresa "ya opera" o no.
 *
 * El criterio de "cero movimientos" es histórico completo, no acotado al
 * rango de un widget — lo decide el backend, no aquí (ver el comentario en
 * ReportesService.getModoEjemplo): una empresa YA establecida con un mes
 * flojo nunca debe volver a ver "datos de ejemplo".
 */
export function useModoEjemplo(): boolean {
  const { data } = useQuery<{ activo: boolean }>({
    queryKey: ['modo-ejemplo'],
    queryFn:  () => api.get('/reportes/dashboard/modo-ejemplo').then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });
  return data?.activo === true;
}
