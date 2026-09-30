import { Button, message, Tooltip } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { xlinkApi, XlinkTipoDocumento } from '../../api/xlink.api';

interface Props {
  tipoDocumento: XlinkTipoDocumento;
  documentoId: number;
  /** Heurística de UX — el backend es el que de verdad valida (a crédito, e-CF aceptado, vínculo, cuadre). */
  elegible: boolean;
  motivoNoElegible?: string;
  onEnviado?: () => void;
}

/**
 * Botón "Enviar por HiCloud Xlink" reutilizable — un solo documento
 * (POST /xlink/publicar con un array de un elemento). El backend es la
 * barrera real; este botón solo evita mostrarse cuando es obviamente
 * inútil (no es a crédito, ya está anulado, etc.).
 */
export default function EnviarPorXlinkButton({ tipoDocumento, documentoId, elegible, motivoNoElegible, onEnviado }: Props) {
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => xlinkApi.publicar(tipoDocumento, [documentoId]),
    onSuccess: (resultados) => {
      const r = resultados[0];
      if (r?.ok) {
        message.success('Enviado por HiCloud Xlink');
        qc.invalidateQueries({ queryKey: ['xlink-enviados'] });
        onEnviado?.();
      } else {
        message.error(r?.error ?? 'No se pudo enviar');
      }
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo enviar por HiCloud Xlink'),
  });

  if (!elegible) {
    return (
      <Tooltip title={motivoNoElegible ?? 'No elegible para HiCloud Xlink'}>
        <Button icon={<SendOutlined />} disabled>Enviar por HiCloud Xlink</Button>
      </Tooltip>
    );
  }

  return (
    <Button icon={<SendOutlined />} loading={mut.isPending} onClick={() => mut.mutate()}>
      Enviar por HiCloud Xlink
    </Button>
  );
}
