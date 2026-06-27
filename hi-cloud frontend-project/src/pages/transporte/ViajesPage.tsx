import React, { useState } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  DatePicker, Typography, message, InputNumber, Checkbox,
  Spin, Divider, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, FileTextOutlined,
  CheckCircleOutlined, CarOutlined, ShoppingCartOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api, { extractList } from '../../api/client';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';

const { Title, Text } = Typography;
const { Option } = Select;

type Viaje = {
  id: number; numero: string; fecha: string; origen: string; destino: string;
  clienteId?: number; clienteNombre?: string; choferNombre?: string;
  vehiculoPlaca?: string; vehiculoDescripcion?: string;
  tarifa: string | number; estado: string; facturaId?: number; notas?: string;
};

type Chofer   = { id: number; nombre: string };
type Vehiculo = { id: number; placa: string; marca: string; modelo: string };
type Cliente  = { id: number; nombre: string; rfc?: string; razonSocial?: string };

type ConfirmState = {
  open:        boolean;
  loading:     boolean;
  viajes:      Viaje[];
  checkedKeys: number[];
  lockedKeys:  number[];
};

const CONFIRM_CLOSED: ConfirmState = { open: false, loading: false, viajes: [], checkedKeys: [], lockedKeys: [] };

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
  programado: 'blue', en_curso: 'orange', completado: 'green',
  cancelado: 'red',   facturado: 'purple',
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

function fmt(n: string | number) {
  return `RD$${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

export default function ViajesPage() {
  const qc = useQueryClient();
  const [open,          setOpen]          = useState(false);
  const [editing,       setEditing]       = useState<Viaje | null>(null);
  const [estadoFilt,    setEstadoFilt]    = useState<string | undefined>(undefined);
  const [page,          setPage]          = useState(1);
  const [clienteSearch, setClienteSearch] = useState('');
  const [selectedKeys,  setSelectedKeys]  = useState<number[]>([]);
  const [confirm,       setConfirm]       = useState<ConfirmState>(CONFIRM_CLOSED);
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

  const facturarLote = useMutation({
    mutationFn: (ids: number[]) => api.post('/transporte/viajes/facturar-lote', { ids }),
    onSuccess: (res: any) => {
      const num = res.data?.data?.numero ?? res.data?.numero ?? '';
      message.success(`Factura generada${num ? ` — #${num}` : ''}`);
      qc.invalidateQueries({ queryKey: ['tr-viajes'] });
      qc.invalidateQueries({ queryKey: ['transporte-dashboard'] });
      setConfirm(CONFIRM_CLOSED);
      setSelectedKeys([]);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error al facturar'),
  });

  function openNew()  { setEditing(null);  form.resetFields(); setOpen(true); }
  function openEdit(v: Viaje) {
    setEditing(v);
    form.setFieldsValue({ ...v, tarifa: Number(v.tarifa), fecha: v.fecha ? dayjs(v.fecha) : undefined });
    setOpen(true);
  }
  function closeModal() { setOpen(false); form.resetFields(); }
  function handleSubmit(vals: any) {
    save.mutate({ ...vals, fecha: vals.fecha ? vals.fecha.format('YYYY-MM-DD') : undefined });
  }

  async function abrirFacturar(viaje: Viaje) {
    setConfirm({ open: true, loading: true, viajes: [viaje], checkedKeys: [viaje.id], lockedKeys: [viaje.id] });
    try {
      if (viaje.clienteId) {
        const otros = await api.get('/transporte/viajes/facturables', {
          params: { clienteId: viaje.clienteId, excluirId: viaje.id },
        }).then(extractList) as Viaje[];
        const otrosIds = otros.map((v) => v.id);
        setConfirm({
          open: true,
          loading: false,
          viajes:      [viaje, ...otros],
          checkedKeys: [viaje.id, ...otrosIds],
          lockedKeys:  [viaje.id],
        });
      } else {
        setConfirm(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setConfirm(prev => ({ ...prev, loading: false }));
    }
  }

  function abrirFacturarBatch() {
    const rows = result?.data?.filter(v => selectedKeys.includes(v.id)) ?? [];
    const clienteIds = [...new Set(rows.map(v => v.clienteId).filter(Boolean))];
    if (clienteIds.length > 1) {
      message.error('Todos los viajes seleccionados deben ser del mismo cliente');
      return;
    }
    setConfirm({ open: true, loading: false, viajes: rows, checkedKeys: selectedKeys, lockedKeys: selectedKeys });
  }

  function toggleConfirmKey(id: number, checked: boolean) {
    if (confirm.lockedKeys.includes(id)) return;
    setConfirm(prev => ({
      ...prev,
      checkedKeys: checked ? [...prev.checkedKeys, id] : prev.checkedKeys.filter(k => k !== id),
    }));
  }

  const checkedViajes = confirm.viajes.filter(v => confirm.checkedKeys.includes(v.id));
  const total = checkedViajes.reduce((s, v) => s + Number(v.tarifa), 0);

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
      render: (v: string | number) => fmt(v),
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
            <Button size="small" type="primary" icon={<FileTextOutlined />} onClick={() => abrirFacturar(r)}>
              Facturar
            </Button>
          )}
          {!['facturado','cancelado'].includes(r.estado) && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          )}
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys: selectedKeys,
    onChange: (keys: React.Key[]) => setSelectedKeys(keys as number[]),
    getCheckboxProps: (r: Viaje) => ({ disabled: r.estado !== 'completado' }),
  };

  const selectedTotal = (result?.data ?? [])
    .filter(v => selectedKeys.includes(v.id))
    .reduce((s, v) => s + Number(v.tarifa), 0);

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

      {selectedKeys.length > 0 && (
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          message={
            <Space>
              <Text>{selectedKeys.length} viaje(s) seleccionado(s) · {fmt(selectedTotal)}</Text>
              <Button
                type="primary" size="small" icon={<ShoppingCartOutlined />}
                onClick={abrirFacturarBatch}
              >
                Facturar seleccionados
              </Button>
              <Button size="small" onClick={() => setSelectedKeys([])}>Limpiar</Button>
            </Space>
          }
        />
      )}

      <Table
        dataSource={result?.data ?? []}
        columns={filterColumns(columns)}
        rowKey="id"
        rowSelection={rowSelection}
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

      {/* Modal confirmación facturación */}
      <Modal
        open={confirm.open}
        title="Confirmar Facturación"
        onCancel={() => setConfirm(CONFIRM_CLOSED)}
        onOk={() => facturarLote.mutate(confirm.checkedKeys)}
        okText="Generar Factura"
        confirmLoading={facturarLote.isPending}
        okButtonProps={{ disabled: confirm.checkedKeys.length === 0 }}
        width={560}
      >
        {confirm.loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="Buscando otros viajes..." /></div>
        ) : (
          <>
            {confirm.viajes.length > 1 && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                Se detectaron {confirm.viajes.length} viaje(s) del mismo cliente. Desmarca los que no quieras incluir.
              </Text>
            )}
            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 12 }}>
              {confirm.viajes.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <Checkbox
                    checked={confirm.checkedKeys.includes(v.id)}
                    disabled={confirm.lockedKeys.includes(v.id)}
                    onChange={e => toggleConfirmKey(v.id, e.target.checked)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 13 }}>{v.numero}</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{v.fecha?.substring(0,10)}</Text>
                    <div style={{ fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.origen} → {v.destino}
                    </div>
                  </div>
                  <Text strong style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{fmt(v.tarifa)}</Text>
                </div>
              ))}
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Exento de ITBIS (transporte)</Text></div>
              <div style={{ fontSize: 16 }}>
                <Text strong>Total:&nbsp;</Text>
                <Text strong style={{ fontSize: 18 }}>{fmt(total)}</Text>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Modal crear/editar viaje */}
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
            <Form.Item name="fecha" label="Fecha" style={{ flex: 1 }}>
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
              allowClear showSearch placeholder="Buscar cliente por nombre o RNC..."
              filterOption={false} onSearch={val => setClienteSearch(val)}
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
