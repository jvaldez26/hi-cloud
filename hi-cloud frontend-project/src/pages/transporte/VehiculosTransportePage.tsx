import { useState } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  DatePicker, Typography, Popconfirm, message, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TruckOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api, { extractList } from '../../api/client';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';

const { Title } = Typography;
const { Option } = Select;

type Vehiculo = {
  id: number; placa: string; marca: string; modelo: string; anio?: number;
  tipo: string; color?: string; capacidad?: string; estado: string;
  choferId?: number; choferNombre?: string;
  seguroVencimiento?: string; marbeteVencimiento?: string; inspeccionVencimiento?: string;
  notas?: string;
};

type Chofer = { id: number; nombre: string };

async function fetchVehiculos(): Promise<Vehiculo[]>  { return api.get('/transporte/vehiculos').then(extractList); }
async function fetchChoferes(): Promise<Chofer[]>      { return api.get('/transporte/choferes').then(extractList); }

const ESTADO_COLOR: Record<string, string> = {
  operativo:       'green',
  mantenimiento:   'orange',
  fuera_servicio:  'red',
};

function daysToExp(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function VencimientoTag({ label, date }: { label: string; date?: string }) {
  if (!date) return null;
  const days = daysToExp(date)!;
  const color = days < 0 ? 'red' : days <= 15 ? 'orange' : 'default';
  if (color === 'default') return null;
  return (
    <Tooltip title={`${label}: ${days < 0 ? `vencido hace ${-days}d` : `vence en ${days}d`}`}>
      <WarningOutlined style={{ color: color === 'red' ? '#dc2626' : '#d97706', marginLeft: 4 }} />
    </Tooltip>
  );
}

const COLS_DEF = [
  { key: 'placa',      label: 'Placa'     },
  { key: 'vehiculo',   label: 'Vehículo'  },
  { key: 'tipo',       label: 'Tipo',      defaultVisible: false },
  { key: 'estado',     label: 'Estado'    },
  { key: 'chofer',     label: 'Chofer'    },
  { key: 'capacidad',  label: 'Capacidad', defaultVisible: false },
];

export default function VehiculosTransportePage() {
  const qc = useQueryClient();
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Vehiculo | null>(null);
  const [form]                = Form.useForm();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('tr-vehiculos', COLS_DEF);

  const { data: vehiculos = [], isLoading } = useQuery({ queryKey: ['tr-vehiculos'], queryFn: fetchVehiculos });
  const { data: choferes  = []           } = useQuery({ queryKey: ['tr-choferes'],  queryFn: fetchChoferes  });

  const save = useMutation({
    mutationFn: (vals: any) => editing
      ? api.put(`/transporte/vehiculos/${editing.id}`, vals)
      : api.post('/transporte/vehiculos', vals),
    onSuccess: () => { message.success('Guardado'); qc.invalidateQueries({ queryKey: ['tr-vehiculos'] }); closeModal(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error al guardar'),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/transporte/vehiculos/${id}`),
    onSuccess: () => { message.success('Eliminado'); qc.invalidateQueries({ queryKey: ['tr-vehiculos'] }); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error al eliminar'),
  });

  function openNew()    { setEditing(null); form.resetFields(); setOpen(true); }
  function openEdit(v: Vehiculo) {
    setEditing(v);
    form.setFieldsValue({
      ...v,
      seguroVencimiento:     v.seguroVencimiento     ? dayjs(v.seguroVencimiento)     : undefined,
      marbeteVencimiento:    v.marbeteVencimiento     ? dayjs(v.marbeteVencimiento)    : undefined,
      inspeccionVencimiento: v.inspeccionVencimiento ? dayjs(v.inspeccionVencimiento) : undefined,
    });
    setOpen(true);
  }
  function closeModal() { setOpen(false); form.resetFields(); }

  function handleSubmit(vals: any) {
    const payload = {
      ...vals,
      seguroVencimiento:     vals.seguroVencimiento     ? vals.seguroVencimiento.format('YYYY-MM-DD')     : undefined,
      marbeteVencimiento:    vals.marbeteVencimiento     ? vals.marbeteVencimiento.format('YYYY-MM-DD')    : undefined,
      inspeccionVencimiento: vals.inspeccionVencimiento ? vals.inspeccionVencimiento.format('YYYY-MM-DD') : undefined,
    };
    save.mutate(payload);
  }

  const columns = [
    { title: 'Placa',  dataIndex: 'placa',  key: 'placa',  render: (v: string, r: Vehiculo) => (
      <Space>
        <strong>{v}</strong>
        <VencimientoTag label="Seguro"     date={r.seguroVencimiento} />
        <VencimientoTag label="Marbete"    date={r.marbeteVencimiento} />
        <VencimientoTag label="Inspección" date={r.inspeccionVencimiento} />
      </Space>
    )},
    { title: 'Vehículo', key: 'vehiculo', render: (_: any, r: Vehiculo) => `${r.marca} ${r.modelo}${r.anio ? ` (${r.anio})` : ''}` },
    { title: 'Tipo',   dataIndex: 'tipo',   key: 'tipo',   render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v.replace('_',' ').toUpperCase()}</Tag> },
    { title: 'Chofer', dataIndex: 'choferNombre', key: 'chofer', render: (v?: string) => v ?? <em style={{ color: '#9ca3af' }}>Sin asignar</em> },
    { title: 'Capacidad', dataIndex: 'capacidad', key: 'capacidad' },
    {
      title: '', key: 'actions', width: 80,
      render: (_: any, r: Vehiculo) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="¿Eliminar vehículo?" onConfirm={() => del.mutate(r.id)} okText="Sí">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }} align="center" wrap>
        <Title level={3} style={{ margin: 0 }}><TruckOutlined /> Vehículos</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo Vehículo</Button>
        <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
      </Space>

      <Table
        dataSource={vehiculos}
        columns={filterColumns(columns)}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        open={open}
        title={editing ? 'Editar Vehículo' : 'Nuevo Vehículo'}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="placa"  label="Placa"  rules={[{ required: true, message: 'Requerido' }]}>
            <Input placeholder="ABC-123" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="marca"  label="Marca"  rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="modelo" label="Modelo" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="anio"   label="Año"    style={{ flex: 1 }}>
              <Input type="number" />
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="tipo"  label="Tipo" initialValue="camion" style={{ flex: 1 }}>
              <Select>
                {['camion','furgon','van','carro','pickup','bus','moto'].map(t => (
                  <Option key={t} value={t}>{t.toUpperCase()}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="color"    label="Color"    style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="capacidad" label="Capacidad" style={{ flex: 1 }}><Input placeholder="ej: 5 toneladas" /></Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="estado" label="Estado" initialValue="operativo" style={{ flex: 1 }}>
              <Select>
                <Option value="operativo">Operativo</Option>
                <Option value="mantenimiento">En Mantenimiento</Option>
                <Option value="fuera_servicio">Fuera de Servicio</Option>
              </Select>
            </Form.Item>
            <Form.Item name="choferId" label="Chofer Asignado" style={{ flex: 2 }}>
              <Select allowClear placeholder="Sin asignar" showSearch optionFilterProp="children">
                {choferes.map(c => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
              </Select>
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="seguroVencimiento"     label="Venc. Seguro"     style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="marbeteVencimiento"    label="Venc. Marbete"    style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="inspeccionVencimiento" label="Venc. Inspección" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </Space.Compact>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

