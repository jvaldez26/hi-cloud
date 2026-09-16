import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, message, Popconfirm, Typography,
} from 'antd';
import { PlusOutlined, StopOutlined } from '@ant-design/icons';
import api from '../../api/client';

const { Title, Text } = Typography;

const TIPO_OPTS = [
  { value: 'diario',  label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensual', label: 'Mensual' },
];

function useEdList(path: string, params?: any) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });
}

// ── Modal crear plan ─────────────────────────────────────────────────────────

function PlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const { data: estudiantes = [] } = useEdList('estudiantes', undefined);

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/comedor/planes', vals),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['educativo', 'comedor/planes'] });
      const cargos = res.data?.data?.cargosGenerados ?? res.data?.cargosGenerados;
      const motivo = res.data?.data?.motivo ?? res.data?.motivo;
      message.success(motivo ?? `Plan creado — ${cargos} cargo(s) de comedor generado(s)`);
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear el plan'),
  });

  return (
    <Modal
      open={open}
      title="Nuevo plan de comedor"
      onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending}
      width={520}
      destroyOnClose
      afterOpenChange={v => { if (!v) form.resetFields(); }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
          <Select showSearch
            filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
            options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}` }))}
          />
        </Form.Item>
        <Form.Item name="tipo" label="Tipo de plan" rules={[{ required: true }]}>
          <Select options={TIPO_OPTS} />
        </Form.Item>
        <Form.Item name="costoMensual" label="Costo mensual" rules={[{ required: true }]}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="restriccionesAlimenticias" label="Restricciones alimenticias">
          <Input.TextArea rows={2} placeholder="Ej: alergia al maní, dieta sin gluten…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ComedorPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const { data = [], isLoading } = useEdList('comedor/planes');

  const bajaMut = useMutation({
    mutationFn: (id: number) => api.post(`/educativo/comedor/planes/${id}/dar-de-baja`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['educativo', 'comedor/planes'] });
      const anulados = res.data?.data?.cargosAnulados ?? res.data?.cargosAnulados ?? 0;
      message.success(`Plan dado de baja — ${anulados} cargo(s) futuro(s) sin pagar anulado(s)`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Title level={4} style={{ margin: 0 }}>Comedor</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Nuevo plan
        </Button>
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Al crear un plan se generan sus cargos de comedor del resto del año escolar activo,
        por el mismo motor que colegiatura y transporte. Las becas no aplican a comedor.
      </Text>

      <Table dataSource={data} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showTotal: t => `${t} planes` }}
        columns={[
          { title: 'Estudiante', dataIndex: 'estudianteNombre' },
          { title: 'Tipo', dataIndex: 'tipo', render: (v: string) => <Tag>{TIPO_OPTS.find(o => o.value === v)?.label ?? v}</Tag> },
          { title: 'Costo mensual', dataIndex: 'costoMensual', render: (v: any) => v == null ? '—' : `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
          { title: 'Restricciones', dataIndex: 'restriccionesAlimenticias', ellipsis: true, render: (v: any) => v ?? '—' },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag> },
          {
            title: '', key: 'a',
            render: (_: any, r: any) => r.isActive && (
              <Popconfirm title="¿Dar de baja este plan? Se anulan sus cargos futuros sin pagar." onConfirm={() => bajaMut.mutate(r.id)}>
                <Button size="small" danger icon={<StopOutlined />}>Dar de baja</Button>
              </Popconfirm>
            ),
          },
        ]}
      />

      <PlanModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
