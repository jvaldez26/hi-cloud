import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Table, Tag, Button, Modal, Form, Input,
  Select, Space, Typography, message,
  Badge, Tabs, theme,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  FileTextOutlined, PlusOutlined,
} from '@ant-design/icons';
import { TableActions } from '../../components/ui/TableActions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  cotizacion:  { label: 'Cotización',   color: 'blue'   },
  pre_factura: { label: 'Pre-Factura',  color: 'cyan'   },
  compra:      { label: 'Compra',       color: 'purple' },
  gasto:       { label: 'Gasto',        color: 'orange' },
  nota_debito: { label: 'Nota Débito',  color: 'gold'   },
  otro:        { label: 'Otro',         color: 'default'},
};

const ESTADO_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pendiente: { color: 'orange', label: 'Pendiente', icon: <ClockCircleOutlined /> },
  aprobado:  { color: 'green',  label: 'Aprobado',  icon: <CheckCircleOutlined /> },
  rechazado: { color: 'red',    label: 'Rechazado', icon: <CloseCircleOutlined /> },
};

export default function AprobacionesPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [tabActiva, setTabActiva]       = useState('pendientes');
  const [modalSolicitud, setModalSolicitud] = useState(false);
  const [modalResolver,  setModalResolver]  = useState<{ id: number; accion: 'aprobar' | 'rechazar' } | null>(null);
  const [formSol] = Form.useForm();
  const [formRes] = Form.useForm();

  const { data: resumen } = useQuery<any>({
    queryKey: ['aprobaciones-resumen'],
    queryFn:  () => api.get('/aprobaciones/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const estadoQuery = tabActiva === 'historial' ? undefined : 'pendiente';

  const { data: aprobaciones, isLoading } = useQuery<any>({
    queryKey: ['aprobaciones', tabActiva],
    queryFn:  () => api.get(`/aprobaciones?limit=50${estadoQuery ? `&estado=${estadoQuery}` : ''}`).then((r: any) => r.data?.data ?? r.data),
  });

  const solicitar = useMutation({
    mutationFn: (dto: any) => api.post('/aprobaciones', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['aprobaciones'] });
      qc.invalidateQueries({ queryKey: ['aprobaciones-resumen'] }); setModalSolicitud(false); formSol.resetFields(); message.success('Solicitud enviada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const resolver = useMutation({
    mutationFn: ({ id, accion, comentario }: { id: number; accion: string; comentario?: string }) =>
      api.patch(`/aprobaciones/${id}/${accion}`, { comentario }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['aprobaciones'] });
      qc.invalidateQueries({ queryKey: ['aprobaciones-resumen'] }); setModalResolver(null); formRes.resetFields(); message.success('Resolución guardada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const items = aprobaciones?.data ?? [];

  const COLS_DEF = [
    { key: 't',   label: 'Tipo',           defaultVisible: true  },
    { key: 'ref', label: 'Ref.',            defaultVisible: false },
    { key: 'm',   label: 'Monto',          defaultVisible: true  },
    { key: 'ns',  label: 'Solicitado por', defaultVisible: true  },
    { key: 'cs',  label: 'Solicitud',      defaultVisible: true  },
    { key: 'e',   label: 'Estado',         defaultVisible: true  },
    { key: 'cr',  label: 'Resolución',     defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('aprobaciones', COLS_DEF);

  const cols = [
    {
      title: 'Tipo', dataIndex: 'tipo', key: 't',
      render: (v: any) => <Tag color={TIPO_LABELS[v]?.color}>{TIPO_LABELS[v]?.label ?? v}</Tag>,
    },
    {
      title: 'Ref.', dataIndex: 'entidadRef', key: 'ref',
      render: (v: any) => v ? <Text strong style={{ fontFamily: 'mono' }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Monto', dataIndex: 'monto', key: 'm', align: 'right' as const,
      render: (v: any) => v ? fmt(v) : <Text type="secondary">—</Text>,
    },
    { title: 'Solicitado por', dataIndex: 'nombreSolicitante', key: 'ns' },
    {
      title: 'Solicitud', dataIndex: 'comentarioSolicitud', key: 'cs',
      render: (v: any) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v.slice(0, 60)}</Text> : '—',
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'e',
      render: (v: any) => {
        const conf = ESTADO_CONFIG[v];
        return <Tag color={conf?.color} icon={conf?.icon}>{conf?.label}</Tag>;
      },
    },
    {
      title: 'Resolución', dataIndex: 'comentarioResolucion', key: 'cr',
      render: (v: any) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v.slice(0, 50)}</Text> : '—',
    },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => r.estado === 'pendiente' ? (
        <TableActions
          items={[
            { key: 'aprobar', label: 'Aprobar', icon: <CheckCircleOutlined />, onClick: () => setModalResolver({ id: r.id, accion: 'aprobar' }) },
            { type: 'divider' as const },
            { key: 'rechazar', label: 'Rechazar', danger: true, icon: <CloseCircleOutlined />, onClick: () => setModalResolver({ id: r.id, accion: 'rechazar' }) },
          ]}
        />
      ) : null,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileTextOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Aprobaciones</Title>
            <Text type="secondary">Flujo de aprobación para cotizaciones, compras y gastos</Text>
          </div>
        </div>
        <Space>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalSolicitud(true)}>
            Nueva Solicitud
          </Button>
        </Space>
      </div>


      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={tabActiva}
          onChange={setTabActiva}
          items={[
            {
              key: 'pendientes',
              label: <Badge count={resumen?.pendientes ?? 0} offset={[6, 0]}><span>Pendientes</span></Badge>,
              children: null,
            },
            { key: 'historial', label: 'Historial completo', children: null },
          ]}
        />

        <Table
          dataSource={items}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          columns={filterColumns(cols)}
        />
      </Card>

      {/* Modal Solicitud */}
      <Modal
        title="Nueva Solicitud de Aprobación"
        open={modalSolicitud}
        onCancel={() => { setModalSolicitud(false); formSol.resetFields(); }}
        onOk={() => formSol.submit()}
        confirmLoading={solicitar.isPending}
        okText="Enviar Solicitud"
        destroyOnClose
      >
        <Form form={formSol} layout="vertical" onFinish={v => solicitar.mutate(v)}>
          <Form.Item name="tipo" label="Tipo de documento" rules={[{ required: true }]}>
            <Select>
              {Object.entries(TIPO_LABELS).map(([k, v]) => (
                <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="entidadId" label="ID del documento" rules={[{ required: true }]}>
                <Input type="number" placeholder="Ej. 42" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="entidadRef" label="Referencia / Folio">
                <Input placeholder="Ej. COT-2026-0001" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="monto" label="Monto (opcional)">
            <Input type="number" placeholder="Ej. 150000" />
          </Form.Item>
          <Form.Item name="comentarioSolicitud" label="Motivo de la solicitud">
            <Input.TextArea rows={3} placeholder="Describe por qué necesita aprobación..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Resolver */}
      <Modal
        title={modalResolver?.accion === 'aprobar' ? '✅ Aprobar Solicitud' : '❌ Rechazar Solicitud'}
        open={!!modalResolver}
        onCancel={() => { setModalResolver(null); formRes.resetFields(); }}
        onOk={() => formRes.submit()}
        confirmLoading={resolver.isPending}
        okText={modalResolver?.accion === 'aprobar' ? 'Confirmar Aprobación' : 'Confirmar Rechazo'}
        okButtonProps={{
          style: modalResolver?.accion === 'aprobar'
            ? { background: token.colorSuccess, borderColor: token.colorSuccess }
            : { background: token.colorError, borderColor: token.colorError },
        }}
        destroyOnClose
      >
        <Form form={formRes} layout="vertical"
          onFinish={v => resolver.mutate({ id: modalResolver!.id, accion: modalResolver!.accion, comentario: v.comentario })}>
          <Form.Item
            name="comentario"
            label="Comentario"
            rules={modalResolver?.accion === 'rechazar' ? [{ required: true, message: 'Indica el motivo del rechazo' }] : []}
          >
            <Input.TextArea rows={3}
              placeholder={modalResolver?.accion === 'aprobar'
                ? 'Observaciones de la aprobación (opcional)...'
                : 'Motivo del rechazo (obligatorio)...'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
