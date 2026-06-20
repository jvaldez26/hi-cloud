import { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, Select, DatePicker, message, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, PauseOutlined, PlayCircleOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const ESTADO_COLOR: Record<string, string> = { activa: 'green', vencida: 'red', congelada: 'blue', suspendida: 'orange', cancelada: 'default' };

const COLS_DEF = [
  { key: 'numero', label: 'Numero', defaultVisible: true },
  { key: 'miembroNombre', label: 'Miembro', defaultVisible: true },
  { key: 'planNombre', label: 'Plan', defaultVisible: true },
  { key: 'fechaInicio', label: 'Inicio', defaultVisible: true },
  { key: 'fechaFin', label: 'Fin', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'total', label: 'Total', defaultVisible: true },
  { key: 'acciones', label: 'Acciones', defaultVisible: true },
];

export default function MembresiasPage() {
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: memData, isLoading } = useQuery({
    queryKey: ['gimnasio-membresias', estadoFiltro],
    queryFn: () => gimnasioApi.getMembresias({ estado: estadoFiltro }),
  });
  const membresias = Array.isArray(memData) ? memData : memData?.data ?? [];

  const { data: planesData } = useQuery({ queryKey: ['gimnasio-planes'], queryFn: gimnasioApi.getPlanes });
  const planes = Array.isArray(planesData) ? planesData : [];

  const { data: miembrosData } = useQuery({ queryKey: ['gimnasio-miembros-sel'], queryFn: () => gimnasioApi.getMiembros({ limit: 500 }) });
  const miembros = Array.isArray(miembrosData) ? miembrosData : miembrosData?.data ?? [];

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('gimnasio-membresias', COLS_DEF);

  const exportar = () => {
    const filas = (memData?.data ?? memData ?? []).map((r: any) => ({
      'Numero': r.numero,
      'Miembro': r.miembroNombre,
      'Plan': r.planNombre,
      'Inicio': r.fechaInicio ? new Date(r.fechaInicio).toLocaleDateString('es-DO') : '',
      'Fin': r.fechaFin ? new Date(r.fechaFin).toLocaleDateString('es-DO') : '',
      'Estado': r.estado,
      'Total': r.total,
    }));
    exportarExcel(filas, 'Membresias');
  };

  const crearMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.crearMembresia(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-membresias'] }); message.success('Membresia creada'); setModalOpen(false); form.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const renovarMut = useMutation({
    mutationFn: (id: number) => gimnasioApi.renovarMembresia(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-membresias'] }); message.success('Membresia renovada'); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const congelarMut = useMutation({
    mutationFn: ({ id, dias }: { id: number; dias: number }) => gimnasioApi.congelarMembresia(id, { dias }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-membresias'] }); message.success('Membresia congelada'); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const descongelarMut = useMutation({
    mutationFn: (id: number) => gimnasioApi.descongelarMembresia(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-membresias'] }); message.success('Membresia descongelada'); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const columns = [
    { key: 'numero', title: 'Numero', dataIndex: 'numero', width: 100 },
    { key: 'miembroNombre', title: 'Miembro', dataIndex: 'miembroNombre' },
    { key: 'planNombre', title: 'Plan', dataIndex: 'planNombre' },
    { key: 'fechaInicio', title: 'Inicio', dataIndex: 'fechaInicio', render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '' },
    { key: 'fechaFin', title: 'Fin', dataIndex: 'fechaFin', render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '' },
    { key: 'estado', title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
    { key: 'total', title: 'Total', dataIndex: 'total', render: (v: number) => v != null ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    {
      key: 'acciones', title: 'Acciones', render: (_: any, r: any) => (
        <Space>
          <Popconfirm title="Renovar membresia?" onConfirm={() => renovarMut.mutate(r.id)} okText="Si" cancelText="No">
            <Button icon={<ReloadOutlined />} size="small">Renovar</Button>
          </Popconfirm>
          {r.estado === 'activa' && (
            <Popconfirm title="Congelar 30 dias?" onConfirm={() => congelarMut.mutate({ id: r.id, dias: 30 })} okText="Si" cancelText="No">
              <Button icon={<PauseOutlined />} size="small">Congelar</Button>
            </Popconfirm>
          )}
          {r.estado === 'congelada' && (
            <Popconfirm title="Descongelar membresia?" onConfirm={() => descongelarMut.mutate(r.id)} okText="Si" cancelText="No">
              <Button icon={<PlayCircleOutlined />} size="small">Descongelar</Button>
            </Popconfirm>
          )}
        </Space>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Membresias</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['gimnasio-membresias']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Nueva Membresía</Button>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Select style={{ width: 180 }} placeholder="Filtrar por estado" allowClear value={estadoFiltro || undefined} onChange={v => setEstadoFiltro(v ?? '')}>
          {['activa', 'vencida', 'congelada', 'suspendida', 'cancelada'].map(e => <Select.Option key={e} value={e}>{e}</Select.Option>)}
        </Select>
      </div>
      <Table dataSource={membresias} columns={filterColumns(columns as any)} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
      <Modal
        open={modalOpen}
        title="Nueva Membresia"
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate({ ...v, fechaInicio: v.fechaInicio?.format('YYYY-MM-DD') }))}
        confirmLoading={crearMut.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="miembroId" label="Miembro" rules={[{ required: true }]}>
            <Select showSearch placeholder="Seleccionar miembro" optionFilterProp="children">
              {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="planId" label="Plan" rules={[{ required: true }]}>
            <Select placeholder="Seleccionar plan">
              {planes.map((p: any) => <Select.Option key={p.id} value={p.id}>{p.nombre} - RD${Number(p.precio).toLocaleString('es-DO')}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="fechaInicio" label="Fecha Inicio" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
