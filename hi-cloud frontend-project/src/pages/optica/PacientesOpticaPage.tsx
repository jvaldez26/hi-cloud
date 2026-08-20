import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Tag, Space, theme, DatePicker,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, FileTextOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'cedula', label: 'Cédula', defaultVisible: true },
  { key: 'telefono', label: 'Teléfono', defaultVisible: true },
  { key: 'email', label: 'Email', defaultVisible: true },
  { key: 'fechaNacimiento', label: 'Nac.', defaultVisible: false },
  { key: 'isActive', label: 'Estado', defaultVisible: true },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

export default function PacientesOpticaPage() {
  const { token } = theme.useToken();
  const nav = useNavigate();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch]   = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('optica-pacientes', COLS_DEF);

  const { data, isLoading } = useQuery({
    queryKey: ['optica-pacientes'],
    queryFn: () => opticaApi.pacientes({ limit: 500 }),
  });

  const rows = (data?.data ?? data ?? []).filter((p: any) =>
    `${p.nombre} ${p.apellido} ${p.cedula ?? ''} ${p.telefono ?? ''}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (r: any) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      fechaNacimiento: r.fechaNacimiento ? dayjs(r.fechaNacimiento) : null,
    });
    setOpen(true);
  };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) => {
      const body = { ...v, fechaNacimiento: v.fechaNacimiento?.format('YYYY-MM-DD') ?? null };
      return editing ? opticaApi.actualizarPaciente(editing.id, body) : opticaApi.crearPaciente(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-pacientes'] });
      message.success(editing ? 'Paciente actualizado' : 'Paciente creado');
      closeModal();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar paciente');
    },
  });

  const delMut = useMutation({
    mutationFn: (id: number) => opticaApi.eliminarPaciente(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['optica-pacientes'] }); message.success('Paciente eliminado'); },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al eliminar paciente');
    },
  });

  const cols = [
    {
      title: 'Nombre', key: 'nombre', ellipsis: true,
      render: (_: any, r: any) => `${r.nombre} ${r.apellido}`,
    },
    { title: 'Cédula', dataIndex: 'cedula', width: 120, render: (v: any) => v ?? '—' },
    { title: 'Teléfono', dataIndex: 'telefono', width: 130, render: (v: any) => v ?? '—' },
    { title: 'Email', dataIndex: 'email', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'Nac.', dataIndex: 'fechaNacimiento', width: 110,
      render: (v: any) => v ? fmt.date(v) : '—',
    },
    {
      title: 'Estado', dataIndex: 'isActive', width: 90,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => nav(`/optica/pacientes/${r.id}`)}
          viewLabel="Ver ficha"
          items={[
            { key: 'edit', label: 'Editar', icon: <EditOutlined />, onClick: () => openEdit(r) },
            {
              key: 'del', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
              onClick: () => { if (window.confirm('¿Eliminar este paciente?')) delMut.mutate(r.id); },
            },
          ]}
        />
      ),
    },
  ];

  const exportar = () => {
    const filas = (data?.data ?? data ?? []).map((r: any) => ({
      'Nombre': `${r.nombre} ${r.apellido}`,
      'Cédula': r.cedula ?? '',
      'Teléfono': r.telefono ?? '',
      'Email': r.email ?? '',
      'Fecha Nacimiento': r.fechaNacimiento ?? '',
      'Estado': r.isActive ? 'Activo' : 'Inactivo',
    }));
    exportarExcel(filas, `Pacientes-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Pacientes</Title>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Input
            placeholder="Buscar por nombre, cédula o teléfono..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['optica-pacientes']} />
            <VideoTutorialButton />
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Nuevo paciente
            </Button>
          </div>
        </div>

        <Table
          columns={filterColumns(cols as any)}
          dataSource={rows}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editing ? 'Editar Paciente' : 'Nuevo Paciente'}
        open={open}
        onCancel={closeModal}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="apellido" label="Apellido" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="cedula" label="Cédula">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="fechaNacimiento" label="Fecha nacimiento">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="genero" label="Género">
                <Select allowClear options={[
                  { value: 'M', label: 'Masculino' },
                  { value: 'F', label: 'Femenino' },
                  { value: 'otro', label: 'Otro' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="telefono" label="Teléfono">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="ocupacion" label="Ocupación">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="direccion" label="Dirección">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notas" label="Notas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            {editing && (
              <Col xs={24} sm={12}>
                <Form.Item name="isActive" label="Estado">
                  <Select options={[
                    { value: true, label: 'Activo' },
                    { value: false, label: 'Inactivo' },
                  ]} />
                </Form.Item>
              </Col>
            )}
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
                {editing ? 'Guardar cambios' : 'Crear'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

