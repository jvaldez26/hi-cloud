import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Space, Tag, message, Popconfirm, Typography, Row, Col, Switch,
} from 'antd';
import { PlusOutlined, EditOutlined, RollbackOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const ESTADO_OPTS = [
  { value: 'prestado',  label: 'Prestado' },
  { value: 'vencido',   label: 'Vencido' },
  { value: 'devuelto',  label: 'Devuelto' },
];
const ESTADO_COLOR: Record<string, string> = {
  prestado: 'blue', vencido: 'red', devuelto: 'green',
};

function useEdList(path: string, params?: any) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });
}

// ── Catálogo de libros ───────────────────────────────────────────────────────

function LibroModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/biblioteca/libros/${editing.id}`, vals)
      : api.post('/educativo/biblioteca/libros', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'biblioteca/libros'] });
      message.success('Guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Editar libro' : 'Nuevo libro'}
      onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending}
      width={560}
      destroyOnClose
      afterOpenChange={visible => {
        if (visible) form.setFieldsValue(editing ?? { cantidadTotal: 1 });
        else form.resetFields();
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="titulo" label="Título" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="autor" label="Autor"><Input /></Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="editorial" label="Editorial"><Input /></Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="codigo" label="Código interno"><Input /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="isbn" label="ISBN"><Input /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="categoria" label="Categoría"><Input /></Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="cantidadTotal" label="Ejemplares" rules={[{ required: true }]}
              extra={editing ? 'Si lo subes, los nuevos quedan disponibles; si lo bajas, se descuenta de los disponibles.' : undefined}>
              <InputNumber min={editing ? 0 : 1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="ubicacion" label="Ubicación"><Input placeholder="Ej: Estante B3" /></Form.Item>
          </Col>
        </Row>
        {editing && (
          <Form.Item name="isActive" label="Estado" valuePropName="checked" getValueFromEvent={(v: boolean) => v}>
            <Switch checkedChildren="Activo" unCheckedChildren="Inactivo" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function CatalogoTab() {
  const [q, setQ] = useState('');
  const { data: libros = [], isLoading } = useEdList('biblioteca/libros', { q: q || undefined });
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false });

  return (
    <>
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Input.Search placeholder="Buscar por título, autor, ISBN…" style={{ width: 300 }} allowClear onSearch={setQ} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true })}>
          Nuevo libro
        </Button>
      </Space>
      <Table dataSource={libros} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showTotal: t => `${t} libros` }}
        columns={[
          { title: 'Título', dataIndex: 'titulo' },
          { title: 'Autor', dataIndex: 'autor', render: (v: any) => v ?? '—' },
          { title: 'Categoría', dataIndex: 'categoria', render: (v: any) => v ?? '—' },
          {
            title: 'Disponibles', key: 'disp', align: 'center',
            render: (_: any, r: any) => (
              <Tag color={Number(r.cantidadDisponible) > 0 ? 'green' : 'red'}>
                {r.cantidadDisponible} / {r.cantidadTotal}
              </Tag>
            ),
          },
          { title: 'Ubicación', dataIndex: 'ubicacion', render: (v: any) => v ?? '—' },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag> },
          { title: '', key: 'a', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => setModal({ open: true, editing: r })} /> },
        ]}
      />
      <LibroModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false })} />
    </>
  );
}

// ── Préstamos ────────────────────────────────────────────────────────────────

function PrestarModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [tipo, setTipo] = useState<'estudiante' | 'docente'>('estudiante');
  const { data: libros = [] } = useEdList('biblioteca/libros', { isActive: 'true' });
  const { data: estudiantes = [] } = useEdList('estudiantes');
  const { data: docentes = [] } = useEdList('docentes');

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/biblioteca/prestamos', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'biblioteca/prestamos'] });
      qc.invalidateQueries({ queryKey: ['educativo', 'biblioteca/libros'] });
      message.success('Préstamo registrado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al registrar el préstamo'),
  });

  const disponibles = libros.filter((l: any) => Number(l.cantidadDisponible) > 0);

  return (
    <Modal
      open={open}
      title="Nuevo préstamo"
      onCancel={onClose}
      onOk={() => form.validateFields().then(vals => {
        vals.fechaVencimiento = vals.fechaVencimiento.format('YYYY-MM-DD');
        if (tipo === 'estudiante') delete vals.docenteId; else delete vals.estudianteId;
        mut.mutate(vals);
      })}
      confirmLoading={mut.isPending}
      width={520}
      destroyOnClose
      afterOpenChange={v => { if (v) form.setFieldsValue({ fechaVencimiento: dayjs().add(15, 'day') }); else { form.resetFields(); setTipo('estudiante'); } }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="libroId" label="Libro" rules={[{ required: true }]}>
          <Select showSearch
            filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
            options={disponibles.map((l: any) => ({ value: l.id, label: `${l.titulo}${l.autor ? ` — ${l.autor}` : ''} (${l.cantidadDisponible} disp.)` }))}
            placeholder={disponibles.length ? 'Buscar libro…' : 'No hay ejemplares disponibles'}
          />
        </Form.Item>
        <Form.Item label="Prestar a">
          <Select id="tipoPrestamo" value={tipo} onChange={setTipo}
            options={[{ value: 'estudiante', label: 'Estudiante' }, { value: 'docente', label: 'Docente' }]} />
        </Form.Item>
        {tipo === 'estudiante' ? (
          <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
            <Select showSearch
              filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
              options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}` }))}
            />
          </Form.Item>
        ) : (
          <Form.Item name="docenteId" label="Docente" rules={[{ required: true }]}>
            <Select showSearch
              filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
              options={docentes.map((d: any) => ({ value: d.id, label: `${d.apellidos ?? ''}, ${d.nombres}` }))}
            />
          </Form.Item>
        )}
        <Form.Item name="fechaVencimiento" label="Fecha de devolución esperada" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function TablaPrestamos({ data, isLoading, onDevolver }: { data: any[]; isLoading: boolean; onDevolver: (id: number) => void }) {
  return (
    <Table dataSource={data} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 10, showTotal: t => `${t} préstamos` }}
      columns={[
        { title: 'Libro', dataIndex: 'libroTitulo' },
        {
          title: 'A', key: 'a',
          render: (_: any, r: any) => r.estudianteNombre ? `${r.estudianteNombre} (estudiante)` : `${r.docenteNombre} (docente)`,
        },
        { title: 'Fecha préstamo', dataIndex: 'fechaPrestamo', render: (v: any) => v?.substring(0, 10) ?? '—' },
        { title: 'Vence', dataIndex: 'fechaVencimiento', render: (v: any) => v?.substring(0, 10) ?? '—' },
        {
          title: 'Estado', dataIndex: 'estadoDerivado',
          render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{ESTADO_OPTS.find(o => o.value === v)?.label ?? v}</Tag>,
        },
        {
          title: '', key: 'acc',
          render: (_: any, r: any) => r.estadoDerivado !== 'devuelto' && (
            <Popconfirm title="¿Registrar la devolución de este libro?" onConfirm={() => onDevolver(r.id)}>
              <Button size="small" icon={<RollbackOutlined />}>Devolver</Button>
            </Popconfirm>
          ),
        },
      ]}
    />
  );
}

function PrestamosTab() {
  const qc = useQueryClient();
  const [filtros, setFiltros] = useState<{ estado?: string }>({});
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'biblioteca/prestamos', filtros],
    queryFn: () => api.get('/educativo/biblioteca/prestamos', { params: filtros }).then(r => r.data?.data ?? r.data ?? []),
  });
  const [modalOpen, setModalOpen] = useState(false);

  const devolverMut = useMutation({
    mutationFn: (id: number) => api.post(`/educativo/biblioteca/prestamos/${id}/devolver`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'biblioteca/prestamos'] });
      qc.invalidateQueries({ queryKey: ['educativo', 'biblioteca/libros'] });
      message.success('Devolución registrada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <>
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Select style={{ width: 180 }} allowClear placeholder="Estado" options={ESTADO_OPTS}
          onChange={v => setFiltros({ estado: v })} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Nuevo préstamo
        </Button>
      </Space>
      <TablaPrestamos data={data} isLoading={isLoading} onDevolver={id => devolverMut.mutate(id)} />
      <PrestarModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

function VencidosTab() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useEdList('biblioteca/prestamos/vencidos');

  const devolverMut = useMutation({
    mutationFn: (id: number) => api.post(`/educativo/biblioteca/prestamos/${id}/devolver`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'biblioteca/prestamos/vencidos'] });
      qc.invalidateQueries({ queryKey: ['educativo', 'biblioteca/prestamos'] });
      qc.invalidateQueries({ queryKey: ['educativo', 'biblioteca/libros'] });
      message.success('Devolución registrada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Préstamos que pasaron su fecha de devolución sin devolverse.
      </Text>
      <TablaPrestamos data={data} isLoading={isLoading} onDevolver={id => devolverMut.mutate(id)} />
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function BibliotecaPage() {
  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <Title level={4} style={{ margin: 0, marginBottom: 20 }}>Biblioteca</Title>
      <Tabs items={[
        { key: 'catalogo',  label: 'Catálogo',            children: <CatalogoTab /> },
        { key: 'prestamos', label: 'Préstamos',           children: <PrestamosTab /> },
        { key: 'vencidos',  label: 'Vencidos',            children: <VencidosTab /> },
      ]} />
    </div>
  );
}
