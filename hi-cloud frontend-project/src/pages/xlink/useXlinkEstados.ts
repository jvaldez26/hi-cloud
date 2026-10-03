import { useQuery } from '@tanstack/react-query';
import { xlinkApi, XlinkTipoDocumento, EstadoXlinkItem } from '../../api/xlink.api';

/**
 * Estado Xlink de una página de filas (facturas/NC/OC), en UNA sola
 * consulta — para la columna Xlink, el filtro "Solo pendientes de enviar"
 * y el envío masivo. Reutiliza /xlink/estado (XlinkElegibilidadService),
 * la MISMA fuente que usa EnviarPorXlinkButton para el detalle — nunca una
 * heurística propia por página.
 */
export function useXlinkEstados(tipoDocumento: XlinkTipoDocumento, ids: number[]) {
  const idsOrdenados = [...ids].sort((a, b) => a - b);
  const { data, isFetching } = useQuery({
    queryKey: ['xlink-estados', tipoDocumento, idsOrdenados],
    queryFn: () => xlinkApi.estado(tipoDocumento, idsOrdenados),
    enabled: idsOrdenados.length > 0,
    placeholderData: (prev) => prev,
  });

  const porId = new Map<number, EstadoXlinkItem>((data ?? []).map(e => [e.id, e]));
  return { estados: porId, cargando: isFetching };
}
