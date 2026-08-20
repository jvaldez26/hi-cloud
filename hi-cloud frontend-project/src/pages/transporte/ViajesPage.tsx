import React, { useState } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  DatePicker, Typography, message, InputNumber, Checkbox,
  Spin, Divider, Alert, Drawer, Descriptions, List,
} from 'antd';
import {
  PlusOutlined, EditOutlined, FileTextOutlined,
  CheckCircleOutlined, CarOutlined, ShoppingCartOutlined, MinusCircleOutlined,
  UserOutlined, CarryOutOutlined, TeamOutlined, DollarOutlined,
  FireOutlined, UnorderedListOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api, { extractList, extractData } from '../../api/client';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';

const { Title, Text } = Typography;
const { Option } = Select;

type GastoItem = { id?: number; descripcion: string; monto: number };

type Viaje = {
  id: number; numero: string; fecha: string; origen: string; destino: string;
  clienteId?: number; clienteNombre?: string; choferNombre?: string;
  vehiculoPlaca?: string; vehiculoMarca?: string; vehiculoModelo?: string; vehiculoDescripcion?: string;
  tarifa: string | number; estado: string; facturaId?: number; notas?: string;
  gastos?: GastoItem[];
};

type Chofer   = { id: number; nombre: string };
type Vehiculo = { id: number; placa: string; marca: string; modelo: string };
type Cliente  = { id: number; nombre: string; rfc?: string; razonSocial?: string };

type CombItem = {
  id: number; tipoCombustible: string; galones?: string; precioGalon?: string;
  total: string; estacion?: string; odometro?: string; notas?: string; fecha?: string;
};

type ConfirmState = {
  open:         boolean;
  loading:      boolean;
  viajes:       Viaje[];
  checkedKeys:  number[];
  lockedKeys:   number[];
  combustibles: Record<number, CombItem[]>;
};

const CONFIRM_CLOSED: ConfirmState = { open: false, loading: false, viajes: [], checkedKeys: [], lockedKeys: [], combustibles: {} };

async function fetchCombustiblesViajes(viajeIds: number[]): Promise<Record<number, CombItem[]>> {
  const results = await Promise.all(
    viajeIds.map(id =>
      api.get('/transporte/combustible', { params: { viajeId: id, limit: 50 } })
        .then(r => ({ id, items: (r.data?.data?.data ?? []) as CombItem[] }))
    )
  );
  return Object.fromEntries(results.map(r => [r.id, r.items]));
}

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
const TIPO_COMB_COLOR: Record<string, string> = { gasolina: 'orange', diesel: 'blue', gas: 'green' };

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
  const [viewId,        setViewId]        = useState<number | null>(null);
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

  // Detalle del viaje para el Drawer
  const { data: viajeDetail, isLoading: loadingDetail } = useQuery<Viaje>({
    queryKey: ['tr-viaje-detail', viewId],
    queryFn:  () => api.get(`/transporte/viajes/${viewId}`).then(extractData),
    enabled:  viewId !== null,
  });
  const { data: detailCombs = [] } = useQuery<CombItem[]>({
    queryKey: ['tr-viaje-combs', viewId],
    queryFn:  () => api.get('/transporte/combustible', { params: { viajeId: viewId, limit: 50 } })
                      .then(r => r.data?.data?.data ?? []),
    enabled:  viewId !== null,
  });

  const save = useMutation({
    mutationFn: (vals: any) => editing
      ? api.put(`/transporte/viajes/${editing.id}`, vals)
      : api.post('/transporte/viajes', vals),
    onSuccess: () => {
      message.success('Guardado');
      qc.invalidateQueries({ queryKey: ['tr-viajes'] });
      qc.invalidateQueries({ queryKey: ['transporte-dashboard'] });
      if (editing) {
        qc.invalidateQueries({ queryKey: ['tr-viaje-detail', editing.id] });
      }
      closeModal();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error al guardar'),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) =>
      api.put(`/transporte/viajes/${id}`, { estado }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['tr-viajes'] });
      qc.invalidateQueries({ queryKey: ['transporte-dashboard'] });
      qc.invalidateQueries({ queryKey: ['tr-viaje-detail', vars.id] });
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
      if (viewId) qc.invalidateQueries({ queryKey: ['tr-viaje-detail', viewId] });
      setConfirm(CONFIRM_CLOSED);
      setSelectedKeys([]);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error al facturar'),
  });

  function openNew()  { setEditing(null); form.resetFields(); setOpen(true); }
  function openEdit(v: Viaje) {
    setEditing(v);
    form.setFieldsValue({ ...v, tarifa: Number(v.tarifa), fecha: v.fecha ? dayjs(v.fecha) : undefined, gastos: v.gastos ?? [] });
    setOpen(true);
  }
  function closeModal() { setOpen(false); form.resetFields(); }
  function handleSubmit(vals: any) {
    save.mutate({ ...vals, fecha: vals.fecha ? vals.fecha.format('YYYY-MM-DD') : undefined });
  }

  async function abrirFacturar(viaje: Viaje) {
    setConfirm({ open: true, loading: true, viajes: [viaje], checkedKeys: [viaje.id], lockedKeys: [viaje.id], combustibles: {} });
    try {
      const todosViajes: Viaje[] = [viaje];
      if (viaje.clienteId) {
        const otros = await api.get('/transporte/viajes/facturables', {
          params: { clienteId: viaje.clienteId, excluirId: viaje.id },
        }).then(extractList) as Viaje[];
        todosViajes.push(...otros);
      }
      const ids = todosViajes.map(v => v.id);
      const combustibles = await fetchCombustiblesViajes(ids);
      const otrosIds = todosViajes.slice(1).map(v => v.id);
      setConfirm({
        open: true, loading: false,
        viajes:      todosViajes,
        checkedKeys: [viaje.id, ...otrosIds],
        lockedKeys:  [viaje.id],
        combustibles,
      });
    } catch {
      setConfirm(prev => ({ ...prev, loading: false }));
    }
  }

  async function abrirFacturarBatch() {
    const rows = result?.data?.filter(v => selectedKeys.includes(v.id)) ?? [];
    const clienteIds = [...new Set(rows.map(v => v.clienteId).filter(Boolean))];
    if (clienteIds.length > 1) {
      message.error('Todos los viajes seleccionados deben ser del mismo cliente');
      return;
    }
    setConfirm({ open: true, loading: true, viajes: rows, checkedKeys: selectedKeys, lockedKeys: selectedKeys, combustibles: {} });
    try {
      const combustibles = await fetchCombustiblesViajes(selectedKeys);
      setConfirm(prev => ({ ...prev, loading: false, combustibles }));
    } catch {
      setConfirm(prev => ({ ...prev, loading: false }));
    }
  }

  function toggleConfirmKey(id: number, checked: boolean) {
    if (confirm.lockedKeys.includes(id)) return;
    setConfirm(prev => ({
      ...prev,
      checkedKeys: checked ? [...prev.checkedKeys, id] : prev.checkedKeys.filter(k => k !== id),
    }));
  }

  const checkedViajes   = confirm.viajes.filter(v => confirm.checkedKeys.includes(v.id));
  const subtotalViajes  = checkedViajes.reduce((s, v) => s + Number(v.tarifa), 0);
  const subtotalComb    = checkedViajes.reduce((s, v) =>
    s + (confirm.combustibles[v.id] ?? []).reduce((cs, c) => cs + Number(c.total), 0), 0);
  const subtotalGastos  = checkedViajes.reduce((s, v) =>
    s + (v.gastos ?? []).reduce((gs, g) => gs + Number(g.monto), 0), 0);
  const total = subtotalViajes + subtotalComb + subtotalGastos;

  // Viaje visible en el Drawer (prefiere datos frescos del query, fallback a la lista)
  const drawerViaje: Viaje | undefined = viajeDetail ?? result?.data?.find(v => v.id === viewId);

  const columns = [
    {
      title: '#', dataIndex: 'numero', key: 'numero', width: 90,
      render: (v: string, r: Viaje) => (
        <Button
          type="link" size="small" style={{ padding: 0, fontWeight: 600 }}
          onClick={e => { e.stopPropagation(); setViewId(r.id); }}
        >
          {v}
        </Button>
      ),
    },
    { title: 'Fecha',  dataIndex: 'fecha',    key: 'fecha',    width: 110, render: (v: string) => v?.substring(0,10) },
    { title: 'Origen',  dataIndex: 'origen',  key: 'origen',  width: 180, ellipsis: true },
    { title: 'Destino', dataIndex: 'destino', key: 'destino', width: 180, ellipsis: true },
    { title: 'Cliente',  dataIndex: 'clienteNombre',       key: 'cliente',  width: 220, ellipsis: true, render: (v?: string) => v ?? '—' },
    { title: 'Chofer',   dataIndex: 'choferNombre',        key: 'chofer',   width: 180, ellipsis: true, render: (v?: string) => v ?? '—' },
    { title: 'Vehículo', dataIndex: 'vehiculoDescripcion', key: 'vehiculo', width: 160, ellipsis: true, render: (v?: string, r?: Viaje) => r?.vehiculoPlaca ? `${r.vehiculoPlaca} ${v ?? ''}` : '—' },
    {
      title: 'Tarifa', dataIndex: 'tarifa', key: 'tarifa', width: 120, align: 'right' as const,
      render: (v: string | number) => fmt(v),
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 130,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v.replace('_',' ').toUpperCase()}</Tag>,
    },
    {
      title: '', key: 'actions', width: 170,
      render: (_: any, r: Viaje) => (
        <Space size={4} onClick={e => e.stopPropagation()}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(r.id)} />
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

  // Totales del viaje en el drawer
  const drawerGastos   = drawerViaje?.gastos ?? [];
  const drawerSubViaje = Number(drawerViaje?.tarifa ?? 0);
  const drawerSubComb  = detailCombs.reduce((s, c) => s + Number(c.total), 0);
  const drawerSubGasto = drawerGastos.reduce((s, g) => s + Number(g.monto), 0);
  const drawerTotal    = drawerSubViaje + drawerSubComb + drawerSubGasto;

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
        scroll={{ x: 'max-content' }}
        onRow={r => ({ onClick: () => setViewId(r.id), style: { cursor: 'pointer' } })}
        pagination={{
          current:  page,
          pageSize: result?.limit ?? 10,
          total:    result?.total ?? 0,
          onChange: setPage,
          showTotal: (t) => `${t} viajes`,
        }}
      />

      {/* ── Drawer: visor de viaje ──────────────────────────────────────────── */}
      <Drawer
        open={viewId !== null}
        onClose={() => setViewId(null)}
        width={420}
        title={
          drawerViaje ? (
            <Space>
              <Text strong style={{ fontSize: 16 }}>{drawerViaje.numero}</Text>
              <Tag color={ESTADO_COLOR[drawerViaje.estado] ?? 'default'} style={{ margin: 0 }}>
                {drawerViaje.estado.replace('_', ' ').toUpperCase()}
              </Tag>
            </Space>
          ) : 'Detalle del Viaje'
        }
        extra={
          drawerViaje && !['facturado','cancelado'].includes(drawerViaje.estado) && (
            <Button
              size="small" icon={<EditOutlined />}
              onClick={() => { openEdit(drawerViaje); }}
            >
              Editar
            </Button>
          )
        }
        styles={{ body: { padding: '16px 20px' } }}
      >
        {(loadingDetail && !drawerViaje) ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}><Spin /></div>
        ) : drawerViaje ? (
          <>
            {/* Ruta destacada */}
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{drawerViaje.fecha?.substring(0,10)}</Text>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6 }}>
                <div style={{ textAlign: 'right' }}>
                  <Text strong style={{ fontSize: 15 }}>{drawerViaje.origen}</Text>
                </div>
                <div style={{ color: '#999', fontSize: 18 }}>→</div>
                <div style={{ textAlign: 'left' }}>
                  <Text strong style={{ fontSize: 15 }}>{drawerViaje.destino}</Text>
                </div>
              </div>
            </div>

            {/* Datos principales */}
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label={<Space size={4}><UserOutlined />Cliente</Space>}>
                {drawerViaje.clienteNombre ?? <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label={<Space size={4}><TeamOutlined />Chofer</Space>}>
                {drawerViaje.choferNombre ?? <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label={<Space size={4}><CarOutlined />Vehículo</Space>}>
                {drawerViaje.vehiculoPlaca
                  ? `${drawerViaje.vehiculoPlaca} · ${drawerViaje.vehiculoMarca ?? ''} ${drawerViaje.vehiculoModelo ?? ''}`.trim()
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label={<Space size={4}><DollarOutlined />Tarifa</Space>}>
                <Text strong style={{ color: '#16a34a' }}>{fmt(drawerViaje.tarifa)}</Text>
              </Descriptions.Item>
              {drawerViaje.notas && (
                <Descriptions.Item label="Notas">
                  <Text type="secondary" style={{ fontSize: 12 }}>{drawerViaje.notas}</Text>
                </Descriptions.Item>
              )}
              {drawerViaje.facturaId && (
                <Descriptions.Item label={<Space size={4}><FileTextOutlined />Factura</Space>}>
                  <Tag color="purple">ID #{drawerViaje.facturaId}</Tag>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Combustible */}
            {detailCombs.length > 0 && (
              <>
                <Divider orientation="left" style={{ margin: '12px 0 8px', fontSize: 13 }}>
                  <Space size={4}><FireOutlined style={{ color: '#f97316' }} />Combustible</Space>
                </Divider>
                <List
                  size="small"
                  dataSource={detailCombs}
                  renderItem={c => (
                    <List.Item style={{ padding: '6px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <Tag color={TIPO_COMB_COLOR[c.tipoCombustible] ?? 'default'} style={{ margin: 0, fontSize: 11 }}>
                          {c.tipoCombustible.toUpperCase()}
                        </Tag>
                        <div style={{ flex: 1, fontSize: 12 }}>
                          {c.galones ? <span>{Number(c.galones).toFixed(3)} gal</span> : null}
                          {c.precioGalon ? <Text type="secondary"> · {fmt(c.precioGalon)}/gal</Text> : null}
                          {c.estacion ? <Text type="secondary"> · {c.estacion}</Text> : null}
                        </div>
                        <Text strong style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{fmt(c.total)}</Text>
                      </div>
                    </List.Item>
                  )}
                />
              </>
            )}

            {/* Otros gastos */}
            {drawerGastos.length > 0 && (
              <>
                <Divider orientation="left" style={{ margin: '12px 0 8px', fontSize: 13 }}>
                  <Space size={4}><UnorderedListOutlined style={{ color: '#6366f1' }} />Otros Gastos</Space>
                </Divider>
                <List
                  size="small"
                  dataSource={drawerGastos}
                  renderItem={(g, i) => (
                    <List.Item key={i} style={{ padding: '6px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8 }}>
                        <Tag color="geekblue" style={{ margin: 0, fontSize: 11 }}>GASTO</Tag>
                        <Text style={{ flex: 1, fontSize: 12 }}>{g.descripcion}</Text>
                        <Text strong style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{fmt(g.monto)}</Text>
                      </div>
                    </List.Item>
                  )}
                />
              </>
            )}

            {/* Resumen total */}
            {(detailCombs.length > 0 || drawerGastos.length > 0) && (
              <>
                <Divider style={{ margin: '12px 0 8px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>Servicio:&nbsp;</Text><Text style={{ fontSize: 12 }}>{fmt(drawerSubViaje)}</Text></div>
                  {drawerSubComb > 0 && <div><Text type="secondary" style={{ fontSize: 12 }}>Combustible:&nbsp;</Text><Text style={{ fontSize: 12 }}>{fmt(drawerSubComb)}</Text></div>}
                  {drawerSubGasto > 0 && <div><Text type="secondary" style={{ fontSize: 12 }}>Gastos:&nbsp;</Text><Text style={{ fontSize: 12 }}>{fmt(drawerSubGasto)}</Text></div>}
                  <div style={{ marginTop: 4 }}>
                    <Text strong>Total:&nbsp;</Text>
                    <Text strong style={{ fontSize: 16, color: '#16a34a' }}>{fmt(drawerTotal)}</Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Exento de ITBIS</Text>
                </div>
              </>
            )}

            {/* Acciones */}
            {!['facturado','cancelado'].includes(drawerViaje.estado) && (
              <>
                <Divider style={{ margin: '16px 0 12px' }} />
                <Space wrap>
                  {drawerViaje.estado === 'programado' && (
                    <Button icon={<CarOutlined />} onClick={() => cambiarEstado.mutate({ id: drawerViaje.id, estado: 'en_curso' })}>
                      Iniciar viaje
                    </Button>
                  )}
                  {drawerViaje.estado === 'en_curso' && (
                    <Button type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => cambiarEstado.mutate({ id: drawerViaje.id, estado: 'completado' })}>
                      Marcar completado
                    </Button>
                  )}
                  {drawerViaje.estado === 'completado' && (
                    <Button type="primary" icon={<FileTextOutlined />} onClick={() => { abrirFacturar(drawerViaje); }}>
                      Facturar
                    </Button>
                  )}
                  <Button icon={<CarryOutOutlined />} onClick={() => cambiarEstado.mutate({ id: drawerViaje.id, estado: 'cancelado' })} danger>
                    Cancelar viaje
                  </Button>
                </Space>
              </>
            )}
          </>
        ) : null}
      </Drawer>

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
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
              {confirm.viajes.map(v => {
                const combs  = confirm.combustibles[v.id] ?? [];
                const gastos = v.gastos ?? [];
                const checked = confirm.checkedKeys.includes(v.id);
                const hasSubitems = combs.length > 0 || gastos.length > 0;
                return (
                  <div key={v.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: hasSubitems ? 'none' : '1px solid #f0f0f0' }}>
                      <Checkbox
                        checked={checked}
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
                    {combs.map((c, i) => (
                      <div key={`c-${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 28px', background: '#fafafa', borderBottom: i === combs.length - 1 && gastos.length === 0 ? '1px solid #f0f0f0' : 'none' }}>
                        <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>{c.tipoCombustible.toUpperCase()}</Tag>
                        <Text type="secondary" style={{ flex: 1, fontSize: 12 }}>
                          Combustible{c.galones ? ` — ${Number(c.galones).toFixed(3)} gal` : ''}{c.estacion ? ` · ${c.estacion}` : ''}
                        </Text>
                        <Text style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(c.total)}</Text>
                      </div>
                    ))}
                    {gastos.map((g, i) => (
                      <div key={`g-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 28px', background: '#fafafa', borderBottom: i === gastos.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                        <Tag color="geekblue" style={{ margin: 0, fontSize: 11 }}>GASTO</Tag>
                        <Text type="secondary" style={{ flex: 1, fontSize: 12 }}>{g.descripcion}</Text>
                        <Text style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(g.monto)}</Text>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {(subtotalComb > 0 || subtotalGastos > 0) && (
                <>
                  <div><Text type="secondary">Servicios de transporte:&nbsp;</Text><Text>{fmt(subtotalViajes)}</Text></div>
                  {subtotalComb > 0 && <div><Text type="secondary">Combustible:&nbsp;</Text><Text>{fmt(subtotalComb)}</Text></div>}
                  {subtotalGastos > 0 && <div><Text type="secondary">Otros gastos:&nbsp;</Text><Text>{fmt(subtotalGastos)}</Text></div>}
                </>
              )}
              <div><Text type="secondary" style={{ fontSize: 12 }}>Exento de ITBIS</Text></div>
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

          <Divider orientation="left" style={{ marginBottom: 8, fontSize: 13 }}>Otros Gastos</Divider>
          <Form.List name="gastos">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 6 }} align="baseline">
                    <Form.Item {...rest} name={[name, 'descripcion']} rules={[{ required: true, message: 'Descripción requerida' }]} style={{ flex: 1, marginBottom: 0, minWidth: 220 }}>
                      <Input placeholder="Descripción del gasto" />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'monto']} rules={[{ required: true, message: 'Monto requerido' }]} style={{ marginBottom: 0 }}>
                      <InputNumber min={0} precision={2} prefix="RD$" style={{ width: 130 }} placeholder="0.00" />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f', cursor: 'pointer' }} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} size="small">
                  Agregar gasto
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}

