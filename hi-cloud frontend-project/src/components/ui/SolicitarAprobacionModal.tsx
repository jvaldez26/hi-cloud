import { Modal, Form, Input, Tag, Space, Typography, Divider } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { aprobacionesApi } from '../../api/aprobaciones.api';

const { Text } = Typography;

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  cotizacion:  { label: 'Cotización',   color: 'blue'   },
  pre_factura: { label: 'Pre-Factura',  color: 'cyan'   },
  compra:      { label: 'Compra',       color: 'purple' },
  gasto:       { label: 'Gasto',        color: 'orange' },
  nota_debito: { label: 'Nota Débito',  color: 'gold'   },
  otro:        { label: 'Otro',         color: 'default' },
};

const fmtMoney = (v?: number) =>
  v != null && v > 0
    ? new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v)
    : null;

interface Props {
  open:       boolean;
  onClose:    () => void;
  tipo:       string;
  entidadId:  number;
  entidadRef: string;
  monto?:     number;
}

export function SolicitarAprobacionModal({ open, onClose, tipo, entidadId, entidadRef, monto }: Props) {
  const [form] = Form.useForm();
  const qc     = useQueryClient();
  const info   = TIPO_LABELS[tipo] ?? { label: tipo, color: 'default' };
  const montoFmt = fmtMoney(monto);

  const solicitar = useMutation({
    mutationFn: (comentario?: string) =>
      aprobacionesApi.solicitar({
        tipo,
        entidadId,
        entidadRef,
        monto,
        comentarioSolicitud: comentario,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprobaciones'] });
      qc.invalidateQueries({ queryKey: ['aprobaciones-resumen'] });
      form.resetFields();
      onClose();
      message.success('✅ Solicitud de aprobación enviada');
    },
    onError: (e: any) =>
      message.error(
        e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al solicitar aprobación',
        5,
      ),
  });

  const handleCancel = () => { form.resetFields(); onClose(); };

  return (
    <Modal
      title={<><CheckCircleOutlined style={{ color: '#1677ff', marginRight: 8 }} />Solicitar Aprobación</>}
      open={open}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      confirmLoading={solicitar.isPending}
      okText="Enviar Solicitud"
      cancelText="Cancelar"
      destroyOnClose
      width={460}
    >
      {/* Resumen del documento */}
      <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
        <Space size="large">
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Tipo</Text>
            <Tag color={info.color} style={{ marginTop: 2 }}>{info.label}</Tag>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Referencia</Text>
            <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{entidadRef}</Text>
          </div>
          {montoFmt && (
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Monto</Text>
              <Text strong style={{ fontSize: 15, color: '#1677ff' }}>{montoFmt}</Text>
            </div>
          )}
        </Space>
      </div>

      <Form form={form} layout="vertical" onFinish={v => solicitar.mutate(v.comentario)}>
        <Form.Item name="comentario" label="Motivo de la solicitud (opcional)">
          <Input.TextArea
            rows={3}
            placeholder="Describe por qué este documento requiere aprobación..."
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
