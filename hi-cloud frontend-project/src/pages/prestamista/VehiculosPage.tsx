import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Tag, Alert,
  message, theme, Badge, Space, Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import { Plus, Car, AlertTriangle } from 'lucide-react';
import { FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const fmtFecha = (v: string | null | undefined) => v ? dayjs(v).format('DD/MM/YYYY') : '—';

const COLS_DEF = [
  { key: 'placa',         label: 'Placa',          defaultVisible: true },
  { key: 'marca',         label: 'Marca/Modelo',   defaultVisible: true },
  { key: 'anio',          label: 'Año',            defaultVisible: true },
  { key: 'tipoVehiculo',  label: 'Tipo',           defaultVisible: true },
  { key: 'valorMercado',  label: 'Valor Mercado',  defaultVisible: true },
  { key: 'aseguradora',   label: 'Aseguradora',    defaultVisible: true },
  { key: 'fechaVencePoliza', label: 'Vence Póliza', defaultVisible: true },
  { key: 'activo',        label: 'Activo',         defaultVisible: true },
];

export default function VehiculosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('prestamista-vehiculos', COLS_DEF);

  const { data: resp, isLoading } = useQuery({
    queryKey: ['prestamista-vehiculos', search],
    queryFn: () => prestamistalApi.getVehiculos({ limit: 100, search: search || undefined }),
  });
  const vehiculos: any[] = (resp as any)?.data ?? [];

  const { data: alertas } = useQuery({
    queryKey: ['prestamista-alertas-seguro'],
    queryFn: prestamistalApi.alertasSeguro,
  });
  const totalAlertas = ((alertas as any)?.vencidas?.length ?? 0) + ((alertas as any)?.porVencer?.length ?? 0);

  const save = useMutation({
    mutationFn: (vals: any) => {
      const body = {
        ...vals,
        fechaVencePoliza: vals.fechaVencePoliza ? dayjs(vals.fechaVencePoliza).format('YYYY-MM-DD') : undefined,
      };
      return editing
        ? prestamistalApi.updateVehiculo(editing.id, body)
        : prestamistalApi.crearVehiculo(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-vehiculos'] });
      qc.invalidateQueries({ queryKey: ['prestamista-alertas-seguro'] });
      setOpen(false); form.resetFields(); setEditing(null);
      message.success(editing ? 'Vehículo actualizado' : 'Vehículo registrado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const openForm = (row?: any) => {
    setEditing(row ?? null);
    form.setFieldsValue(row ? {
      ...row,
      fechaVencePoliza: row.fechaVencePoliza ? dayjs(row.fechaVencePoliza) : undefined,
    } : { activo: true });
    setOpen(true);
  };

  const polizaEstado = (fecha: string | null) => {
    if (!fecha) return null;
    const dias = dayjs(fecha).diff(dayjs(), 'day');
    if (dias < 0) return <Tag color="red">Vencida hace {Math.abs(dias)}d</Tag>;
    if (dias <= 30) return <Tag color="orange">Vence en {dias}d</Tag>;
    return <Tag color="green">{fmtFecha(fecha)}</Tag>;
  };

  const cols = [
    { title: 'Placa', dataIndex: 'placa', key: 'placa', render: (v: string) => <b>{v ?? '—'}</b> },
    { title: 'Marca/Modelo', key: 'marca', render: (_: any, r: any) => `${r.marca ?? ''} ${r.modelo ?? ''}`.trim() || '—' },
    { title: 'Año', dataIndex: 'anio', key: 'anio', render: (v: any) => v ?? '—' },
    { title: 'Tipo', dataIndex: 'tipoVehiculo', key: 'tipoVehiculo', render: (v: string) => v ? <Tag>{v}</Tag> : '—' },
    { title: 'Valor Mercado', dataIndex: 'valorMercado', key: 'valorMercado', render: fmt },
    { title: 'Aseguradora', dataIndex: 'aseguradora', key: 'aseguradora', render: (v: string) => v ?? '—' },
    { title: 'Vence Póliza', dataIndex: 'fechaVencePoliza', key: 'fechaVencePoliza', render: (v: string) => polizaEstado(v) ?? '—' },
    { title: 'Activo', dataIndex: 'activo', key: 'activo', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
    {
      title: '', key: 'acc', width: 80,
      render: (_: any, r: any) => <Button size="small" onClick={() => openForm(r)}>Editar</Button>,
    },
  ];

  const exportar = () => {
    const filas = vehiculos.map((r: any) => ({
      'Placa': r.placa,
      'Chasis': r.chasis,
      'Marca': r.marca,
      'Modelo': r.modelo,
      'Año': r.anio,
      'Color': r.color,
      'Tipo': r.tipoVehiculo,
      'Valor Mercado': r.valorMercado,
      'Valor Factura': r.valorFactura,
      'Aseguradora': r.aseguradora,
      'Póliza': r.polizaSeguro,
      'Vence Póliza': r.fechaVencePoliza,
      'Activo': r.activo ? 'Sí' : 'No',
    }));
    exportarExcel(filas, `Vehiculos-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Car size={20} color={C.colorPrimary} />
          <h2 style={{ margin: 0, color: C.colorText }}>Vehículos Financiados</h2>
          {totalAlertas > 0 && (
            <Tooltip title={`${(alertas as any)?.vencidas?.length ?? 0} vencidas, ${(alertas as any)?.porVencer?.length ?? 0} por vencer`}>
              <Badge count={totalAlertas} style={{ backgroundColor: '#ff4d4f' }}>
                <AlertTriangle size={18} color="#ff4d4f" />
              </Badge>
            </Tooltip>
          )}
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['prestamista-vehiculos']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<Plus size={15} />} onClick={() => openForm()}>Nuevo Vehículo</Button>
        </div>
      </div>

      {totalAlertas > 0 && (
        <Alert
          type="warning"
          icon={<AlertTriangle size={16} />}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <span>
              {(alertas as any)?.vencidas?.length > 0 && (
                <b style={{ color: '#cf1322' }}>{(alertas as any).vencidas.length} póliza(s) de seguro vencida(s). </b>
              )}
              {(alertas as any)?.porVencer?.length > 0 && (
                <span>{(alertas as any).porVencer.length} póliza(s) vencen en los próximos 30 días.</span>
              )}
            </span>
          }
        />
      )}

      <Input.Search
        placeholder="Buscar por placa, chasis, marca o modelo..."
        allowClear
        style={{ marginBottom: 12, maxWidth: 400 }}
        onSearch={v => setSearch(v)}
        onChange={e => !e.target.value && setSearch('')}
      />

      <Table
        dataSource={vehiculos.map((r: any) => ({ ...r, key: r.id }))}
        columns={filterColumns(cols as any)}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />

      <Modal
        title={editing ? `Editar Vehículo — ${editing.placa ?? editing.chasis}` : 'Registrar Vehículo'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => save.mutate(v))}
        okText="Guardar"
        width={680}
        confirmLoading={save.isPending}
      >
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="placa" label="Placa">
              <Input placeholder="Ej. A123456" />
            </Form.Item>
            <Form.Item name="chasis" label="No. Chasis (VIN)">
              <Input placeholder="17 caracteres" />
            </Form.Item>
            <Form.Item name="motor" label="No. Motor">
              <Input />
            </Form.Item>
            <Form.Item name="tipoVehiculo" label="Tipo de Vehículo">
              <Select placeholder="Seleccionar">
                <Option value="sedan">Sedán</Option>
                <Option value="suv">SUV / Jeepeta</Option>
                <Option value="pickup">Pick-up</Option>
                <Option value="camion">Camión</Option>
                <Option value="moto">Motocicleta</Option>
                <Option value="otro">Otro</Option>
              </Select>
            </Form.Item>
            <Form.Item name="marca" label="Marca">
              <Input placeholder="Toyota, Honda, Ford..." />
            </Form.Item>
            <Form.Item name="modelo" label="Modelo">
              <Input placeholder="Corolla, Civic..." />
            </Form.Item>
            <Form.Item name="anio" label="Año">
              <InputNumber style={{ width: '100%' }} min={1980} max={new Date().getFullYear() + 1} />
            </Form.Item>
            <Form.Item name="color" label="Color">
              <Input />
            </Form.Item>
            <Form.Item name="valorMercado" label="Valor de Mercado (RD$)">
              <InputNumber style={{ width: '100%' }} prefix="RD$" min={0} />
            </Form.Item>
            <Form.Item name="valorFactura" label="Valor de Factura (RD$)">
              <InputNumber style={{ width: '100%' }} prefix="RD$" min={0} />
            </Form.Item>
            <Form.Item name="aseguradora" label="Aseguradora">
              <Input placeholder="Nombre de la aseguradora" />
            </Form.Item>
            <Form.Item name="polizaSeguro" label="No. de Póliza">
              <Input />
            </Form.Item>
            <Form.Item name="fechaVencePoliza" label="Vencimiento de Póliza">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            {editing && (
              <Form.Item name="activo" label="Estado">
                <Select>
                  <Option value={true}>Activo</Option>
                  <Option value={false}>Inactivo</Option>
                </Select>
              </Form.Item>
            )}
          </div>
        </Form>
      </Modal>
    </div>
  );
}
