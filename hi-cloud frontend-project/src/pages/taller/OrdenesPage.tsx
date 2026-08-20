import { useState } from 'react';
import {
  Card, Table, Button, Input, Select, DatePicker, Modal, Form,
  Tag, Space, Typography, message, Segmented, Checkbox,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EyeOutlined, ToolOutlined,
  UnorderedListOutlined, AppstoreOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tallerApi } from '../../api/taller.api';
import { fmt as fmtObj } from '../../utils/formatters';
const fmt = (v: any) => fmtObj.date(v);
import { useNavigate } from 'react-router-dom';
import { theme } from 'antd';
import dayjs from 'dayjs';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const COLS_DEF = [
  { key: 'numero', label: 'N°', defaultVisible: true },
  { key: 'v', label: 'Vehículo', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'prioridad', label: 'Prior.', defaultVisible: true },
  { key: 'tecnicoNombre', label: 'Técnico', defaultVisible: true },
  { key: 'total', label: 'Total', defaultVisible: true },
  { key: 'fechaIngreso', label: 'Ingreso', defaultVisible: false },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

const ESTADO_COLOR: Record<string, string> = {
  recibido: 'default', diagnostico: 'processing', aprobado: 'warning',
  en_proceso: 'blue', listo: 'success', entregado: 'green', cancelado: 'error',
};
const PRIORIDAD_COLOR: Record<string, string> = {
  baja: 'default', normal: 'blue', alta: 'orange', urgente: 'red',
};
const ESTADOS = ['recibido','diagnostico','aprobado','en_proceso','listo','entregado','cancelado'];

function KanbanView({ data, onView }: { data: any[]; onView: (id: number) => void }) {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, minHeight: 300 }}>
      {ESTADOS.filter(e => !['entregado','cancelado'].includes(e)).map(est => {
        const items = data.filter(o => o.estado === est);
        return (
          <div key={est} style={{
            minWidth: 220, flex: '0 0 220px',
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            padding: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <Tag color={ESTADO_COLOR[est]} style={{ margin: 0 }}>{est.toUpperCase().replace('_', ' ')}</Tag>
              <Text type="secondary">{items.length}</Text>
            </div>
            {items.map(o => (
              <Card
                key={o.id}
                size="small"
                style={{ marginBottom: 8, cursor: 'pointer' }}
                onClick={() => onView(o.id)}
                hoverable
              >
                <Text strong style={{ fontSize: 12 }}>{o.numero}</Text>
                <br />
                <Text style={{ fontSize: 11 }}>{o.placa} — {o.marca} {o.modelo}</Text>
                <br />
                {o.tecnicoNombre && <Text type="secondary" style={{ fontSize: 10 }}>{o.tecnicoNombre}</Text>}
                <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <Tag color={PRIORIDAD_COLOR[o.prioridad] ?? 'default'} style={{ margin: 0, fontSize: 10 }}>
                    {o.prioridad?.toUpperCase()}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    RD$ {Number(o.total ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })}
                  </Text>
                </div>
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function OrdenesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<string | undefined>();
  const [fechas, setFechas] = useState<[string, string] | null>(null);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [placaBusq, setPlacaBusq] = useState('');
  const [vehiculoInfo, setVehiculoInfo] = useState<any>(null);
  const [buscandoV, setBuscandoV] = useState(false);
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('taller-ordenes', COLS_DEF);

  const { data, isLoading } = useQuery({
    queryKey: ['taller-ordenes', page, search, estado, fechas],
    queryFn: () => tallerApi.ordenes({
      page, limit: 50, search: search || undefined, estado,
      desde: fechas?.[0], hasta: fechas?.[1],
    }),
  });

  const { data: tecnicos = [] } = useQuery({
    queryKey: ['taller-tecnicos'],
    queryFn: tallerApi.tecnicos,
  });

  const crearOrden = useMutation({
    mutationFn: (vals: any) => tallerApi.crearOrden(vals),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['taller-ordenes'] });
      message.success(`Orden ${res.numero} creada`);
      setModalOpen(false);
      form.resetFields();
      setPlacaBusq(''); setVehiculoInfo(null);
      navigate(`/taller/ordenes/${res.id}`);
    },
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'Error al crear orden'),
  });

  const buscarVehiculo = async (placa: string) => {
    const p = placa.trim().toUpperCase();
    if (!p) return;
    setBuscandoV(true);
    try {
      const v = await tallerApi.buscarPlaca(p);
      setVehiculoInfo(v);
      form.setFieldValue('vehiculoId', v.id);
    } catch {
      setVehiculoInfo(null);
      form.setFieldValue('vehiculoId', undefined);
      message.warning(`No se encontró vehículo con placa "${p}"`);
    } finally { setBuscandoV(false); }
  };

  const allOrdenes = data?.data ?? [];

  const columns = [
    { title: 'N°', dataIndex: 'numero', key: 'numero', width: 110 },
    {
      title: 'Vehículo', key: 'v',
      render: (r: any) => <><Tag color="blue">{r.placa}</Tag> {r.marca} {r.modelo} {r.anio ?? ''}</>,
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado',
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.toUpperCase().replace('_', ' ')}</Tag>,
    },
    {
      title: 'Prior.', dataIndex: 'prioridad', key: 'prioridad', width: 90,
      render: (v: string) => <Tag color={PRIORIDAD_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
    },
    { title: 'Técnico', dataIndex: 'tecnicoNombre', key: 'tecnicoNombre', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'Total', dataIndex: 'total', key: 'total',
      render: (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
    { title: 'Ingreso', dataIndex: 'fechaIngreso', key: 'fechaIngreso', width: 110, render: (v: any) => fmt(v) },
    {
      title: '', key: 'acc', width: 60,
      render: (_: any, r: any) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/taller/ordenes/${r.id}`)} />
      ),
    },
  ];

  const exportar = () => {
    const filas = allOrdenes.map((r: any) => ({
      'N°': r.numero,
      'Placa': r.placa,
      'Marca': r.marca,
      'Modelo': r.modelo,
      'Estado': r.estado,
      'Prioridad': r.prioridad,
      'Técnico': r.tecnicoNombre ?? '',
      'Total': r.total ?? 0,
      'Ingreso': r.fechaIngreso ?? '',
    }));
    exportarExcel(filas, `Ordenes-Taller-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}><ToolOutlined style={{ marginRight: 8 }} />Órdenes de Servicio</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Segmented
            value={view}
            onChange={v => setView(v as any)}
            options={[
              { value: 'list', icon: <UnorderedListOutlined /> },
              { value: 'kanban', icon: <AppstoreOutlined /> },
            ]}
          />
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['taller-ordenes']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Nueva Orden
          </Button>
        </div>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="Buscar por N°, placa, marca..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 260 }}
            allowClear
          />
          <Select
            placeholder="Estado"
            allowClear
            value={estado}
            onChange={v => { setEstado(v); setPage(1); }}
            style={{ width: 150 }}
          >
            {ESTADOS.map(e => (
              <Select.Option key={e} value={e}>
                <Tag color={ESTADO_COLOR[e]}>{e.toUpperCase().replace('_', ' ')}</Tag>
              </Select.Option>
            ))}
          </Select>
          <RangePicker
            onChange={vals => {
              setFechas(vals ? [vals[0]!.format('YYYY-MM-DD'), vals[1]!.format('YYYY-MM-DD')] : null);
              setPage(1);
            }}
          />
        </Space>

        {view === 'list' ? (
          <Table
            dataSource={allOrdenes}
            columns={filterColumns(columns as any)}
            rowKey="id"
            loading={isLoading}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{
              current: page,
              pageSize: 10,
              total: data?.total ?? 0,
              onChange: setPage,
              showTotal: (t) => `${t} órdenes`,
            }}
          />
        ) : (
          <KanbanView data={allOrdenes} onView={(id) => navigate(`/taller/ordenes/${id}`)} />
        )}
      </Card>

      {/* Modal nueva orden */}
      <Modal
        title="Nueva Orden de Servicio"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setPlacaBusq(''); setVehiculoInfo(null); }}
        onOk={() => form.validateFields().then(vals => crearOrden.mutate({
          ...vals,
          fechaEstimadaEntrega: vals.fechaEstimadaEntrega ? dayjs(vals.fechaEstimadaEntrega).format('YYYY-MM-DD') : undefined,
        }))}
        confirmLoading={crearOrden.isPending}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {/* Búsqueda por placa — fuera del form, auto-rellena vehiculoId */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Placa del vehículo</label>
            <Input.Search
              value={placaBusq}
              onChange={e => { setPlacaBusq(e.target.value.toUpperCase()); setVehiculoInfo(null); form.setFieldValue('vehiculoId', undefined); }}
              onSearch={buscarVehiculo}
              onPressEnter={() => buscarVehiculo(placaBusq)}
              placeholder="Ej: A25311 — Enter para buscar"
              loading={buscandoV}
              enterButton="Buscar"
              style={{ textTransform: 'uppercase' }}
            />
            {vehiculoInfo && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, fontSize: 12 }}>
                ✅ <strong>{vehiculoInfo.marca} {vehiculoInfo.modelo} {vehiculoInfo.anio ?? ''}</strong>
                {vehiculoInfo.color ? ` — ${vehiculoInfo.color}` : ''}
                {vehiculoInfo.propietarioNombre ? ` | ${vehiculoInfo.propietarioNombre}` : ''}
              </div>
            )}
          </div>
          <Form.Item name="vehiculoId" label="ID Vehículo" rules={[{ required: true, message: 'Busca el vehículo por placa primero' }]} style={{ display: 'none' }}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="motivoIngreso" label="Motivo de ingreso" rules={[{ required: true, message: 'Requerido' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="tecnicoId" label="Técnico asignado">
              <Select allowClear placeholder="Seleccionar técnico">
                {(tecnicos as any[]).filter((t: any) => t.isActive).map((t: any) => (
                  <Select.Option key={t.id} value={t.id}>{t.nombre}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="prioridad" label="Prioridad" initialValue="normal">
              <Select>
                {['baja','normal','alta','urgente'].map(p => (
                  <Select.Option key={p} value={p}>
                    <Tag color={PRIORIDAD_COLOR[p]}>{p.toUpperCase()}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="kilometrajeIngreso" label="Km al ingreso">
              <Input type="number" />
            </Form.Item>
            <Form.Item name="fechaEstimadaEntrega" label="Entrega estimada">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="nivelCombustible" label="Nivel de combustible">
            <Select allowClear>
              {['vacío','1/4','1/2','3/4','lleno'].map(v => (
                <Select.Option key={v} value={v}>{v}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="diagnosticoInicial" label="Diagnóstico inicial">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Condición del vehículo al ingreso">
            <Space wrap>
              <Form.Item name="tieneRayones" valuePropName="checked" noStyle><Checkbox>Rayones</Checkbox></Form.Item>
              <Form.Item name="tieneGolpes" valuePropName="checked" noStyle><Checkbox>Golpes</Checkbox></Form.Item>
              <Form.Item name="tieneDocumentos" valuePropName="checked" noStyle><Checkbox>Documentos</Checkbox></Form.Item>
              <Form.Item name="tieneGato" valuePropName="checked" noStyle><Checkbox>Gato</Checkbox></Form.Item>
              <Form.Item name="tieneHerramientas" valuePropName="checked" noStyle><Checkbox>Herramientas</Checkbox></Form.Item>
            </Space>
          </Form.Item>
          <Form.Item name="observacionesIngreso" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

