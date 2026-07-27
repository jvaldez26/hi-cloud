import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Select, Space, Tag, Modal, Form, DatePicker,
  message, Typography, Row, Col, Input, InputNumber, Card, Statistic,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const ESTADO_OPTS = [
  { value: 'activa',    label: 'Activa',    color: 'green' },
  { value: 'retirado',  label: 'Retirado',  color: 'red' },
  { value: 'graduado',  label: 'Graduado',  color: 'blue' },
  { value: 'traslado',  label: 'Traslado',  color: 'orange' },
];

const BECA_OPTS = [
  { value: 'ninguna',  label: 'Sin beca' },
  { value: 'parcial',  label: 'Beca parcial' },
  { value: 'completa', label: 'Beca completa' },
  { value: 'descuento', label: 'Descuento' },
];

function estadoColor(e?: string) {
  return ESTADO_OPTS.find(o => o.value === e)?.color ?? 'default';
}

function useEdData(path: string, enabled = true) {
  return useQuery<any[]>({
    queryKey: ['educativo', path],
    queryFn: () => api.get(`/educativo/${path}`).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
    enabled,
  });
}

// ── Modal nueva/editar matrícula ─────────────────────────────────────────────

function MatriculaModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [selectedGradoId, setSelectedGradoId] = useState<number | undefined>(editing?.gradoId);
  const [tipoBeca, setTipoBeca] = useState<string>(editing?.tipoBeca ?? 'ninguna');

  const { data: anios = [] } = useEdData('anios-escolares', open);
  const { data: estudiantes = [] } = useEdData('estudiantes', open);
  const { data: grados = [] } = useEdData('grados', open);
  const { data: secciones = [] } = useQuery<any[]>({
    queryKey: ['educativo', 'secciones', selectedGradoId],
    queryFn: () => api.get('/educativo/secciones', { params: { gradoId: selectedGradoId } })
      .then(r => r.data?.data ?? r.data ?? []),
    enabled: open && !!selectedGradoId,
    staleTime: 30_000,
  });

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/matriculas/${editing.id}`, vals)
      : api.post('/educativo/matriculas', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'matriculas'] });
      qc.invalidateQueries({ queryKey: ['educativo', 'matriculas', 'stats'] });
      message.success('Guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const onOk = () => form.validateFields().then(vals => {
    if (vals.fechaMatricula) vals.fechaMatricula = vals.fechaMatricula.format('YYYY-MM-DD');
    mut.mutate(vals);
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Editar matrícula' : 'Nueva matrícula'}
      onCancel={onClose}
      onOk={onOk}
      confirmLoading={mut.isPending}
      width={600}
      destroyOnClose
      afterOpenChange={visible => {
        if (visible) {
          setSelectedGradoId(editing?.gradoId);
          setTipoBeca(editing?.tipoBeca ?? 'ninguna');
          form.setFieldsValue(editing
            ? { ...editing, fechaMatricula: editing.fechaMatricula ? dayjs(editing.fechaMatricula) : dayjs() }
            : { fechaMatricula: dayjs(), estado: 'activa', tipoBeca: 'ninguna', porcentajeBeca: 0 });
        } else {
          form.resetFields();
        }
      }}
    >
      <Form form={form} layout="vertical">
        {!editing && (
          <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
            <Select
              showSearch
              filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
              options={estudiantes.map((e: any) => ({
                value: e.id,
                label: `${e.apellidos}, ${e.nombres}${e.cedula ? ` — ${e.cedula}` : ''}`,
              }))}
              placeholder="Buscar estudiante…"
            />
          </Form.Item>
        )}
        {editing && (
          <div style={{ marginBottom: 12 }}>
            <Text strong>{editing.estudianteNombre}</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>{editing.estudianteCedula}</Text>
          </div>
        )}

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="anioEscolarId" label="Año escolar">
              <Select allowClear options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="fechaMatricula" label="Fecha matrícula">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="gradoId" label="Grado">
              <Select
                allowClear
                options={grados.map((g: any) => ({ value: g.id, label: g.nombre }))}
                onChange={v => { setSelectedGradoId(v); form.setFieldValue('seccionId', undefined); }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="seccionId" label="Sección">
              <Select
                allowClear
                disabled={!selectedGradoId}
                options={secciones.map((s: any) => ({ value: s.id, label: s.nombre }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="estado" label="Estado" rules={[{ required: true }]}>
              <Select options={ESTADO_OPTS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="tipoBeca" label="Tipo de beca">
              <Select options={BECA_OPTS} onChange={v => setTipoBeca(v)} />
            </Form.Item>
          </Col>
        </Row>

        {tipoBeca !== 'ninguna' && (
          <Form.Item name="porcentajeBeca" label="Porcentaje de beca (%)">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
        )}

        <Form.Item name="observaciones" label="Observaciones">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ anioId }: { anioId?: number }) {
  const { data } = useQuery<any>({
    queryKey: ['educativo', 'matriculas', 'stats', anioId],
    queryFn: () =>
      api.get('/educativo/matriculas/stats', { params: { anioEscolarId: anioId || undefined } })
        .then(r => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  if (!data?.resumen) return null;
  const { total, conBeca } = data.resumen;
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col>
        <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
          <Statistic title="Total activos" value={total} valueStyle={{ fontSize: 18 }} />
        </Card>
      </Col>
      <Col>
        <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
          <Statistic title="Con beca" value={conBeca} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
        </Card>
      </Col>
    </Row>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function MatriculasPage() {
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false });

  const { data: anios = [] } = useEdData('anios-escolares');
  const { data: grados = [] } = useEdData('grados');

  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'matriculas', 'list', filters],
    queryFn: () =>
      api.get('/educativo/matriculas', { params: filters })
        .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 30_000,
  });

  const setFilter = (key: string, val: any) =>
    setFilters(prev => ({ ...prev, [key]: val || undefined }));

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Matrículas</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true })}>
          Nueva matrícula
        </Button>
      </div>

      <StatsBar anioId={filters.anioEscolarId} />

      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          style={{ width: 180 }}
          placeholder="Año escolar"
          allowClear
          options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))}
          onChange={v => setFilter('anioEscolarId', v)}
        />
        <Select
          style={{ width: 150 }}
          placeholder="Grado"
          allowClear
          options={grados.map((g: any) => ({ value: g.id, label: g.nombre }))}
          onChange={v => setFilter('gradoId', v)}
        />
        <Select
          style={{ width: 130 }}
          placeholder="Estado"
          allowClear
          options={ESTADO_OPTS}
          onChange={v => setFilter('estado', v)}
        />
        <Input.Search
          placeholder="Buscar estudiante…"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          allowClear
          onSearch={v => setFilter('q', v)}
          onChange={e => { if (!e.target.value) setFilter('q', undefined); }}
        />
      </Space>

      <Table
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'Estudiante',
            dataIndex: 'estudianteNombre',
            render: (v: string, r: any) => (
              <span>
                <span style={{ fontWeight: 500 }}>{v}</span>
                {r.estudianteCedula && <Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>{r.estudianteCedula}</Text>}
              </span>
            ),
          },
          { title: 'Año', dataIndex: 'anioNombre', render: (v: any) => v ?? '—' },
          { title: 'Grado', dataIndex: 'gradoNombre', render: (v: any) => v ?? '—' },
          { title: 'Sección', dataIndex: 'seccionNombre', render: (v: any) => v ?? '—' },
          {
            title: 'Beca',
            render: (_: any, r: any) =>
              r.tipoBeca && r.tipoBeca !== 'ninguna'
                ? <Tag color="blue">{r.tipoBeca}{r.porcentajeBeca ? ` ${r.porcentajeBeca}%` : ''}</Tag>
                : <span style={{ color: '#999' }}>—</span>,
          },
          { title: 'Fecha', dataIndex: 'fechaMatricula', render: (v: any) => v?.substring(0, 10) ?? '—' },
          {
            title: 'Estado',
            dataIndex: 'estado',
            render: (v: string) => <Tag color={estadoColor(v)}>{v}</Tag>,
          },
          {
            title: '',
            key: 'a',
            render: (_: any, r: any) => (
              <Button size="small" icon={<EditOutlined />} onClick={() => setModal({ open: true, editing: r })} />
            ),
          },
        ]}
      />

      <MatriculaModal
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false })}
      />
    </div>
  );
}
