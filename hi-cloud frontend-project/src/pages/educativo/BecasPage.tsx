import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Tabs, Table, Button, Modal, Form, Input, Select, InputNumber,
  Space, Tag, message, Popconfirm, Typography, Row, Col, DatePicker, Switch,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const TIPO_OPTS = [
  { value: 'porcentaje', label: 'Porcentaje (%)' },
  { value: 'monto_fijo', label: 'Monto fijo (RD$)' },
];

const APLICA_A_OPTS = [
  { value: 'colegiatura', label: 'Colegiatura' },
  { value: 'inscripcion', label: 'Inscripción / Matrícula' },
  { value: 'ambos',       label: 'Ambos' },
];

const fmt = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 });

function fmtValor(tipo: string, valor: number) {
  return tipo === 'porcentaje' ? `${valor}%` : fmt.format(valor);
}

function useEdList(path: string, params?: any) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });
}

// ── Catálogo de becas ────────────────────────────────────────────────────────

function BecaModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/becas/${editing.id}`, vals)
      : api.post('/educativo/becas', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'becas'] });
      message.success('Guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Editar beca' : 'Nueva beca'}
      onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending}
      width={520}
      destroyOnClose
      afterOpenChange={visible => {
        if (visible) form.setFieldsValue(editing ?? { tipo: 'porcentaje', aplicaA: 'colegiatura' });
        else form.resetFields();
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
          <Input placeholder="Ej: Beca Excelencia Académica" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
              <Select options={TIPO_OPTS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="valor" label="Valor" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="aplicaA" label="Aplica a" rules={[{ required: true }]}>
          <Select options={APLICA_A_OPTS} />
        </Form.Item>
        <Form.Item name="descripcion" label="Descripción">
          <Input.TextArea rows={2} />
        </Form.Item>
        {editing && (
          <Form.Item name="isActive" label="Estado" valuePropName="checked" getValueFromEvent={(v: boolean) => v}>
            <Switch checkedChildren="Activa" unCheckedChildren="Inactiva" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function CatalogoTab() {
  const { data: becas = [], isLoading } = useEdList('becas');
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true })}>
          Nueva beca
        </Button>
      </div>
      <Table dataSource={becas} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre' },
          { title: 'Tipo / Valor', render: (_: any, r: any) => fmtValor(r.tipo, Number(r.valor)) },
          {
            title: 'Aplica a', dataIndex: 'aplicaA',
            render: (v: string) => <Tag>{APLICA_A_OPTS.find(o => o.value === v)?.label ?? v}</Tag>,
          },
          { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true, render: (v: any) => v ?? '—' },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activa' : 'Inactiva'}</Tag> },
          { title: '', key: 'a', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => setModal({ open: true, editing: r })} /> },
        ]}
      />
      <BecaModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false })} />
    </>
  );
}

// ── Asignación a estudiantes ─────────────────────────────────────────────────

function AsignarBecaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const { data: estudiantes = [] } = useEdList('estudiantes');
  const { data: becas = [] } = useEdList('becas', { isActive: 'true' });
  const { data: anios = [] } = useEdList('anios-escolares');

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/becas/asignaciones', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'becas', 'asignaciones'] });
      message.success('Beca asignada');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Modal
      open={open}
      title="Asignar beca a estudiante"
      onCancel={onClose}
      onOk={() => form.validateFields().then(vals => {
        if (vals.fechaAsignacion) vals.fechaAsignacion = vals.fechaAsignacion.format('YYYY-MM-DD');
        mut.mutate(vals);
      })}
      confirmLoading={mut.isPending}
      width={520}
      destroyOnClose
      afterOpenChange={v => { if (!v) form.resetFields(); }}
    >
      <Form form={form} layout="vertical" initialValues={{ fechaAsignacion: dayjs() }}>
        <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
          <Select showSearch
            filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
            options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}${e.cedula ? ` — ${e.cedula}` : ''}` }))}
            placeholder="Buscar estudiante…" />
        </Form.Item>
        <Form.Item name="becaId" label="Beca" rules={[{ required: true }]}>
          <Select
            options={becas.map((b: any) => ({ value: b.id, label: `${b.nombre} (${fmtValor(b.tipo, Number(b.valor))} — ${APLICA_A_OPTS.find(o => o.value === b.aplicaA)?.label})` }))}
            placeholder={becas.length ? 'Selecciona una beca' : 'No hay becas activas en el catálogo'}
          />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="anioEscolarId" label="Año escolar">
              <Select allowClear placeholder="Indefinido (aplica siempre)"
                options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="fechaAsignacion" label="Fecha de asignación">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="motivo" label="Motivo">
          <Input.TextArea rows={2} placeholder="Ej: promedio de honor 2do periodo" />
        </Form.Item>
        <Form.Item name="aprobadoPor" label="Aprobado por">
          <Input placeholder="Nombre de quien autorizó la beca" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function AsignacionesTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [filtroEstudianteId, setFiltroEstudianteId] = useState<number | undefined>();
  const { data: estudiantes = [] } = useEdList('estudiantes');

  const { data: asignaciones = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'becas', 'asignaciones', filtroEstudianteId],
    queryFn: () =>
      api.get('/educativo/becas/asignaciones', { params: { estudianteId: filtroEstudianteId } })
        .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 15_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/educativo/becas/asignaciones/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'becas', 'asignaciones'] });
      message.success('Actualizado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <>
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Select
          style={{ width: 260 }}
          placeholder="Filtrar por estudiante"
          allowClear
          showSearch
          filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
          options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}` }))}
          onChange={setFiltroEstudianteId}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Asignar beca
        </Button>
      </Space>
      <Table dataSource={asignaciones} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Estudiante', dataIndex: 'estudianteNombre' },
          { title: 'Beca', dataIndex: 'becaNombre' },
          { title: 'Valor', render: (_: any, r: any) => fmtValor(r.becaTipo, Number(r.becaValor)) },
          {
            title: 'Aplica a', dataIndex: 'becaAplicaA',
            render: (v: string) => <Tag>{APLICA_A_OPTS.find(o => o.value === v)?.label ?? v}</Tag>,
          },
          { title: 'Fecha', dataIndex: 'fechaAsignacion', render: (v: any) => v?.substring(0, 10) ?? '—' },
          { title: 'Motivo', dataIndex: 'motivo', ellipsis: true, render: (v: any) => v ?? '—' },
          { title: 'Aprobado por', dataIndex: 'aprobadoPor', render: (v: any) => v ?? '—' },
          {
            title: 'Estado',
            render: (_: any, r: any) => (
              <Popconfirm
                title={r.isActive ? '¿Desactivar esta beca del estudiante?' : '¿Reactivar esta beca?'}
                onConfirm={() => toggleMut.mutate({ id: r.id, isActive: !r.isActive })}
              >
                <Tag color={r.isActive ? 'green' : 'red'} style={{ cursor: 'pointer' }}>
                  {r.isActive ? 'Activa' : 'Inactiva'}
                </Tag>
              </Popconfirm>
            ),
          },
        ]}
      />
      <AsignarBecaModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function BecasPage() {
  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <Title level={4} style={{ margin: 0, marginBottom: 4 }}>Becas</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        La beca asignada aquí se descuenta automáticamente al generar los cargos de colegiatura
        e inscripción del estudiante — no requiere ningún paso adicional en Colegiatura.
      </Text>
      <Tabs items={[
        { key: 'catalogo',     label: 'Catálogo de becas',      children: <CatalogoTab /> },
        { key: 'asignaciones', label: 'Becas por estudiante',   children: <AsignacionesTab /> },
      ]} />
    </div>
  );
}
