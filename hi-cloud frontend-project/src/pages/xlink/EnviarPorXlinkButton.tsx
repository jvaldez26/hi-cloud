import { Button, message, Tooltip } from 'antd';
import { SendOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { xlinkApi, XlinkTipoDocumento } from '../../api/xlink.api';

interface Props {
  tipoDocumento: XlinkTipoDocumento;
  documentoId: number;
  onEnviado?: () => void;
}

/**
 * Botón "Enviar por HiCloud Xlink" reutilizable — un solo documento
 * (POST /xlink/publicar con un array de un elemento). El backend
 * (/xlink/publicar) es la barrera real; este botón solo evita mostrarse
 * habilitado cuando es obviamente inútil.
 *
 * El motivo/elegibilidad sale SIEMPRE de GET /xlink/estado (vía
 * XlinkElegibilidadService — única fuente de verdad, reutilizada también
 * por la columna Xlink y el envío masivo de los listados) — nunca una
 * heurística propia de este componente. Antes cada caller armaba su propia
 * condición ad-hoc (ej. FacturaDetailPage solo miraba tipoPago==='CREDITO'
 * y ocultaba el botón entero si la factura estaba cancelada, violando la
 * regla de "nunca oculto sin explicación").
 */
export default function EnviarPorXlinkButton({ tipoDocumento, documentoId, onEnviado }: Props) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['xlink-estado', tipoDocumento, documentoId],
    queryFn: () => xlinkApi.estado(tipoDocumento, [documentoId]).then(r => r[0]),
  });

  const mut = useMutation({
    mutationFn: () => xlinkApi.publicar(tipoDocumento, [documentoId]),
    onSuccess: (resultados) => {
      const r = resultados[0];
      if (r?.ok) {
        message.success('Enviado por HiCloud Xlink');
        qc.invalidateQueries({ queryKey: ['xlink-enviados'] });
        qc.invalidateQueries({ queryKey: ['xlink-estado', tipoDocumento, documentoId] });
        onEnviado?.();
      } else {
        message.error(r?.error ?? 'No se pudo enviar');
      }
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo enviar por HiCloud Xlink'),
  });

  if (isLoading || !data) {
    return <Button icon={<SendOutlined />} disabled loading={isLoading}>Enviar por HiCloud Xlink</Button>;
  }

  if (data.yaEnviado) {
    return (
      <Tooltip title={`Ya se envió — estado: ${data.estadoReceptor ?? 'pendiente'}${data.numeroGenerado ? ` (generó ${data.numeroGenerado})` : ''}`}>
        <Button icon={<CheckCircleOutlined />} disabled>Ya enviado</Button>
      </Tooltip>
    );
  }

  if (!data.elegible) {
    return (
      <Tooltip title={data.motivo ?? 'No elegible para HiCloud Xlink'}>
        <span>
          <Button icon={<SendOutlined />} disabled>Enviar por HiCloud Xlink</Button>
        </span>
      </Tooltip>
    );
  }

  return (
    <Button icon={<SendOutlined />} loading={mut.isPending} onClick={() => mut.mutate()}>
      Enviar por HiCloud Xlink
    </Button>
  );
}
