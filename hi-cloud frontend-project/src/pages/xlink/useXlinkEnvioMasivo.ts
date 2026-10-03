import { useState } from 'react';
import { message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { xlinkApi, XlinkTipoDocumento, EstadoXlinkItem } from '../../api/xlink.api';

/**
 * Selección + envío en lote, compartido por los 3 listados (facturas/NC/OC)
 * — "Se marcan todos y se envían de una vez, con un contador que va
 * mostrando cuántos salieron bien y cuántos tuvieron problemas" (Fase 2a).
 * `queryKeysInvalidar`: las queryKeys de la LISTA del caller (para
 * refrescar folio/estado tras enviar) — useXlinkEstados ya se invalida
 * siempre, sin que el caller tenga que acordarse.
 */
export function useXlinkEnvioMasivo(tipoDocumento: XlinkTipoDocumento, queryKeysInvalidar: unknown[][] = []) {
  const qc = useQueryClient();
  const [seleccionados, setSeleccionados] = useState<number[]>([]);

  const mut = useMutation({
    mutationFn: (ids: number[]) => xlinkApi.publicar(tipoDocumento, ids),
    onSuccess: (resultados) => {
      const ok = resultados.filter(r => r.ok).length;
      const fallidos = resultados.length - ok;
      if (ok > 0) message.success(`${ok} documento(s) enviado(s) correctamente`);
      if (fallidos > 0) message.warning(`${fallidos} documento(s) con problemas`);
      qc.invalidateQueries({ queryKey: ['xlink-estados', tipoDocumento] });
      qc.invalidateQueries({ queryKey: ['xlink-enviados'] });
      for (const k of queryKeysInvalidar) qc.invalidateQueries({ queryKey: k });
      setSeleccionados([]);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo enviar el lote'),
  });

  /** Para rowSelection.getCheckboxProps — solo se pueden marcar las elegibles y aún no enviadas. */
  const puedeSeleccionar = (id: number, estados: Map<number, EstadoXlinkItem>) => {
    const e = estados.get(id);
    return !!e && e.elegible && !e.yaEnviado;
  };

  return {
    seleccionados, setSeleccionados,
    enviarSeleccionados: () => mut.mutate(seleccionados),
    enviando: mut.isPending,
    puedeSeleccionar,
  };
}
