import { useState } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  DatePicker, Typography, Popconfirm, message, InputNumber,
} from 'antd';
import {
  PlusOutlined, EditOutlined, FileTextOutlined,
  CheckCircleOutlined, CarOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api, { extractList } from '../../api/client';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';

const { Title } = Typography;
const { Option } = Select;

type Viaje = {
  id: number; numero: string; fecha: string; origen: string; destino: string;
  clienteNombre?: string; choferNombre?: string; vehiculoPlaca?: string;
  vehiculoDescripcion?: string; tarifa: string | number; estado: string;
  facturaId?: number; notas?: string;
};

type Chofer   = { id: number; nombre: string };
type Vehiculo = { id: number; placa: string; marca: string; modelo: string };
type Cliente  = { id: number; nombre: string; rfc?: string; razonSocial?: string };

async function fetchViajes(page: number, estado?: string) {
  const params: Record<string, any> = { page, limit: 50 };
  if (estado) params.estado = estado;
  const r = await api.get('/transporte/viajes', { params });
  return r.data?.data as { data: Viaje[]; total: number; page: number; limit: number };
}
async function fetchChoferes(): Promise<Chofer[]>   { return api.get('/transporte/choferes').then(extractList); }
async function fetchVehiculos(): Promise<Vehiculo[]> { return api.get('/transporte/vehiculos').then(extractList); }
async function fetchClientes(search: string): Promise<Cliente[]> {
  return api.get('/clientes', { params: { search, limit: 50 } }).then(extractList);
}

const ESTADO_COLOR: Record<string, string> = {
  programado:  'blue',
  en_curso:    'orange',
  completado:  'green',
  cancelado:   'red',
  facturado:   'purple',
};

const COLS_DEF = [
  { key: 'numero',   label: '#'        },
  { key: 'fecha',    label: 'Fecha'    },
  { key: 'origen',   label: 'Origen'   },
  { key: 'destino',  label: 'Destino'  },
  { key: 'cliente',  label: 'Cliente'  },
  { key: 'chofer',   label: 'Chofer',   defaultVisible: false },
  { key: 'vehiculo', label: 'Vehículo', defaultVisible: false },
  { key: 'tarifa',   label: 'Tarifa'   },
  { key: 'estado',   label: 'Estado'   },
];

export default function ViajesPage() {
  const qc = useQueryClient();
  const [open,          setOpen]          = useState(false);
  const [editing,       setEditing]       = useState<Viaje | null>(null);
  const [estadoFilt,    setEstadoFilt]    = useState<string | undefined>(undefined);
  const [page,          setPage]          = useState(1);
  const [clienteSearch, setClienteSearch] = useState('');
  const [form]                            = Form.useForm();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('tr-viajes', COLS_DEF);

  const { data: result, isLoading } = useQuery({
    queryKey: ['tr-viajes', page, estadoFilt],
    queryFn:  () => fetchViajes(page, estadoFilt),
  });

  const { data: choferes  = [] } = useQuery({ queryKey: ['tr-choferes'],  queryFn: fetchChoferes  });
  const { data: vehiculos = [] } = useQuery({ queryKey: ['tr-vehiculos'], queryFn: fetchVehiculos });
  const { data: clientes  = [] } = useQuery({
    queryKey: ['clientes-search', clienteSearch],
    queryFn:  () => fetchClientes(clienteSearch),
  });

  const save = useMutation({
    mutationFn: (vals: any) => editing
      ? api.put(`/transporte/viajes/${editing.id}`, vals)
      : api.post('/transporte/viajes', vals),
    onSuccess: () => {
      message.success('Guardado');
      qc.invalidateQueries({ queryKey: ['tr-viajes'] });
      qc.invalidateQueries({ queryKey: ['transporte-dashboard'] });
      closeModal();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error al guardar'),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) =>
      api.put(`/transporte/viajes/${id}`, { estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tr-viajes'] });
      qc.invalidateQueries({ queryKey: ['transporte-dashboard'] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const facturar = useMutation({
    mutationFn: (id: number) => api.post(`/transporte/viajes/${id}/facturar`),
    onSuccess: (res: any) => {
      message.success(`Viaje facturado — Factura #${res.data?.factura?.numero ?? ''}`);
      qc.invalidateQueries({ queryKey: ['tr-viajes'] });
      qc.invalidateQueries({ queryKey: ['transporte-dashboard'] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error al facturar'),
  });

  function openNew()  { setEditing(null);  form.resetFields(); setOpen(true); }
  function openEdit(v: Viaje) {
    setEditing(v);
    form.setFieldsValue({
      ...v,
      tarifa: Number(v.tarifa),
      fecha:  v.fecha ? dayjs(v.fecha) : undefined,
    });
    setOpen(true);
  }
  function closeModal() { setOpen(false); form.resetFields(); }

  function handleSubmit(vals: any) {
    save.mutate({ ...vals, fecha: vals.fecha ? vals.fecha.format('YYYY-MM-DD') : undefined });
  }

  const columns = [
    { title: '#',      dataIndex: 'numero',   key: 'numero',   width: 90 },
    { title: 'Fecha',  dataIndex: 'fecha',    key: 'fecha',    width: 110, render: (v: string) => v?.substring(0,10) },
    { title: 'Origen', dataIndex: 'origen',   key: 'origen'   },
    { title: 'Destino', dataIndex: 'destino', key: 'destino'  },
    { title: 'Cliente',  dataIndex: 'clienteNombre',    key: 'cliente',  render: (v?: string) => v ?? '—' },
    { title: 'Chofer',   dataIndex: 'choferNombre',     key: 'chofer',   render: (v?: string) => v ?? '—' },
    { title: 'Vehículo', dataIndex: 'vehiculoDescripcion', key: 'vehiculo', render: (v?: string, r?: Viaje) => r?.vehiculoPlaca ? `${r.vehiculoPlaca} ${v ?? ''}` : '—' },
    {
      title: 'Tarifa', dataIndex: 'tarifa', key: 'tarifa', align: 'right' as const,
      render: (v: string | number) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado',
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v.replace('_',' ').toUpperCase()}</Tag>,
    },
    {
      title: '', key: 'actions', width: 180,
      render: (_: any, r: Viaje) => (
        <Space size={4}>
          {r.estado === 'programado' && (
            <Button size="small" icon={<CarOutlined />} onClick={() => cambiarEstado.mutate({ id: r.id, estado: 'en_curso' })}>
              Iniciar
            </Button>
          )}
          {r.estado === 'en_curso' && (
            <Button size="small" type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => cambiarEstado.mutate({ id: r.id, estado: 'completado' })}>
              Completar
            </Button>
          )}
          {r.estado === 'completado' && (
            <Popconfirm title="¿Facturar este viaje?" onConfirm={() => facturar.mutate(r.id)} okText="Sí">
              <Button size="small" type="primary" icon={<FileTextOutlined />}>Facturar</Button>
            </Popconfirm>
          )}
          {!['facturado','cancelado'].includes(r.estado) && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }} align="center" wrap>
        <Title level={3} style={{ margin: 0 }}>Viajes</Title>
        <Select
          allowClear placeholder="Todos los estados" style={{ width: 180 }}
          value={estadoFilt}
          onChange={v => { setEstadoFilt(v); setPage(1); }}
        >
          {['programado','en_curso','completado','cancelado','facturado'].map(e => (
            <Option key={e} value={e}><Tag color={ESTADO_COLOR[e]}>{e.replace('_',' ').toUpperCase()}</Tag></Option>
          ))}
        </Select>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo Viaje</Button>
        <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
      </Space>

      <Table
        dataSource={result?.data ?? []}
        columns={filterColumns(columns)}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{
          current:  page,
          pageSize: result?.limit ?? 50,
          total:    result?.total ?? 0,
          onChange: setPage,
          showTotal: (t) => `${t} viajes`,
        }}
      />

      <Modal
        open={open}
        title={editing ? `Editar Viaje ${editing.numero}` : 'Nuevo Viaje'}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="fecha"  label="Fecha"  style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="origen"  label="Origen"  rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="Ciudad / Dirección de partida" />
            </Form.Item>
            <Form.Item name="destino" label="Destino" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="Ciudad / Dirección de llegada" />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="clienteId" label="Cliente">
            <Select
              allowClear
              showSearch
              placeholder="Buscar cliente por nombre o RNC..."
              filterOption={false}
              onSearch={val => setClienteSearch(val)}
              optionFilterProp="label"
            >
              {(clientes as Cliente[]).map(c => (
                <Option key={c.id} value={c.id} label={`${c.nombre} ${c.rfc ?? ''}`}>
                  {c.nombre}{c.rfc ? ` · ${c.rfc}` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="choferId" label="Chofer" style={{ flex: 1 }}>
              <Select allowClear placeholder="Seleccionar chofer" showSearch optionFilterProp="children">
                {choferes.map(c => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="vehiculoId" label="Vehículo" style={{ flex: 1 }}>
              <Select allowClear placeholder="Seleccionar vehículo" showSearch optionFilterProp="children">
                {vehiculos.map(v => <Option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</Option>)}
              </Select>
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="tarifa" label="Tarifa (RD$)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="estado" label="Estado" initialValue="programado" style={{ flex: 1 }}>
              <Select>
                <Option value="programado">Programado</Option>
                <Option value="en_curso">En Curso</Option>
                <Option value="completado">Completado</Option>
                <Option value="cancelado">Cancelado</Option>
              </Select>
            </Form.Item>
          </Space.Compact>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
