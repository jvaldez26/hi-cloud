import { useState } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, InputNumber, Input, message } from 'antd';
import { PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { fecha, hoyRD } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'fecha', label: 'Fecha', defaultVisible: true },
  { key: 'miembroNombre', label: 'Miembro', defaultVisible: true },
  { key: 'peso', label: 'Peso (kg)', defaultVisible: true },
  { key: 'talla', label: 'Talla (cm)', defaultVisible: true },
  { key: 'imc', label: 'IMC', defaultVisible: true },
  { key: 'grasaCorporal', label: '% Grasa', defaultVisible: true },
  { key: 'masaMuscular', label: 'Masa Muscular', defaultVisible: true },
];

export default function ProgresoPage() {
  const [miembroFiltro, setMiembroFiltro] = useState<number | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gimnasio-progreso', miembroFiltro],
    queryFn: () => gimnasioApi.getProgreso(miembroFiltro ? { miembroId: miembroFiltro } : undefined),
  });
  const registros = Array.isArray(data) ? data : [];

  const { data: miembrosData } = useQuery({ queryKey: ['gimnasio-miembros-sel'], queryFn: () => gimnasioApi.getMiembros({ limit: 500 }) });
  const miembros = Array.isArray(miembrosData) ? miembrosData : miembrosData?.data ?? [];

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('gimnasio-progreso', COLS_DEF);

  const exportar = () => {
    const filas = (Array.isArray(data) ? data : []).map((r: any) => ({
      'Fecha': r.fecha ? fecha(r.fecha) : '',
      'Miembro': r.miembroNombre,
      'Peso (kg)': r.peso,
      'Talla (cm)': r.talla,
      'IMC': r.imc != null ? Number(r.imc).toFixed(2) : '',
      '% Grasa': r.grasaCorporal,
      'Masa Muscular': r.masaMuscular,
    }));
    exportarExcel(filas, `Progreso-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const crearMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.crearProgreso(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-progreso'] }); message.success('Medicion registrada'); setModalOpen(false); form.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const columns = [
    { key: 'fecha', title: 'Fecha', dataIndex: 'fecha', render: (v: string) => v ? fecha(v) : '' },
    { key: 'miembroNombre', title: 'Miembro', dataIndex: 'miembroNombre' },
    { key: 'peso', title: 'Peso (kg)', dataIndex: 'peso' },
    { key: 'talla', title: 'Talla (cm)', dataIndex: 'talla' },
    { key: 'imc', title: 'IMC', dataIndex: 'imc', render: (v: number) => v != null ? Number(v).toFixed(2) : '' },
    { key: 'grasaCorporal', title: '% Grasa', dataIndex: 'grasaCorporal', render: (v: number) => v != null ? `${v}%` : '' },
    { key: 'masaMuscular', title: 'Masa Muscular', dataIndex: 'masaMuscular', render: (v: number) => v != null ? `${v} kg` : '' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Progreso de Miembros</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['gimnasio-progreso']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Registrar Progreso</Button>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Select style={{ width: 250 }} placeholder="Filtrar por miembro" allowClear showSearch optionFilterProp="children"
          value={miembroFiltro} onChange={v => setMiembroFiltro(v)}>
          {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
        </Select>
      </div>
      <Table dataSource={registros} columns={filterColumns(columns as any)} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
      <Modal open={modalOpen} title="Nueva Medicion"
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate({ ...v, fecha: v.fecha?.format('YYYY-MM-DD') }))}
        confirmLoading={crearMut.isPending}
        width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="miembroId" label="Miembro" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar miembro">
              {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="peso" label="Peso (kg)"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item>
          <Form.Item name="talla" label="Talla (cm)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="grasaCorporal" label="% Grasa Corporal"><InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} /></Form.Item>
          <Form.Item name="masaMuscular" label="Masa Muscular (kg)"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item>
          <Form.Item name="cintura" label="Cintura (cm)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="cadera" label="Cadera (cm)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="pecho" label="Pecho (cm)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
