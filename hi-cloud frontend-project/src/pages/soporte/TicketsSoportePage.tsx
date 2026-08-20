import { useState } from 'react';
import {
  Table, Tag, Button, Modal, Form, Select, Input, Space,
  Typography, Badge, Tooltip, Divider, Row, Col,
} from 'antd';
import {
  CustomerServiceOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ── Helpers de presentación ───────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  abierto:    { color: 'red',    label: 'Abierto',     icon: <ExclamationCircleOutlined /> },
  en_proceso: { color: 'orange', label: 'En proceso',  icon: <ClockCircleOutlined /> },
  resuelto:   { color: 'green',  label: 'Resuelto',    icon: <CheckCircleOutlined /> },
  cerrado:    { color: 'default',label: 'Cerrado',     icon: <CheckCircleOutlined /> },
};

const PRIORIDAD_COLOR: Record<string, string> = {
  alta: 'red', media: 'orange', baja: 'blue',
};

const CATEGORIA_LABEL: Record<string, string> = {
  soporte_tecnico: '🔧 Soporte Técnico',
  facturacion:     '💰 Facturación',
  devolucion:      '↩️ Devolución',
  consulta:        '❓ Consulta',
  otro:            '📋 Otro',
};

// ── Página principal ──────────────────────────────────────────────────────────

export default function TicketsSoportePage() {
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>();
  const [ticketActivo, setTicketActivo] = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery<any[]>({
    queryKey: ['admin-tickets', filtroEstado],
    queryFn: () =>
      api.get('/portal/admin/tickets').then(r => {
        const list = r.data?.data ?? r.data ?? [];
        return filtroEstado ? list.filter((t: any) => t.estado === filtroEstado) : list;
      }),
    staleTime: 30_000,
  });

  const responderMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      api.patch(`/portal/admin/tickets/${id}/responder`, body).then(r => r.data?.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      setTicketActivo(null);
      form.resetFields();
    },
  });

  const pendientes = tickets.filter(t => t.estado === 'abierto' || t.estado === 'en_proceso').length;

  const columns = [
    {
      title: '#', dataIndex: 'id', width: 60,
      render: (v: number) => <Text type="secondary" style={{ fontSize: 12 }}>#{v}</Text>,
    },
    {
      title: 'Cliente', dataIndex: 'clienteNombre', ellipsis: true,
      render: (v: string) => <Text strong>{v ?? '—'}</Text>,
    },
    {
      title: 'Asunto', dataIndex: 'asunto', ellipsis: true,
      render: (v: string, r: any) => (
        <Button type="link" style={{ padding: 0, height: 'auto', textAlign: 'left' }}
          onClick={() => { setTicketActivo(r); form.setFieldsValue({ estado: r.estado, respuesta: r.respuesta ?? '' }); }}>
          {v}
        </Button>
      ),
    },
    {
      title: 'Categoría', dataIndex: 'categoria', width: 150,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{CATEGORIA_LABEL[v] ?? v}</Text>,
    },
    {
      title: 'Prioridad', dataIndex: 'prioridad', width: 100,
      render: (v: string) => <Tag color={PRIORIDAD_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
    },
    {
      title: 'Estado', dataIndex: 'estado', width: 120,
      render: (v: string) => {
        const cfg = ESTADO_CONFIG[v] ?? { color: 'default', label: v };
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
      },
    },
    {
      title: 'Fecha', dataIndex: 'createdAt', width: 110,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{dayjs(v).format('DD/MM/YY HH:mm')}</Text>,
    },
    {
      title: '', width: 90,
      render: (_: any, r: any) => (
        <Button size="small" type={r.estado === 'abierto' ? 'primary' : 'default'}
          onClick={() => { setTicketActivo(r); form.setFieldsValue({ estado: r.estado, respuesta: r.respuesta ?? '' }); }}>
          {r.respuesta ? 'Ver' : 'Responder'}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space align="center">
            <Title level={3} style={{ margin: 0 }}>
              <CustomerServiceOutlined style={{ marginRight: 8 }} />
              Tickets de Soporte
            </Title>
            {pendientes > 0 && (
              <Badge count={pendientes} style={{ backgroundColor: '#ef4444' }} />
            )}
          </Space>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Tickets enviados por clientes desde el portal
            </Text>
          </div>
        </Col>
        <Col>
          <Select placeholder="Filtrar por estado" allowClear value={filtroEstado}
            onChange={setFiltroEstado} style={{ width: 160 }}>
            <Select.Option value="abierto">🔴 Abiertos</Select.Option>
            <Select.Option value="en_proceso">🟡 En proceso</Select.Option>
            <Select.Option value="resuelto">🟢 Resueltos</Select.Option>
            <Select.Option value="cerrado">⚪ Cerrados</Select.Option>
          </Select>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={tickets}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        rowClassName={(r: any) => r.estado === 'abierto' ? 'ant-table-row-danger' : ''}
        pagination={{ pageSize: 10, showTotal: t => `${t} tickets`, showSizeChanger: false }}
      />

      {/* Modal de respuesta */}
      <Modal
        title={
          <Space>
            <CustomerServiceOutlined />
            <span>Ticket #{ticketActivo?.id} — {ticketActivo?.clienteNombre}</span>
            {ticketActivo && (
              <Tag color={ESTADO_CONFIG[ticketActivo.estado]?.color ?? 'default'}>
                {ESTADO_CONFIG[ticketActivo.estado]?.label ?? ticketActivo.estado}
              </Tag>
            )}
          </Space>
        }
        open={!!ticketActivo}
        onCancel={() => { setTicketActivo(null); form.resetFields(); }}
        footer={null}
        width="min(680px, 95vw)"
      >
        {ticketActivo && (
          <>
            {/* Detalle del ticket */}
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size={4}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>CATEGORÍA</Text>
                  <div>{CATEGORIA_LABEL[ticketActivo.categoria] ?? ticketActivo.categoria}</div>
                </Col>
                <Col span={6}>
                  <Text type="secondary" style={{ fontSize: 11 }}>PRIORIDAD</Text>
                  <div><Tag color={PRIORIDAD_COLOR[ticketActivo.prioridad] ?? 'default'}>{ticketActivo.prioridad?.toUpperCase()}</Tag></div>
                </Col>
                <Col span={6}>
                  <Text type="secondary" style={{ fontSize: 11 }}>FECHA</Text>
                  <div style={{ fontSize: 12 }}>{dayjs(ticketActivo.createdAt).format('DD/MM/YYYY HH:mm')}</div>
                </Col>
              </Row>
              <Divider style={{ margin: '10px 0' }} />
              <Text type="secondary" style={{ fontSize: 11 }}>ASUNTO</Text>
              <Text strong style={{ fontSize: 15 }}>{ticketActivo.asunto}</Text>
              <Divider style={{ margin: '6px 0' }} />
              <Text type="secondary" style={{ fontSize: 11 }}>DESCRIPCIÓN DEL CLIENTE</Text>
              <Paragraph style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: 0 }}>
                {ticketActivo.descripcion}
              </Paragraph>
            </Space>

            {/* Formulario de respuesta */}
            <Form form={form} layout="vertical"
              onFinish={values => responderMut.mutate({ id: ticketActivo.id, body: values })}>
              <Form.Item name="respuesta" label="Tu respuesta"
                rules={[{ required: true, message: 'Escribe una respuesta' }]}>
                <TextArea rows={4} placeholder="Escribe la respuesta para el cliente..." />
              </Form.Item>
              <Row gutter={12}>
                <Col flex="auto">
                  <Form.Item name="estado" label="Cambiar estado" initialValue={ticketActivo.estado}>
                    <Select>
                      <Select.Option value="en_proceso">🟡 En proceso</Select.Option>
                      <Select.Option value="resuelto">🟢 Resuelto</Select.Option>
                      <Select.Option value="cerrado">⚪ Cerrado</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col>
                  <Form.Item label=" ">
                    <Button type="primary" htmlType="submit" loading={responderMut.isPending}>
                      Enviar respuesta
                    </Button>
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            {/* Respuesta anterior si existe */}
            {ticketActivo.respuesta && (
              <>
                <Divider />
                <Text type="secondary" style={{ fontSize: 11 }}>RESPUESTA ANTERIOR</Text>
                <Paragraph style={{ whiteSpace: 'pre-wrap', background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', marginTop: 4 }}>
                  {ticketActivo.respuesta}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {ticketActivo.fechaRespuesta ? dayjs(ticketActivo.fechaRespuesta).format('DD/MM/YYYY HH:mm') : ''}
                </Text>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

