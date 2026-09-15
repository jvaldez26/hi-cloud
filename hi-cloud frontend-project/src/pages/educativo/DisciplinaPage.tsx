import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Select, Space, Tag, Modal, Form, Input, DatePicker,
  message, Popconfirm, Row, Col, Typography, Drawer, Descriptions,
} from 'antd';
import { PlusOutlined, EditOutlined, BellOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const QK = (...k: any[]) => ['educativo', 'disciplina', ...k];

export const TIPO_OPTS = [
  { value: 'leve',       label: 'Leve' },
  { value: 'moderado',   label: 'Moderado' },
  { value: 'grave',      label: 'Grave' },
  { value: 'muy_grave',  label: 'Muy grave' },
];
const TIPO_COLOR: Record<string, string> = {
  leve: 'blue', moderado: 'gold', grave: 'volcano', muy_grave: 'red',
};

export const ESTADO_OPTS = [
  { value: 'abierto',        label: 'Abierto' },
  { value: 'en_seguimiento', label: 'En seguimiento' },
  { value: 'cerrado',        label: 'Cerrado' },
];
const ESTADO_COLOR: Record<string, string> = {
  abierto: 'red', en_seguimiento: 'gold', cerrado: 'green',
};

function useEdList(path: string, params?: any, enabled = true) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
    enabled,
  });
}

// ── Modal crear/editar ───────────────────────────────────────────────────────

function IncidenteModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const { data: estudiantes = [] } = useEdList('estudiantes', undefined, open);
  const { data: secciones = [] } = useEdList('secciones', undefined, open);

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/disciplina/${editing.id}`, vals)
      : api.post('/educativo/disciplina', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK() });
      message.success('Guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const onOk = () => form.validateFields().then(vals => {
    if (vals.fecha) vals.fecha = vals.fecha.format('YYYY-MM-DD');
    mut.mutate(vals);
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Editar incidente' : 'Nuevo incidente disciplinario'}
      onCancel={onClose}
      onOk={onOk}
      confirmLoading={mut.isPending}
      width={620}
      destroyOnClose
      afterOpenChange={visible => {
        if (visible && editing) {
          form.setFieldsValue({ ...editing, fecha: editing.fecha ? dayjs(editing.fecha) : undefined });
        } else if (visible) {
          form.setFieldsValue({ fecha: dayjs() });
        } else {
          form.resetFields();
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
              <Select
                showSearch disabled={!!editing}
                filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
                options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}` }))}
                placeholder="Buscar estudiante…"
              />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="seccionId" label="Sección">
              <Select allowClear
                options={secciones.map((s: any) => ({ value: s.id, label: s.nombre }))}
                placeholder="Sección donde ocurrió (opcional)"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
              <Select options={TIPO_OPTS} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="categoria" label="Categoría">
          <Input placeholder="Ej: falta de respeto, agresión física, uso de celular…" />
        </Form.Item>
        <Form.Item name="descripcion" label="Descripción del incidente" rules={[{ required: true }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="medidaTomada" label="Medida tomada">
          <Input.TextArea rows={2} />
        </Form.Item>
        {editing && (
          <Form.Item name="estado" label="Estado">
            <Select options={ESTADO_OPTS} />
          </Form.Item>
        )}
        <Form.Item name="seguimiento" label="Seguimiento">
          <Input.TextArea rows={2} placeholder="Notas de seguimiento del caso" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Detalle (drawer de solo lectura, útil para docentes que no editan) ──────

function DetalleDrawer({ id, onClose, onEdit }: { id: number | null; onClose: () => void; onEdit: (r: any) => void }) {
  const { data: lista = [] } = useEdList('disciplina', undefined, !!id);
  const row = lista.find((r: any) => r.id === id);
  if (!id || !row) return null;

  return (
    <Drawer title={`Incidente — ${row.estudianteNombre}`} width={480} open={!!id} onClose={onClose}
      extra={<Button icon={<EditOutlined />} onClick={() => onEdit(row)}>Editar</Button>}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Fecha">{row.fecha?.substring(0, 10)}</Descriptions.Item>
        <Descriptions.Item label="Sección">{row.seccionNombre ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Tipo">
          <Tag color={TIPO_COLOR[row.tipo]}>{TIPO_OPTS.find(o => o.value === row.tipo)?.label ?? row.tipo}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Categoría">{row.categoria ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Descripción">{row.descripcion}</Descriptions.Item>
        <Descriptions.Item label="Medida tomada">{row.medidaTomada ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Seguimiento">{row.seguimiento ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Reportado por">{row.reportadoPorNombre ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Estado">
          <Tag color={ESTADO_COLOR[row.estado]}>{ESTADO_OPTS.find(o => o.value === row.estado)?.label ?? row.estado}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Padres notificados">
          {row.padresNotificados
            ? `Sí — ${dayjs(row.fechaNotificacion).format('DD/MM/YYYY HH:mm')}`
            : 'No'}
        </Descriptions.Item>
      </Descriptions>
    </Drawer>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DisciplinaPage() {
  const qc = useQueryClient();
  const [filtros, setFiltros] = useState<{ estudianteId?: number; seccionId?: number; tipo?: string; estado?: string }>({});
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const { data: estudiantes = [] } = useEdList('estudiantes');
  const { data: secciones = [] } = useEdList('secciones');
  const { data, isLoading } = useQuery<any[]>({
    queryKey: QK(filtros),
    queryFn: () => api.get('/educativo/disciplina', { params: filtros }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 15_000,
  });

  const notificarMut = useMutation({
    mutationFn: (id: number) => api.post(`/educativo/disciplina/${id}/notificar-padres`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK() }); message.success('Padres marcados como notificados'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Title level={4} style={{ margin: 0 }}>Disciplina</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true })}>
          Nuevo incidente
        </Button>
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Solo ves los incidentes de las secciones que tienes asignadas, salvo que seas administrador.
      </Text>

      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          style={{ width: 220 }} allowClear showSearch placeholder="Estudiante"
          filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
          options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}` }))}
          onChange={v => setFiltros(f => ({ ...f, estudianteId: v }))}
        />
        <Select
          style={{ width: 180 }} allowClear placeholder="Sección"
          options={secciones.map((s: any) => ({ value: s.id, label: s.nombre }))}
          onChange={v => setFiltros(f => ({ ...f, seccionId: v }))}
        />
        <Select
          style={{ width: 140 }} allowClear placeholder="Tipo" options={TIPO_OPTS}
          onChange={v => setFiltros(f => ({ ...f, tipo: v }))}
        />
        <Select
          style={{ width: 160 }} allowClear placeholder="Estado" options={ESTADO_OPTS}
          onChange={v => setFiltros(f => ({ ...f, estado: v }))}
        />
      </Space>

      <Table
        dataSource={data ?? []}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showTotal: t => `${t} incidentes` }}
        onRow={r => ({ onClick: () => setDetalleId(r.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Fecha', dataIndex: 'fecha', width: 100, render: (v: any) => v?.substring(0, 10) },
          { title: 'Estudiante', dataIndex: 'estudianteNombre' },
          { title: 'Sección', dataIndex: 'seccionNombre', render: (v: any) => v ?? '—' },
          {
            title: 'Tipo', dataIndex: 'tipo', width: 110,
            render: (v: string) => <Tag color={TIPO_COLOR[v]}>{TIPO_OPTS.find(o => o.value === v)?.label ?? v}</Tag>,
          },
          { title: 'Categoría', dataIndex: 'categoria', render: (v: any) => v ?? '—' },
          {
            title: 'Estado', dataIndex: 'estado', width: 130,
            render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{ESTADO_OPTS.find(o => o.value === v)?.label ?? v}</Tag>,
          },
          {
            title: 'Padres', dataIndex: 'padresNotificados', width: 90, align: 'center',
            render: (v: boolean) => v ? <Tag color="green">Sí</Tag> : <Tag color="default">No</Tag>,
          },
          {
            title: '', key: 'a', width: 90,
            render: (_: any, r: any) => (
              <Space onClick={e => e.stopPropagation()}>
                <Button size="small" icon={<EditOutlined />} onClick={() => setModal({ open: true, editing: r })} />
                {!r.padresNotificados && (
                  <Popconfirm title="¿Marcar padres/tutores como notificados de este incidente?"
                    onConfirm={() => notificarMut.mutate(r.id)}>
                    <Button size="small" icon={<BellOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <IncidenteModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false })} />
      <DetalleDrawer id={detalleId} onClose={() => setDetalleId(null)} onEdit={r => { setDetalleId(null); setModal({ open: true, editing: r }); }} />
    </div>
  );
}
