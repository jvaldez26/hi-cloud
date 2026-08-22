import { useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber,
  Switch, Space, Tag, Typography, message,
} from 'antd';
import { PlusOutlined, EditOutlined, UserOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tallerApi } from '../../api/taller.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'especialidad', label: 'Especialidad', defaultVisible: true },
  { key: 'telefono', label: 'Teléfono', defaultVisible: true },
  { key: 'email', label: 'Email', defaultVisible: false },
  { key: 'tarifaHora', label: 'Tarifa/hora', defaultVisible: true },
  { key: 'isActive', label: 'Estado', defaultVisible: true },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

export default function TecnicosPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('taller-tecnicos', COLS_DEF);

  const { data: tecnicos = [], isLoading } = useQuery({
    queryKey: ['taller-tecnicos'],
    queryFn: tallerApi.tecnicos,
  });

  const save = useMutation({
    mutationFn: (vals: any) =>
      editingId ? tallerApi.actualizarTecnico(editingId, vals) : tallerApi.crearTecnico(vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taller-tecnicos'] });
      message.success(editingId ? 'Técnico actualizado' : 'Técnico registrado');
      setModalOpen(false);
      form.resetFields();
      setEditingId(null);
    },
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'Error al guardar'),
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    form.setFieldsValue({ ...r });
    setModalOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const columns = [
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre', render: (v: string) => <><UserOutlined style={{ marginRight: 6 }} />{v}</> },
    { title: 'Especialidad', dataIndex: 'especialidad', key: 'especialidad', render: (v: any) => v ?? '—' },
    { title: 'Teléfono', dataIndex: 'telefono', key: 'telefono', render: (v: any) => v ?? '—' },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: any) => v ?? '—' },
    {
      title: 'Tarifa/hora', dataIndex: 'tarifaHora', key: 'tarifaHora',
      render: (v: any) => v ? `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—',
    },
    {
      title: 'Estado', dataIndex: 'isActive', key: 'isActive',
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: 'Acciones', key: 'acc', width: 90,
      render: (_: any, r: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
      ),
    },
  ];

  const exportar = () => {
    const filas = (tecnicos as any[]).map((r: any) => ({
      'Nombre': r.nombre,
      'Especialidad': r.especialidad ?? '',
      'Teléfono': r.telefono ?? '',
      'Email': r.email ?? '',
      'Tarifa/hora': r.tarifaHora ?? '',
      'Estado': r.isActive ? 'Activo' : 'Inactivo',
    }));
    exportarExcel(filas, `Tecnicos-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}><UserOutlined style={{ marginRight: 8 }} />Técnicos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['taller-tecnicos']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo Técnico</Button>
        </div>
      </div>
      <Card>
        <Table
          dataSource={tecnicos as any[]}
          columns={filterColumns(columns as any)}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingId ? 'Editar Técnico' : 'Nuevo Técnico'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        onOk={() => form.validateFields().then(save.mutate)}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre completo" rules={[{ required: true, message: 'Requerido' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="especialidad" label="Especialidad">
            <Input placeholder="Ej: Mecánica general, Electricidad, Frenos..." />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="telefono" label="Teléfono">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input />
            </Form.Item>
            <Form.Item name="tarifaHora" label="Tarifa por hora">
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" />
            </Form.Item>
          </div>
          {editingId && (
            <Form.Item name="isActive" label="Activo" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
