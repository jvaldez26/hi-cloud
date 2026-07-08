import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import { exportarExcel } from '../../utils/exportExcel';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, Tabs, Avatar, Progress, Tooltip, Divider, theme, Skeleton,
} from 'antd';
import {
  TeamOutlined, PlusOutlined, TrophyOutlined, EditOutlined, FileExcelOutlined,
  DeleteOutlined, UserOutlined, BarChartOutlined, LinkOutlined,
  StarFilled, DollarOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

const COLORES_AVATAR = ['#1a56db','#059669','#7c3aed','#d97706','#dc2626','#0891b2'];

const CARGOS = [
  'Vendedor','Ejecutivo de Ventas','Representante Comercial',
  'Supervisor de Ventas','Gerente de Ventas',
];

export default function VendedoresPage() {
  const { token } = theme.useToken();
  const qc = useQueryClient();
  const hoy = dayjs();
  const [search,      setSearch]        = useState('');
  const [tabActiva, setTabActiva]       = useState('directorio');
  const [modalCrear,  setModalCrear]    = useState(false);
  const [editando,    setEditando]      = useState<any>(null);
  const [vendedorSel, setVendedorSel]   = useState<any>(null);
  const [mes,  setMes]  = useState(hoy.month() + 1);
  const [anio, setAnio] = useState(hoy.year());
  const [formCrear] = Form.useForm();

  const { data: resumen } = useQuery<any>({
    queryKey: ['vendedores-resumen'],
    queryFn: () => api.get('/vendedores/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: vendedores = [], isLoading } = useQuery<any[]>({
    queryKey: ['vendedores'],
    queryFn: () => api.get('/vendedores').then((r: any) => r.data?.data ?? r.data ?? []),
    staleTime: 30_000,
  });

  const vendedoresFiltrados = useMemo(() =>
    (vendedores ?? []).filter(v =>
      v.nombre?.toLowerCase().includes(search.toLowerCase()) ||
      v.codigo?.toLowerCase().includes(search.toLowerCase())
    ), [vendedores, search]);

  const { data: ranking = [] } = useQuery<any[]>({
    queryKey: ['vendedores-ranking', mes, anio],
    queryFn: () => api.get(`/vendedores/ranking?mes=${mes}&anio=${anio}`).then((r: any) => r.data?.data ?? r.data ?? []),
    enabled: tabActiva === 'ranking',
  });

  const { data: rendimiento } = useQuery<any>({
    queryKey: ['vendedor-rendimiento', vendedorSel?.id, mes, anio],
    queryFn: () => api.get(`/vendedores/${vendedorSel.id}/rendimiento?mes=${mes}&anio=${anio}`).then((r: any) => r.data?.data ?? r.data),
    enabled: !!vendedorSel?.id && tabActiva === 'rendimiento',
  });

  const { data: historial = [] } = useQuery<any[]>({
    queryKey: ['vendedor-historial', vendedorSel?.id],
    queryFn: () => api.get(`/vendedores/${vendedorSel.id}/historial`).then((r: any) => r.data?.data ?? r.data ?? []),
    enabled: !!vendedorSel?.id && tabActiva === 'rendimiento',
  });

  const { data: clientesVendedor = [] } = useQuery<any[]>({
    queryKey: ['vendedor-clientes', vendedorSel?.id],
    queryFn: () => api.get(`/vendedores/${vendedorSel.id}/clientes`).then((r: any) => r.data?.data ?? r.data ?? []),
    enabled: !!vendedorSel?.id && tabActiva === 'clientes',
  });

  // Usuarios del sistema para vincular al perfil vendedor (endpoint dedicado)
  const { data: usuariosSistema = [] } = useQuery<any[]>({
    queryKey: ['usuarios-sistema-select'],
    queryFn:  () => api.get('/caja/usuarios').then((r: any) => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });

  const crearActualizar = useMutation({
    mutationFn: (dto: any) => editando
      ? api.patch(`/vendedores/${editando.id}`, dto)
      : api.post('/vendedores', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendedores'] });
      qc.invalidateQueries({ queryKey: ['vendedores-resumen'] });
      setModalCrear(false);
      setEditando(null);
      formCrear.resetFields();
      message.success(editando ? 'Vendedor actualizado' : 'Vendedor creado');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/vendedores/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendedores'] }); message.success('Vendedor eliminado'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const desasignarCliente = useMutation({
    mutationFn: ({ vendId, cliId }: { vendId: number; cliId: number }) =>
      api.delete(`/vendedores/${vendId}/clientes/${cliId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendedor-clientes'] }); message.success('Cliente desasignado'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const abrirEditar = (v: any) => {
    setEditando(v);
    formCrear.setFieldsValue({ ...v, fechaIngreso: v.fechaIngreso ? dayjs(v.fechaIngreso) : undefined });
    setModalCrear(true);
  };

  const COLS_DEF = [
    { key: 'nombre',      label: 'Cliente',     defaultVisible: true  },
    { key: 'rncReceptor', label: 'RNC/Cédula',  defaultVisible: false },
    { key: 'email',       label: 'Email',        defaultVisible: true  },
    { key: 'telefono',    label: 'Teléfono',     defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('vendedores', COLS_DEF);

  const PERIODO_SELECTOR = (
    <Space wrap>
      <Select value={mes} onChange={setMes} style={{ width: 110 }}>
        {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
          .map((m, i) => <Option key={i+1} value={i+1}>{m}</Option>)}
      </Select>
      <Select value={anio} onChange={setAnio} style={{ width: 90 }}>
        {[hoy.year(), hoy.year()-1, hoy.year()-2].map(y => <Option key={y} value={y}>{y}</Option>)}
      </Select>
    </Space>
  );

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TeamOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Fuerza de Ventas</Title>
            <Text type="secondary">Gestión de vendedores · Rendimiento · Ranking · Clientes asignados</Text>
          </div>
        </div>
        <Space wrap>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = vendedores.map((v: any) => ({
              'Nombre':    v.nombre ?? '',
              'Teléfono':  v.telefono ?? '',
              'Email':     v.email ?? '',
              'Zona':      v.zona ?? '',
              'Meta Mes':  Number(v.metaMensual ?? 0),
              'Comisión %':Number(v.comisionPct ?? 0),
              'Estado':    v.isActive ? 'Activo' : 'Inactivo',
            }));
            exportarExcel(filas, 'Vendedores');
          }}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['vendedores']} />
            <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditando(null); formCrear.resetFields(); setModalCrear(true); }}>
            Nuevo Vendedor
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={tabActiva}
        onChange={k => { setTabActiva(k); if (k !== 'rendimiento' && k !== 'clientes') setVendedorSel(null); }}
        tabBarExtraContent={['ranking','rendimiento'].includes(tabActiva) ? PERIODO_SELECTOR : null}
        items={[
          {
            key: 'directorio',
            label: 'Directorio',
            children: (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Input
                    placeholder="Buscar por nombre o código..."
                    prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    allowClear
                    style={{ width: 260 }}
                  />
                </div>
              <Row gutter={[16, 16]}>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <Col xs={24} sm={12} lg={8} xl={6} key={`sk-${i}`}>
                    <Card bordered={false} style={{ borderRadius: 12 }}>
                      <Skeleton avatar active paragraph={{ rows: 3 }} />
                    </Card>
                  </Col>
                ))}
                {!isLoading && vendedoresFiltrados.map((v: any, idx: number) => (
                  <Col xs={24} sm={12} lg={8} xl={6} key={v.id}>
                    <Card
                      bordered={false}
                      style={{ borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}
                      actions={[
                        <Tooltip title="Rendimiento"><BarChartOutlined onClick={() => { setVendedorSel(v); setTabActiva('rendimiento'); }} /></Tooltip>,
                        <Tooltip title="Editar"><EditOutlined onClick={() => abrirEditar(v)} /></Tooltip>,
                        <Tooltip title="Clientes"><LinkOutlined onClick={() => { setVendedorSel(v); setTabActiva('clientes'); }} /></Tooltip>,
                        <Popconfirm title="¿Eliminar?" onConfirm={() => eliminar.mutate(v.id)}><DeleteOutlined style={{ color: '#ef4444' }} /></Popconfirm>,
                      ]}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <Avatar size={48} style={{ background: COLORES_AVATAR[idx % COLORES_AVATAR.length], fontSize: 18, fontWeight: 700 }}>
                          {v.nombre?.charAt(0)}
                        </Avatar>
                        <div>
                          <Text strong>{v.nombre}</Text>
                          <div><Tag style={{ fontSize: 10 }}>{v.codigo}</Tag></div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.8 }}>
                        {v.cargo   && <div><Text type="secondary">{v.cargo}</Text></div>}
                        {v.zona    && <div>📍 {v.zona}</div>}
                        {v.email   && <div>✉️ {v.email}</div>}
                        {v.telefono && <div>📱 {v.telefono}</div>}
                      </div>
                      <Divider style={{ margin: '10px 0' }} />
                      <Row justify="space-between">
                        <Col><Text type="secondary" style={{ fontSize: 11 }}>Comisión</Text><div><Text strong style={{ color: '#059669' }}>{v.comisionPct}%</Text></div></Col>
                        <Col><Text type="secondary" style={{ fontSize: 11 }}>Meta/Mes</Text><div><Text strong style={{ fontSize: 12 }}>{fmt(v.metaMensual)}</Text></div></Col>
                      </Row>
                    </Card>
                  </Col>
                ))}
                {!isLoading && vendedoresFiltrados.length === 0 && (
                  <Col span={24}><Card bordered={false} style={{ textAlign: 'center', padding: 48 }}>
                    <TeamOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                    <div style={{ marginTop: 16 }}><Text type="secondary">{search ? 'Sin resultados para la búsqueda.' : 'No hay vendedores registrados.'}</Text></div>
                  </Card></Col>
                )}
              </Row>
              </>
            ),
          },
          {
            key: 'ranking',
            label: <Space><TrophyOutlined />Ranking</Space>,
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={14}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Ranking de Ventas">
                    {ranking.map((v: any, i: number) => (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? ['#fbbf24','#94a3b8','#d97706'][i] : token.colorBorderSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: i < 3 ? '#fff' : token.colorText, flexShrink: 0 }}>
                          {i + 1}
                        </div>
                        <Avatar size={36} style={{ background: COLORES_AVATAR[i % COLORES_AVATAR.length], fontWeight: 700 }}>
                          {v.nombre?.charAt(0)}
                        </Avatar>
                        <div style={{ flex: 1 }}>
                          <Text strong>{v.nombre}</Text>
                          <div><Text type="secondary" style={{ fontSize: 11 }}>{v.zona ?? v.cargo ?? 'Sin zona'}</Text></div>
                          <Progress
                            percent={Math.min(v.pctLogrado, 100)}
                            size="small"
                            strokeColor={v.pctLogrado >= 100 ? '#059669' : v.pctLogrado >= 70 ? '#3b82f6' : '#d97706'}
                            format={() => `${v.pctLogrado}%`}
                          />
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 100 }}>
                          <div style={{ fontWeight: 700, color: '#1a56db', fontSize: 14 }}>{fmt(v.totalVentas)}</div>
                          <div style={{ fontSize: 11, color: '#059669' }}>Com: {fmt(v.comisionGenerada)}</div>
                        </div>
                      </div>
                    ))}
                    {ranking.length === 0 && <Text type="secondary">Sin datos de ventas para este período.</Text>}
                  </Card>
                </Col>
                <Col xs={24} lg={10}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Ventas por Vendedor">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={ranking.slice(0, 8)} layout="vertical" margin={{ left: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                        <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={80}
                          tickFormatter={v => v.split(' ')[0]} />
                        <RechartsTip formatter={(v: number) => [fmt(v), 'Ventas']} />
                        <Bar dataKey="totalVentas" fill="#1a56db" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'rendimiento',
            label: 'Rendimiento',
            children: (
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Card bordered={false} style={{ borderRadius: 12 }} extra={
                    <Select placeholder="Seleccionar vendedor" style={{ width: 200 }} value={vendedorSel?.id}
                      onChange={id => setVendedorSel(vendedores.find((v: any) => v.id === id))}>
                      {vendedores.map((v: any) => <Option key={v.id} value={v.id}>{v.nombre}</Option>)}
                    </Select>
                  }>
                    {!vendedorSel && <Text type="secondary">Selecciona un vendedor para ver su rendimiento.</Text>}
                    {vendedorSel && rendimiento && (
                      <>
                        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                          {[
                            { label: 'Ventas del Mes', value: fmt(rendimiento.totalVentas), color: '#1a56db' },
                            { label: 'Facturas',        value: rendimiento.cantidadFacturas, color: '#7c3aed' },
                            { label: 'Comisión',        value: fmt(rendimiento.comisionGenerada), color: '#059669' },
                            { label: '% Logrado',       value: `${rendimiento.pctLogrado}%`, color: rendimiento.pctLogrado >= 100 ? '#059669' : '#d97706' },
                          ].map(s => (
                            <Col xs={12} sm={6} key={s.label}>
                              <Card bordered={false} style={{ textAlign: 'center', borderRadius: 10, border: `1px solid ${token.colorBorderSecondary}` }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                                <Text type="secondary" style={{ fontSize: 12 }}>{s.label}</Text>
                              </Card>
                            </Col>
                          ))}
                        </Row>
                        <Progress
                          percent={Math.min(rendimiento.pctLogrado, 100)}
                          strokeColor={rendimiento.pctLogrado >= 100 ? '#059669' : '#1a56db'}
                          style={{ marginBottom: 8 }}
                          format={() => `${rendimiento.pctLogrado}% de ${fmt(rendimiento.vendedor.metaMensual)}`}
                        />
                        {historial.length > 0 && (
                          <div style={{ marginTop: 24 }}>
                            <Text strong style={{ display: 'block', marginBottom: 12 }}>Histórico 12 meses</Text>
                            <ResponsiveContainer width="100%" height={200}>
                              <LineChart data={historial}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                                <RechartsTip formatter={(v: number) => [fmt(v), 'Ventas']} />
                                <Line type="monotone" dataKey="totalVentas" stroke="#1a56db" strokeWidth={2} dot={{ r: 3 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'clientes',
            label: 'Clientes Asignados',
            children: (
              <Card bordered={false} style={{ borderRadius: 12 }}
                title={vendedorSel ? `Clientes de ${vendedorSel.nombre}` : 'Clientes Asignados'}
                extra={
                  <Select placeholder="Seleccionar vendedor" style={{ width: 200 }} value={vendedorSel?.id}
                    onChange={id => setVendedorSel(vendedores.find((v: any) => v.id === id))}>
                    {vendedores.map((v: any) => <Option key={v.id} value={v.id}>{v.nombre}</Option>)}
                  </Select>
                }
              >
                {!vendedorSel && <Text type="secondary">Selecciona un vendedor para ver sus clientes.</Text>}
                {vendedorSel && (
                  <Table
                    dataSource={clientesVendedor}
                    rowKey="id"
                    size="small"
        scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 15 }}
                    columns={filterColumns([
                      { title: 'Cliente', dataIndex: 'nombre', key: 'nombre', render: v => <Text strong>{v}</Text> },
                      { title: 'RNC/Cédula', dataIndex: 'rncReceptor', key: 'rncReceptor', render: (v, r: any) => v || r.rfc || '—' },
                      { title: 'Email', dataIndex: 'email', key: 'email', render: v => v || '—' },
                      { title: 'Teléfono', dataIndex: 'telefono', key: 'telefono', render: v => v || '—' },
                      { title: '', key: 'acciones', width: 72, align: 'right' as const,
                        render: (_: any, r: any) => (
                          <TableActions
                            onView={() => {}}
                            viewLabel="Ver cliente"
                            items={[
                              { key: 'desasignar', label: 'Desasignar', danger: true,
                                onClick: () => { if (window.confirm('¿Desasignar cliente?')) desasignarCliente.mutate({ vendId: vendedorSel.id, cliId: r.id }); } },
                            ]}
                          />
                        )},
                    ])}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* Modal Crear/Editar */}
      <Modal
        title={editando ? `Editar — ${editando.nombre}` : 'Nuevo Vendedor'}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); setEditando(null); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crearActualizar.isPending}
        okText={editando ? 'Actualizar' : 'Crear'}
        width={560}
      >
        <Form form={formCrear} layout="vertical"
          onFinish={v => crearActualizar.mutate({ ...v, fechaIngreso: v.fechaIngreso?.format('YYYY-MM-DD') })}>
          <Row gutter={12}>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre Completo" rules={[{ required: true }]}><Input placeholder="Juan García" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="cedula" label="Cédula"><Input placeholder="00100000000" maxLength={11} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="email" label="Email"><Input placeholder="vendedor@empresa.com" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="telefono" label="Teléfono"><Input placeholder="809-000-0000" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="cargo" label="Cargo" initialValue="Vendedor">
                <Select>{CARGOS.map(c => <Option key={c} value={c}>{c}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}><Form.Item name="zona" label="Zona / Territorio"><Input placeholder="Ej. Zona Norte, SDO" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="comisionPct" label="Comisión (%)" initialValue={5}><InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="metaMensual" label="Meta Mensual (RD$)"><InputNumber min={0} style={{ width: '100%' }} prefix="RD$" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fechaIngreso" label="Fecha Ingreso"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
          </Row>
          <Form.Item
            name="usuarioId"
            label="Usuario del sistema (opcional)"
            help="Al vincular un usuario, el nombre de este vendedor aparecerá en Caja Diaria y POS cuando ese usuario abra turno"
          >
            <Select
              allowClear
              showSearch
              placeholder="Sin usuario vinculado"
              optionFilterProp="label"
              options={usuariosSistema.map((u: any) => ({
                value: u.id,
                label: `${u.nombre ?? ''}${u.email ? ' — ' + u.email : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
