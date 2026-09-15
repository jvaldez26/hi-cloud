import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber, Select,
  Space, Tag, message, Popconfirm, Typography, Row, Col, Switch,
} from 'antd';
import { PlusOutlined, EditOutlined, StopOutlined, PlusCircleOutlined } from '@ant-design/icons';
import api from '../../api/client';

const { Title, Text } = Typography;

function useEdList(path: string, params?: any) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });
}

const fmt = (n: any) => n == null ? '—' : `RD$${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

// ── Rutas ────────────────────────────────────────────────────────────────────

function RutaModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (vals: any) => {
      const paradas = (vals.paradasTexto ?? '').split('\n').map((p: string) => p.trim()).filter(Boolean);
      const { paradasTexto, ...rest } = vals;
      const payload = { ...rest, paradas };
      return editing
        ? api.patch(`/educativo/transporte/rutas/${editing.id}`, payload)
        : api.post('/educativo/transporte/rutas', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'transporte/rutas'] });
      message.success('Guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Editar ruta' : 'Nueva ruta'}
      onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending}
      width={560}
      destroyOnClose
      afterOpenChange={visible => {
        if (visible) form.setFieldsValue(editing ? { ...editing, paradasTexto: (editing.paradas ?? []).join('\n') } : {});
        else form.resetFields();
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="nombre" label="Nombre de la ruta" rules={[{ required: true }]}>
          <Input placeholder="Ej: Ruta Norte" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="chofer" label="Chofer"><Input /></Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="choferTelefono" label="Teléfono del chofer"><Input /></Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="vehiculoPlaca" label="Placa del vehículo"><Input /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="capacidad" label="Capacidad"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="costoMensual" label="Costo mensual"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </Col>
        </Row>
        <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="paradasTexto" label="Paradas" extra="Una por línea">
          <Input.TextArea rows={3} placeholder={'Parada 1\nParada 2'} />
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

function RutasTab({ onAsignar }: { onAsignar: (rutaId: number) => void }) {
  const { data: rutas = [], isLoading } = useEdList('transporte/rutas');
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true })}>
          Nueva ruta
        </Button>
      </div>
      <Table dataSource={rutas} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showTotal: t => `${t} rutas` }}
        columns={[
          { title: 'Ruta', dataIndex: 'nombre' },
          { title: 'Chofer', dataIndex: 'chofer', render: (v: any) => v ?? '—' },
          { title: 'Vehículo', dataIndex: 'vehiculoPlaca', render: (v: any) => v ?? '—' },
          {
            title: 'Ocupación', key: 'ocup', align: 'center',
            render: (_: any, r: any) => r.capacidad != null
              ? <Tag color={r.ocupacionActual >= r.capacidad ? 'red' : 'green'}>{r.ocupacionActual} / {r.capacidad}</Tag>
              : <Tag>{r.ocupacionActual} (sin límite)</Tag>,
          },
          { title: 'Costo mensual', dataIndex: 'costoMensual', render: fmt },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activa' : 'Inactiva'}</Tag> },
          {
            title: '', key: 'a',
            render: (_: any, r: any) => (
              <Space>
                <Button size="small" icon={<PlusCircleOutlined />} onClick={() => onAsignar(r.id)}>Asignar</Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => setModal({ open: true, editing: r })} />
              </Space>
            ),
          },
        ]}
      />
      <RutaModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false })} />
    </>
  );
}

// ── Asignación de estudiantes ────────────────────────────────────────────────

function AsignarModal({ open, rutaId, onClose }: { open: boolean; rutaId?: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const { data: rutas = [] } = useEdList('transporte/rutas', undefined);
  const { data: estudiantes = [] } = useEdList('estudiantes');

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/transporte/estudiantes', vals),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['educativo', 'transporte/estudiantes'] });
      qc.invalidateQueries({ queryKey: ['educativo', 'transporte/rutas'] });
      const cargos = res.data?.data?.cargosGenerados ?? res.data?.cargosGenerados;
      const motivo = res.data?.data?.motivo ?? res.data?.motivo;
      message.success(motivo ?? `Asignado — ${cargos} cargo(s) de transporte generado(s)`);
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al asignar'),
  });

  return (
    <Modal
      open={open}
      title="Asignar estudiante a ruta"
      onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending}
      width={520}
      destroyOnClose
      afterOpenChange={v => { if (v) form.setFieldsValue({ rutaId }); else form.resetFields(); }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="rutaId" label="Ruta" rules={[{ required: true }]}>
          <Select options={rutas.filter((r: any) => r.isActive).map((r: any) => ({ value: r.id, label: `${r.nombre} (${r.ocupacionActual}${r.capacidad != null ? `/${r.capacidad}` : ''})` }))} />
        </Form.Item>
        <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
          <Select showSearch
            filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
            options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}` }))}
          />
        </Form.Item>
        <Form.Item name="paradaRecogida" label="Parada de recogida">
          <Input />
        </Form.Item>
        <Form.Item name="costoMensual" label="Costo mensual (si es distinto al de la ruta)">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function EstudiantesTab({ modalOpen, setModalOpen }: { modalOpen: { open: boolean; rutaId?: number }; setModalOpen: (v: { open: boolean; rutaId?: number }) => void }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useEdList('transporte/estudiantes');

  const desasignarMut = useMutation({
    mutationFn: (id: number) => api.post(`/educativo/transporte/estudiantes/${id}/desasignar`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['educativo', 'transporte/estudiantes'] });
      qc.invalidateQueries({ queryKey: ['educativo', 'transporte/rutas'] });
      const anulados = res.data?.data?.cargosAnulados ?? res.data?.cargosAnulados ?? 0;
      message.success(`Desasignado — ${anulados} cargo(s) futuro(s) sin pagar anulado(s)`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen({ open: true })}>
          Asignar estudiante
        </Button>
      </div>
      <Table dataSource={data} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showTotal: t => `${t} asignaciones` }}
        columns={[
          { title: 'Estudiante', dataIndex: 'estudianteNombre' },
          { title: 'Ruta', dataIndex: 'rutaNombre' },
          { title: 'Parada', dataIndex: 'paradaRecogida', render: (v: any) => v ?? '—' },
          { title: 'Costo mensual', dataIndex: 'costoMensual', render: fmt },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag> },
          {
            title: '', key: 'a',
            render: (_: any, r: any) => r.isActive && (
              <Popconfirm title="¿Desasignar de la ruta? Se anulan sus cargos futuros sin pagar." onConfirm={() => desasignarMut.mutate(r.id)}>
                <Button size="small" danger icon={<StopOutlined />}>Desasignar</Button>
              </Popconfirm>
            ),
          },
        ]}
      />
      <AsignarModal open={modalOpen.open} rutaId={modalOpen.rutaId} onClose={() => setModalOpen({ open: false })} />
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TransporteEdPage() {
  const [modalOpen, setModalOpen] = useState<{ open: boolean; rutaId?: number }>({ open: false });
  const [activeTab, setActiveTab] = useState('rutas');

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <Title level={4} style={{ margin: 0, marginBottom: 4 }}>Transporte</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        Al asignar un estudiante a una ruta se generan sus cargos de transporte del resto del año
        escolar activo, por el mismo motor que colegiatura. Las becas no aplican a transporte.
      </Text>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'rutas', label: 'Rutas',
            children: <RutasTab onAsignar={rutaId => { setModalOpen({ open: true, rutaId }); setActiveTab('estudiantes'); }} />,
          },
          {
            key: 'estudiantes', label: 'Estudiantes',
            children: <EstudiantesTab modalOpen={modalOpen} setModalOpen={setModalOpen} />,
          },
        ]}
      />
    </div>
  );
}
