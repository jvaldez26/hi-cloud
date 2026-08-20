import { useState } from 'react';
import { Table, Card, Row, Col, Typography, Statistic, Tag, Select,
         Button, Space, Modal, Form, Input, message, Drawer } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { demoApi } from '../../api/demo.api';
import { fmt } from '../../utils/formatters';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

const estadoColor: Record<string, string> = {
  nuevo:         'blue',
  contactado:    'orange',
  demo_agendada: 'cyan',
  convertido:    'green',
  descartado:    'red',
};

const estadoEmoji: Record<string, string> = {
  nuevo:         '🆕',
  contactado:    '📞',
  demo_agendada: '📅',
  convertido:    '✅',
  descartado:    '❌',
};

export default function DemoRequestsPage() {
  const [page,   setPage]   = useState(1);
  const [estado, setEstado] = useState<string | undefined>();
  const [detail, setDetail] = useState<any>(null);
  const [form]              = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['demo-requests', page, estado],
    queryFn:  () => demoApi.listar(page, estado),
  });

  const { data: stats } = useQuery({
    queryKey: ['demo-stats'],
    queryFn:  demoApi.estadisticas,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => demoApi.actualizarEstado(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demo-requests'] });
      qc.invalidateQueries({ queryKey: ['demo-stats'] });
      setDetail(null);
      message.success('Solicitud actualizada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.message ?? 'Error al actualizar la solicitud'),
  });

  const cols = [
    { title: 'Fecha',   dataIndex: 'createdAt',   width: 110, render: (v: string) => fmt.date(v) },
    { title: 'Nombre',  dataIndex: 'nombre',       ellipsis: true },
    { title: 'Empresa', dataIndex: 'empresa',      ellipsis: true },
    { title: 'Email',   dataIndex: 'email',        ellipsis: true },
    { title: 'Teléfono',dataIndex: 'telefono',     width: 120 },
    { title: 'País',    dataIndex: 'pais',         width: 110 },
    { title: 'Tamaño',  dataIndex: 'tamanoEmpresa',width: 80 },
    { title: 'Estado',  dataIndex: 'estado',       width: 140,
      render: (v: string) => <Tag color={estadoColor[v]}>{estadoEmoji[v]} {v.replace('_',' ').toUpperCase()}</Tag> },
    { title: '', key: 'actions', width: 80,
      render: (_: any, r: any) => (
        <Button size="small" onClick={() => { setDetail(r); form.setFieldsValue(r); }}>
          Gestionar
        </Button>
      )},
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Pipeline de Demos — HiCloud ERP</Title>

      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Total solicitudes" value={stats?.total ?? 0}
              valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Recibidas hoy" value={stats?.hoy ?? 0}
              valueStyle={{ color: '#10b981' }} />
          </Card>
        </Col>
        {(stats?.porEstado ?? []).map((s: any) => (
          <Col xs={12} sm={3} key={s.estado}>
            <motion.div whileHover={{ y: -2 }}>
              <Card size="small">
                <Statistic title={`${estadoEmoji[s.estado] ?? ''} ${s.estado}`}
                  value={s.cantidad}
                  valueStyle={{ color: estadoColor[s.estado] ? `var(--ant-color-${estadoColor[s.estado]})` : undefined, fontSize: 18 }} />
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      <Card extra={
        <Select placeholder="Filtrar estado" allowClear style={{ width: 200 }}
          value={estado} onChange={(v) => { setEstado(v); setPage(1); }}
          options={Object.keys(estadoColor).map(k => ({
            value: k, label: `${estadoEmoji[k]} ${k.replace('_',' ').toUpperCase()}`,
          }))} />
      }>
        <Table columns={cols} dataSource={data?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
          pagination={{ total: data?.meta?.total, pageSize: 10, current: page,
                        onChange: setPage, showSizeChanger: false,
                        showTotal: t => `${t} solicitudes` }} 
        scroll={{ x: 'max-content' }} />
      </Card>

      {/* Drawer de gestión */}
      <Drawer title={`Solicitud de ${detail?.nombre}`} open={!!detail}
        onClose={() => setDetail(null)} width={500}>
        {detail && (
          <>
            <Row gutter={[12, 0]} style={{ marginBottom: 20 }}>
              {[
                ['Empresa',  detail.empresa],
                ['Email',    detail.email],
                ['Teléfono', detail.telefono],
                ['País',     detail.pais],
                ['Tamaño',   detail.tamanoEmpresa + ' empleados'],
              ].map(([label, value]) => (
                <Col span={12} key={label} style={{ marginBottom: 10 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{label}</Text>
                  <Text strong style={{ fontSize: 13 }}>{value}</Text>
                </Col>
              ))}
              {detail.modulosInteres?.length > 0 && (
                <Col span={24} style={{ marginBottom: 10 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Módulos de interés</Text>
                  <div style={{ marginTop: 4 }}>
                    {detail.modulosInteres.map((m: string) => (
                      <Tag key={m} style={{ marginBottom: 4, fontSize: 11 }}>{m}</Tag>
                    ))}
                  </div>
                </Col>
              )}
              {detail.mensaje && (
                <Col span={24}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Mensaje</Text>
                  <Text style={{ fontSize: 13 }}>{detail.mensaje}</Text>
                </Col>
              )}
            </Row>

            <Form form={form} layout="vertical"
              onFinish={(v) => updateMut.mutate({ id: detail.id, body: v })}>
              <Form.Item name="estado" label="Estado del pipeline">
                <Select options={Object.keys(estadoColor).map(k => ({
                  value: k, label: `${estadoEmoji[k]} ${k.replace('_',' ').toUpperCase()}`,
                }))} />
              </Form.Item>
              <Form.Item name="asignadoA" label="Asignado a">
                <Input placeholder="Nombre del ejecutivo de ventas" />
              </Form.Item>
              <Form.Item name="notasInternas" label="Notas internas">
                <Input.TextArea rows={3} placeholder="Observaciones del equipo de ventas..." />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={updateMut.isPending}>
                Guardar cambios
              </Button>
            </Form>
          </>
        )}
      </Drawer>
    </div>
  );
}

