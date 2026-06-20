import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Input, Select, Modal, Form, InputNumber, Tag, Space, Tooltip, message, theme } from 'antd';
import { UserPlus, Search, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';

const { Option } = Select;

const riesgoColor: Record<string, string> = { bajo: 'green', medio: 'blue', alto: 'orange', critico: 'red' };

const COLS_DEF = [
  { key: 'numero', label: 'N°', defaultVisible: true },
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'cedula', label: 'Cédula', defaultVisible: true },
  { key: 'telefono', label: 'Teléfono', defaultVisible: true },
  { key: 'prestamosActivos', label: 'Préstamos', defaultVisible: true },
  { key: 'nivelRiesgo', label: 'Riesgo', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
];

export default function DeudoresPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('prestamista-deudores', COLS_DEF);

  const { data, isLoading } = useQuery({
    queryKey: ['prestamista-deudores', page, search],
    queryFn: () => prestamistalApi.getDeudores({ page, limit: 20, search }),
  });

  const save = useMutation({
    mutationFn: (vals: any) => editing
      ? prestamistalApi.updateDeudor(editing.id, vals)
      : prestamistalApi.crearDeudor(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prestamista-deudores'] }); setOpen(false); form.resetFields(); setEditing(null); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar deudor'),
  });

  const openForm = (row?: any) => {
    setEditing(row ?? null);
    form.setFieldsValue(row ? { ...row } : {});
    setOpen(true);
  };

  const cols = [
    { title: 'N°', dataIndex: 'numero', key: 'numero', width: 90 },
    { title: 'Nombre', key: 'nombre', render: (_: any, r: any) => `${r.nombre} ${r.apellidos ?? ''}` },
    { title: 'Cédula', dataIndex: 'cedula', key: 'cedula', width: 120 },
    { title: 'Teléfono', dataIndex: 'telefono', key: 'telefono', width: 120 },
    { title: 'Préstamos', dataIndex: 'prestamosActivos', key: 'prestamosActivos', width: 90, align: 'center' as const },
    { title: 'Riesgo', dataIndex: 'nivelRiesgo', key: 'nivelRiesgo', width: 90, render: (v: string) => <Tag color={riesgoColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Estado', dataIndex: 'estado', key: 'estado', width: 90, render: (v: string) => <Tag color={v === 'activo' ? 'green' : 'red'}>{v}</Tag> },
    {
      title: '', key: 'acc', width: 100,
      render: (_: any, r: any) => (
        <Space>
          <Tooltip title="Ver ficha"><Button size="small" icon={<FileText size={13} />} onClick={() => navigate(`/prestamista/deudores/${r.id}`)} /></Tooltip>
          <Button size="small" onClick={() => openForm(r)}>Editar</Button>
        </Space>
      ),
    },
  ];

  const exportar = () => {
    const filas = (data?.data ?? []).map((r: any) => ({
      'N°': r.numero,
      'Nombre': `${r.nombre} ${r.apellidos ?? ''}`,
      'Cédula': r.cedula,
      'Teléfono': r.telefono,
      'Préstamos Activos': r.prestamosActivos,
      'Riesgo': r.nivelRiesgo,
      'Estado': r.estado,
    }));
    exportarExcel(filas, `Deudores-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Deudores</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['prestamista-deudores']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<UserPlus size={15} />} onClick={() => openForm()}>Nuevo Deudor</Button>
        </div>
      </div>

      <Input prefix={<Search size={14} />} placeholder="Buscar por nombre, cédula..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ marginBottom: 16, maxWidth: 320 }} />

      <Table
        dataSource={(data?.data ?? []).map((r: any) => ({ ...r, key: r.id }))}
        columns={filterColumns(cols as any)} loading={isLoading} scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showTotal: t => `${t} deudores` }}
      />

      <Modal title={editing ? 'Editar Deudor' : 'Nuevo Deudor'} open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => save.mutate(v))} okText="Guardar" width={700} confirmLoading={save.isPending}>
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="apellidos" label="Apellidos"><Input /></Form.Item>
            <Form.Item name="cedula" label="Cédula"><Input /></Form.Item>
            <Form.Item name="telefono" label="Teléfono"><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input /></Form.Item>
            <Form.Item name="ocupacion" label="Ocupación"><Input /></Form.Item>
            <Form.Item name="empresaLabora" label="Empresa donde labora"><Input /></Form.Item>
            <Form.Item name="ingresoMensual" label="Ingreso Mensual"><InputNumber style={{ width: '100%' }} prefix="RD$" /></Form.Item>
            <Form.Item name="estadoCivil" label="Estado Civil">
              <Select allowClear>
                <Option value="soltero">Soltero(a)</Option>
                <Option value="casado">Casado(a)</Option>
                <Option value="union_libre">Unión libre</Option>
                <Option value="divorciado">Divorciado(a)</Option>
                <Option value="viudo">Viudo(a)</Option>
              </Select>
            </Form.Item>
            <Form.Item name="nivelRiesgo" label="Nivel de Riesgo">
              <Select allowClear>
                <Option value="bajo">Bajo</Option>
                <Option value="medio">Medio</Option>
                <Option value="alto">Alto</Option>
                <Option value="critico">Crítico</Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="direccion" label="Dirección"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
