import { useState } from 'react';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  message, Space, theme,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'especialidad', label: 'Especialidad', defaultVisible: true },
  { key: 'exequatur', label: 'Exequatur', defaultVisible: true },
  { key: 'telefono', label: 'Teléfono', defaultVisible: true },
  { key: 'email', label: 'Email', defaultVisible: false },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

export default function MedicosOpticaPage() {
  const { token } = theme.useToken();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch]   = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('optica-medicos', COLS_DEF);

  const { data, isLoading } = useQuery({
    queryKey: ['optica-medicos'],
    queryFn: () => opticaApi.medicos(),
  });

  const rows = ((data as any[]) ?? []).filter((m: any) =>
    `${m.nombre} ${m.apellido} ${m.especialidad ?? ''} ${m.exequatur ?? ''}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (r: any) => { setEditing(r); form.setFieldsValue(r); setOpen(true); };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) =>
      editing ? opticaApi.actualizarMedico(editing.id, v) : opticaApi.crearMedico(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-medicos'] });
      message.success(editing ? 'Médico actualizado' : 'Médico creado');
      closeModal();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar médico');
    },
  });

  const delMut = useMutation({
    mutationFn: (id: number) => opticaApi.eliminarMedico(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['optica-medicos'] }); message.success('Médico eliminado'); },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al eliminar médico');
    },
  });

  const cols = [
    {
      title: 'Nombre', key: 'nombre', ellipsis: true,
      render: (_: any, r: any) => `Dr(a). ${r.nombre} ${r.apellido}`,
    },
    { title: 'Especialidad', dataIndex: 'especialidad', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Exequatur', dataIndex: 'exequatur', width: 120, render: (v: any) => v ?? '—' },
    { title: 'Teléfono', dataIndex: 'telefono', width: 130, render: (v: any) => v ?? '—' },
    { title: 'Email', dataIndex: 'email', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => openEdit(r)}
          viewLabel="Editar"
          items={[
            {
              key: 'del', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
              onClick: () => { if (window.confirm('¿Eliminar este médico?')) delMut.mutate(r.id); },
            },
          ]}
        />
      ),
    },
  ];

  const exportar = () => {
    const filas = ((data as any[]) ?? []).map((r: any) => ({
      'Nombre': `Dr(a). ${r.nombre} ${r.apellido}`,
      'Especialidad': r.especialidad ?? '',
      'Exequatur': r.exequatur ?? '',
      'Teléfono': r.telefono ?? '',
      'Email': r.email ?? '',
    }));
    exportarExcel(filas, `Medicos-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Médicos / Optometristas</Title>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Input
            placeholder="Buscar por nombre, especialidad..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['optica-medicos']} />
            <VideoTutorialButton />
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Nuevo médico
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
        title={editing ? 'Editar Médico' : 'Nuevo Médico / Optometrista'}
        open={open}
        onCancel={closeModal}
        footer={null}
        width={560}
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
              <Form.Item name="especialidad" label="Especialidad">
                <Input placeholder="Oftalmólogo, Optometrista..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="exequatur" label="Exequatur">
                <Input />
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
            <Col xs={24}>
              <Form.Item name="direccion" label="Dirección">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notas" label="Notas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
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

