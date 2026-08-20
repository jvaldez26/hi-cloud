import { useState } from 'react';
import { Table, Card, Row, Col, Typography, Statistic, Tag, Button,
         Select, Modal, Form, InputNumber, Input, Space, message, Popconfirm, Tabs, Badge } from 'antd';
import { PauseCircleOutlined, UpCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { suscripcionesApi } from '../../api/suscripciones.api';
import { demoApi } from '../../api/demo.api';
import { fmt } from '../../utils/formatters';
import CobrosPage from '../super-admin/CobrosPage';

const { Title, Text } = Typography;

const PLAN_CONFIG: Record<string, { color: string; label: string }> = {
  emprendedor: { color: 'blue',    label: '🚀 Emprendedor' },
  pyme:        { color: 'green',   label: '🏢 Pyme'        },
  pro:         { color: 'purple',  label: '⚡ Pro'          },
  plus:        { color: 'gold',    label: '👑 Plus'         },
  trial:       { color: 'orange',  label: '🎁 Trial'        },
  basico:      { color: 'default', label: '⭐ Básico'       },
  profesional: { color: 'blue',    label: '🚀 Profesional'  },
  empresarial: { color: 'purple',  label: '👑 Empresarial'  },
};

const ESTADO_COLOR: Record<string, string> = {
  activa: 'green', vencida: 'red', suspendida: 'orange', cancelada: 'default', prueba: 'cyan',
};

export default function SuperAdminPage() {
  const [openActivar, setOpenActivar] = useState<number | null>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: suscripciones, isLoading } = useQuery({
    queryKey: ['todas-suscripciones'], queryFn: suscripcionesApi.listarTodas,
  });

  const { data: stats }  = useQuery({ queryKey: ['sus-stats'], queryFn: suscripcionesApi.estadisticas });
  const { data: demos }  = useQuery({ queryKey: ['demo-stats'], queryFn: demoApi.estadisticas });

  const activarMut = useMutation({
    mutationFn: ({ id, plan, meses, notas }: any) =>
      suscripcionesApi.activar(id, plan, meses, notas),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['todas-suscripciones'] }); setOpenActivar(null); message.success('Plan actualizado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.message ?? 'Error al activar el plan'),
  });

  const suspenderMut = useMutation({
    mutationFn: suscripcionesApi.suspender,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['todas-suscripciones'] }); message.success('Suscripción suspendida'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.message ?? 'Error al suspender el plan'),
  });

  const planColor = (plan: string) => PLAN_CONFIG[plan]?.color ?? 'default';
  const planLabel = (plan: string) => PLAN_CONFIG[plan]?.label ?? plan;

  const cols = [
    { title: 'Empresa ID', dataIndex: 'empresaId', width: 90 },
    { title: 'Plan', dataIndex: 'plan', width: 130,
      render: (v: string) => <Tag color={planColor(v)}>{planLabel(v)}</Tag> },
    { title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{v?.toUpperCase()}</Tag> },
    { title: 'Días Restantes', key: 'dias', width: 120,
      render: (_: any, r: any) => {
        const d = r.diasRestantes as number;
        return <Text style={{ color: d <= 5 ? '#ef4444' : d <= 15 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{d} días</Text>;
      }},
    { title: 'Vencimiento', dataIndex: 'fechaVencimiento', width: 120,
      render: (v: string) => fmt.date(v) },
    { title: 'Notas', dataIndex: 'notasAdmin', ellipsis: true,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: '', key: 'actions', width: 130,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<UpCircleOutlined />}
            onClick={() => { setOpenActivar(r.empresaId); form.setFieldsValue({ plan: r.plan, meses: 1 }); }}>
            Activar
          </Button>
          {r.estado === 'activa' && (
            <Popconfirm title="¿Suspender?" onConfirm={() => suspenderMut.mutate(r.empresaId)}>
              <Button size="small" danger icon={<PauseCircleOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )},
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Super Admin — Panel HiCloud</Title>

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Empresas registradas" value={stats?.totales ?? 0} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Suscripciones activas" value={stats?.activas ?? 0} valueStyle={{ color: '#10b981' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Demos solicitadas" value={demos?.total ?? 0} valueStyle={{ color: '#7c3aed' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Demos hoy" value={demos?.hoy ?? 0} valueStyle={{ color: '#f59e0b' }} /></Card>
        </Col>
      </Row>

      {/* Distribution por plan */}
      {stats?.porPlan?.length > 0 && (
        <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
          {stats.porPlan.map((p: any, i: number) => (
            <Col key={i}>
              <motion.div whileHover={{ y: -2 }}>
                <Tag color={planColor(p.plan)} style={{ padding: '4px 12px', fontSize: 13 }}>
                  {planLabel(p.plan)} — {p.cantidad} empresas ({p.estado})
                </Tag>
              </motion.div>
            </Col>
          ))}
        </Row>
      )}

      {/* Tabs: Suscripciones + Cobros */}
      <Tabs
        defaultActiveKey="suscripciones"
        items={[
          {
            key: 'suscripciones',
            label: '📋 Suscripciones',
            children: (
              <Card>
                <Table columns={cols} dataSource={suscripciones ?? []} rowKey="id"
                  loading={isLoading} size="small"
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 'max-content' }} />
              </Card>
            ),
          },
          {
            key: 'cobros',
            label: (
              <span><DollarOutlined /> 💰 Cobros</span>
            ),
            children: <CobrosPage />,
          },
        ]}
      />

      {/* Modal activar plan */}
      <Modal title={`Activar plan — Empresa #${openActivar}`}
        open={!!openActivar} onCancel={() => setOpenActivar(null)} footer={null}>
        <Form form={form} layout="vertical"
          onFinish={(v) => activarMut.mutate({ id: openActivar, ...v })}>
          <Form.Item name="plan" label="Plan" rules={[{ required: true }]}>
            <Select options={['emprendedor','pyme','pro','plus','trial','basico','profesional','empresarial']
              .map(p => ({ value: p, label: planLabel(p) }))} />
          </Form.Item>
          <Form.Item name="meses" label="Duración (meses)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={1} max={36} />
          </Form.Item>
          <Form.Item name="notas" label="Notas internas">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenActivar(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={activarMut.isPending}>Activar plan</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

