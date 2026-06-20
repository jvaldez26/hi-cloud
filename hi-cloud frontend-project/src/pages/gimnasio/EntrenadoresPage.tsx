import { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message } from 'antd';
import { PlusOutlined, EditOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const COLS_DEF = [
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'especialidad', label: 'Especialidad', defaultVisible: true },
  { key: 'certificaciones', label: 'Certificaciones', defaultVisible: true },
  { key: 'tarifaSesion', label: 'Tarifa Sesion', defaultVisible: true },
  { key: 'tarifaMes', label: 'Tarifa Mes', defaultVisible: true },
  { key: 'acciones', label: 'Acciones', defaultVisible: true },
];

export default function EntrenadoresPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['gimnasio-entrenadores'], queryFn: gimnasioApi.getEntrenadores });
  const entrenadores = Array.isArray(data) ? data : [];

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('gimnasio-entrenadores', COLS_DEF);

  const exportar = () => {
    const filas = (Array.isArray(data) ? data : []).map((r: any) => ({
      'Nombre': r.nombre,
      'Especialidad': r.especialidad,
      'Certificaciones': r.certificaciones,
      'Tarifa Sesion': r.tarifaSesion,
      'Tarifa Mes': r.tarifaMes,
    }));
    exportarExcel(filas, 'Entrenadores');
  };

  const guardarMut = useMutation({
    mutationFn: (body: any) => editando ? gimnasioApi.actualizarEntrenador(editando.id, body) : gimnasioApi.crearEntrenador(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-entrenadores'] }); message.success('Entrenador guardado'); setModalOpen(false); form.resetFields(); setEditando(null); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const columns = [
    { key: 'nombre', title: 'Nombre', dataIndex: 'nombre' },
    { key: 'especialidad', title: 'Especialidad', dataIndex: 'especialidad' },
    { key: 'certificaciones', title: 'Certificaciones', dataIndex: 'certificaciones' },
    { key: 'tarifaSesion', title: 'Tarifa Sesion', dataIndex: 'tarifaSesion', render: (v: number) => v != null ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    { key: 'tarifaMes', title: 'Tarifa Mes', dataIndex: 'tarifaMes', render: (v: number) => v != null ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    {
      key: 'acciones', title: 'Acciones', render: (_: any, r: any) => (
        <Button icon={<EditOutlined />} size="small" onClick={() => { setEditando(r); form.setFieldsValue(r); setModalOpen(true); }}>Editar</Button>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Entrenadores</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['gimnasio-entrenadores']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditando(null); form.resetFields(); setModalOpen(true); }}>Nuevo Entrenador</Button>
        </div>
      </div>
      <Table dataSource={entrenadores} columns={filterColumns(columns as any)} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
      <Modal open={modalOpen} title={editando ? 'Editar Entrenador' : 'Nuevo Entrenador'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditando(null); }}
        onOk={() => form.validateFields().then(v => guardarMut.mutate(v))}
        confirmLoading={guardarMut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="especialidad" label="Especialidad"><Input /></Form.Item>
          <Form.Item name="certificaciones" label="Certificaciones"><Input /></Form.Item>
          <Form.Item name="tarifaSesion" label="Tarifa por Sesion (RD$)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="tarifaMes" label="Tarifa Mensual (RD$)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="telefono" label="Telefono"><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
