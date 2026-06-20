import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, Tag, message, Switch, Dropdown } from 'antd';
import { PlusOutlined, EllipsisOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const ESPECIALIDADES = ['derecho_civil','derecho_penal','derecho_corporativo','contabilidad','auditoria','consultoria','ingenieria_civil','ingenieria_sistemas','arquitectura','otro'];

const COLS_DEF = [
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'cargo', label: 'Cargo', defaultVisible: true },
  { key: 'especialidad', label: 'Especialidad', defaultVisible: true },
  { key: 'tarifaHora', label: 'Tarifa/hora', defaultVisible: true },
  { key: 'telefono', label: 'Tel.', defaultVisible: true },
  { key: 'isActive', label: 'Activo', defaultVisible: true },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

export default function ProfesionalesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({ queryKey: ['sp-profesionales'], queryFn: serviciosProApi.getProfesionales });
  const arr = Array.isArray(data) ? data : [];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('sp-profesionales', COLS_DEF);

  const crearMut = useMutation({
    mutationFn: (body: any) => editId ? serviciosProApi.actualizarProfesional(editId, body) : serviciosProApi.crearProfesional(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sp-profesionales'] });
      qc.invalidateQueries({ queryKey: ['sp-profesionales-sel'] });
      message.success(editId ? 'Profesional actualizado' : 'Profesional creado');
      setModalOpen(false); form.resetFields(); setEditId(null);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const openEditar = (p: any) => {
    setEditId(p.id);
    form.setFieldsValue(p);
    setModalOpen(true);
  };

  const exportar = () => {
    const filas = arr.map((r: any) => ({
      'Nombre': `${r.nombre ?? ''} ${r.apellidos ?? ''}`.trim(),
      'Cargo': r.cargo,
      'Especialidad': r.especialidad?.replace(/_/g, ' ') ?? '',
      'Tarifa/hora': r.tarifaHora,
      'Teléfono': r.telefono,
      'Activo': r.isActive ? 'Si' : 'No',
    }));
    exportarExcel(filas, `Profesionales-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  const columns = [
    {
      title: 'Nombre', key: 'nombre', render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.nombre} {r.apellidos ?? ''}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{r.email ?? ''}</div>
        </div>
      )
    },
    { title: 'Cargo', key: 'cargo', dataIndex: 'cargo' },
    { title: 'Especialidad', key: 'especialidad', dataIndex: 'especialidad', render: (v: string) => v?.replace(/_/g, ' ') ?? '' },
    { title: 'Tarifa/hora', key: 'tarifaHora', dataIndex: 'tarifaHora', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO')}` : '' },
    { title: 'Tel.', key: 'telefono', dataIndex: 'telefono' },
    { title: 'Activo', key: 'isActive', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Activo' : 'Inactivo'}</Tag> },
    {
      title: '', key: 'acc', width: 50,
      render: (_: any, r: any) => (
        <Dropdown menu={{ items: [{ key: 'editar', label: 'Editar', onClick: () => openEditar(r) }] }} trigger={['click']}>
          <Button size="small" icon={<EllipsisOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>👥 Profesionales</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['sp-profesionales']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>Nuevo Profesional</Button>
        </div>
      </div>

      <Table dataSource={arr} columns={filterColumns(columns as any)} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

      <Modal open={modalOpen} title={editId ? 'Editar Profesional' : 'Nuevo Profesional'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditId(null); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate(v))}
        confirmLoading={crearMut.isPending} width={600}>
        <Form form={form} layout="vertical" initialValues={{ isActive: true }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="apellidos" label="Apellidos"><Input /></Form.Item>
          </div>
          <Form.Item name="cargo" label="Cargo"><Input placeholder="Abogado Senior, CPA, Consultor..." /></Form.Item>
          <Form.Item name="especialidad" label="Especialidad">
            <Select allowClear>{ESPECIALIDADES.map(e => <Select.Option key={e} value={e}>{e.replace(/_/g, ' ')}</Select.Option>)}</Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
            <Form.Item name="telefono" label="Teléfono"><Input /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Form.Item name="tarifaHora" label="Tarifa/hora"><InputNumber style={{ width: '100%' }} min={0} prefix="RD$" /></Form.Item>
            <Form.Item name="horasSemanales" label="Horas semanales"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="isActive" label="Activo" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <Form.Item name="bio" label="Bio / Descripción"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="notas" label="Notas internas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
